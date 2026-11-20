# SIG & GEOTECH AI — MANUAL DE OPERACIÓN Y PRODUCCIÓN (RUNBOOK)

**Plataforma:** ECOINTELLIGENCE — Módulo SIG & GEOTECH AI (1.0 → 4.1)  
**Estado:** `PRODUCTION READY / GO-LIVE`  
**Audiencia:** SRE, DevOps, Administradores de Sistemas, Ingeniería Geoespacial

---

## 1. Topología de Servicios y Puertos

| Servicio | Puerto por Defecto | Responsabilidad | Ruta Principal |
| :--- | :---: | :--- | :--- |
| **ECOINTELLIGENCE Web & API** (`Node.js / Express + Vite`) | `3000` | Interfaz React SPA, APIs `/api/geotech/*`, RBAC multitenant, seguridad HTTP, proxy autenticado hacia Worker, gestión de snapshots SHA-256 | `/server.ts` |
| **Geospatial Worker** (`FastAPI / Uvicorn + GDAL/PROJ/GEOS/PDAL`) | `8081` | Conversión binaria `.gpkg`, `.parquet`, `.gdb.zip`, `.shp`, `.gml`, compresión/descompresión `.laz`, inspección científica NetCDF4/HDF5, consultas PostGIS | `/services/gdal-worker/main.py` |
| **Base de Datos Espacial** (`PostgreSQL 18.6 + PostGIS 3.6.2`) | `5432` | Almacenamiento espacial particionado por `organization_id`, índices GiST, geometrías 2D/3D (`GeometryZ`), versionamiento | `/services/gdal-worker/postgis_schema.sql` |
| **Persistencia de Aplicación & Objetos** (`DATA_DIR`) | N/A (Disco) | Base documental atómica (`db.json` + `.bak.json`), almacén de objetos SHA-256 (`geotech_objects/`) y snapshots (`system_snapshots/`) | `/src/server/database.ts` |

---

## 2. Matriz de Entornos y Variables de Configuración

**Regla estricta de secretos:** Nunca incluya valores reales de `GEOSPATIAL_WORKER_TOKEN`, `POSTGIS_DSN` ni `GEMINI_API_KEY` en repositorios, documentación, tickets o capturas. Use gestores de secretos (Cloud Secret Manager, Vault, Kubernetes Secrets) o `.env` local con permisos `chmod 600`.

| Variable | `development` | `staging` / `production` | Propósito |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` / `APP_ENV` | `development` | `production` | Activa cabeceras `HSTS`, desactiva resets de laboratorio y aplica política estricta de orígenes |
| `PORT` | `3000` | `3000` (o puerto detrás de Ingress) | Puerto de escucha HTTP del servidor Node.js |
| `ALLOWED_ORIGINS` | Vacío (permite localhost) | Lista separada por comas (`https://sig.miempresa.com`) | Lista blanca CORS y validación CSRF por cabecera `Origin` en `/api/*` |
| `ALLOW_LAB_RESET` | `true` (solo si se requiere reset lab) | **`false`** (Obligatorio) | Bloquea `POST /api/system/reset-seed` con HTTP `403` incluso para rol `admin` |
| `GEOSPATIAL_WORKER_URL` | `http://127.0.0.1:8081` | URL privada HTTPS o red interna Docker/K8s | Endpoint base del Worker GDAL/PDAL/PostGIS |
| `GEOSPATIAL_WORKER_TOKEN` | Secreto aleatorio local ≥32 bytes hex | Secreto fuerte rotado por Vault/KMS | Token Bearer compartido validado en tiempo constante (`hmac.compare_digest`) |
| `WORKER_TIMEOUT_MS` | `15000` | `15000`–`30000` | Timeout de puente HTTP por `AbortController` |
| `POSTGIS_DSN` | DSN hacia PostgreSQL/PostGIS local | DSN TLS privado (`sslmode=require`) | Conexión de Worker y utilidad de backups espaciales |
| `PG_DUMP_BIN` / `PSQL_BIN` | `/opt/geo-env/bin/pg_dump` / `psql` | Binarios `pg_dump` / `psql` en host o contenedor | Respaldo y restauración lógica SQL espacial en snapshots |
| `MAX_SYSTEM_BACKUPS` | `10` | `10`–`30` | Retención rotativa automática de snapshots completos |
| `GEMINI_API_KEY` | Opcional | Secreto opcional para IA generativa | Habilita enriquecimiento textual manteniendo validadores determinísticos |

### Verificación Pre-Despliegue en Producción (`Go-Live Gate`)
1. Confirmar `NODE_ENV=production` y `ALLOW_LAB_RESET=false`.
2. Confirmar `ALLOWED_ORIGINS` configurado explícitamente con los dominios HTTPS productivos.
3. Verificar `npm run build` (`vite build`) y `npm run lint` (`tsc --noEmit`) sin errores.
4. Ejecutar batería unitaria `npx --yes tsx --test src/utils/*.test.ts` (100% pass).
5. Comprobar que `/readyz` retorna HTTP `200` con `"ready": true`.

---

## 3. Sondas de Salud y Ciclo de Arranque / Parada

### 3.1 Endpoints de Sonda (Kubernetes / Load Balancer)
- **Liveness (`GET /healthz`)**: Retorna HTTP `200` mientras el proceso Node.js responde (`{"ok":true,"env":...}`). No depende de servicios externos para evitar bucles de reinicio en cascada.
- **Readiness (`GET /readyz`)**: Evalúa escritura en `DATA_DIR`, conectividad real del Worker (`/health` + `/ready`) y estado de PostgreSQL/PostGIS. Retorna:
  - **HTTP `200`** (`ready: true`, `status: "ready"`) cuando almacenamiento, Worker y PostGIS están operativos.
  - **HTTP `503`** (`ready: false`, `status: "degraded"`) cuando el Worker configurado no responde o PostGIS está caído (retira el nodo del balanceador automáticamente).
- **Worker Readiness (`GET http://<worker>:8081/ready`)**: Sonda pública sin exposición de secretos; retorna HTTP `200` si `WORKER_AUTH_TOKEN` y `PostGIS` están disponibles, o HTTP `503` si falla la base espacial o falta token.

### 3.2 Arranque Ordenado
1. Iniciar PostgreSQL + PostGIS y verificar con `pg_isready -h 127.0.0.1 -p 5432`.
2. Iniciar Worker FastAPI/Uvicorn (`uvicorn main:app --host 127.0.0.1 --port 8081 --app-dir services/gdal-worker`) con variables de entorno cargadas.
3. Iniciar ECOINTELLIGENCE (`npm run build && npm start` en producción o `npm run dev` en desarrollo).

### 3.3 Parada Segura (*Graceful Shutdown*)
El servidor Node.js intercepta `SIGTERM` y `SIGINT`:
1. Persiste inmediatamente el estado en memoria de `Database` de forma atómica (`archivo temporal → renameSync`).
2. Cierra el servidor HTTP drenando solicitudes en curso antes de salir (`process.exit(0)`).

---

## 4. Centro de Alertas GeoOps Center — Playbook de Respuesta a Incidentes

Las alertas se evalúan en tiempo real mediante `GET /api/geotech/infra-telemetry` y `GET /api/geotech/observability` (y son visibles en **Infra & Auditoría → GeoOps Center**):

| Código Alerta | Severidad | Umbral / Condición | Diagnóstico y Acción Correctiva |
| :--- | :---: | :--- | :--- |
| **`WORKER_DOWN`** | **CRITICAL** | `GEOSPATIAL_WORKER_URL` configurada pero healthcheck HTTP falla / timeout | 1. Revisar logs de `gdal-worker` / Uvicorn.<br>2. Validar red y puerto `8081`.<br>3. Reiniciar servicio Worker y verificar `/readyz` == `200`. |
| **`POSTGIS_DOWN`** | **CRITICAL** | `POSTGIS_DSN` configurada pero `SELECT PostGIS_Version()` falla | 1. Ejecutar `pg_ctl status` y `pg_isready`.<br>2. Revisar disco/logs de PostgreSQL (`pg.log`).<br>3. Reiniciar clúster PostgreSQL y verificar reconexión. |
| **`HIGH_ERROR_RATE`** | **CRITICAL / WARN** | Tasa de errores HTTP GeoAPI ≥ `15%` (Crit) o ≥ `5%` (Warn) sobre ≥5 peticiones | 1. Filtrar logs estructurados por `x-trace-id` y `status >= 400`.<br>2. Verificar archivos corruptos, permisos RBAC o caídas intermitentes del Worker. |
| **`HIGH_MEMORY`** | **CRITICAL / WARN** | Heap/RSS Node.js ≥ `1400 MB` (Crit) o ≥ `900 MB` (Warn) | 1. Usar botón **Invalidar Caché Proyecto** en GeoOps Center.<br>2. Verificar subida de rásteres/nubes muy grandes; escalar RAM del contenedor si el volumen lo justifica. |
| **`QUEUE_SATURATED`** | **WARN / CRITICAL** | Trabajos batch activos ≥ `5` (Warn) o ≥ `10` (Crit) | 1. Inspeccionar trabajos en cola (`GET /api/geotech/worker/jobs`).<br>2. Cancelar lotes obsoletos o escalar réplicas del Worker. |
| **`LOW_STORAGE`** | **CRITICAL / WARN** | Espacio libre en `DATA_DIR` < `512 MB` (Crit) o < `2048 MB` (Warn) | 1. Ejecutar limpieza TTL de artefactos (`POST /api/geotech/worker/cleanup`).<br>2. Purgar snapshots antiguos manteniendo los últimos `MAX_SYSTEM_BACKUPS`. |
| **`STALLED_JOBS`** | **WARN** | Trabajos en estado `running` sin actualización > `120 s` | 1. Cancelar trabajo atascado (`POST /api/geotech/worker/jobs/:id/cancel`).<br>2. Reanudar desde último checkpoint (`POST /api/geotech/worker/jobs/:id/resume`). |
| **`HIGH_LATENCY`** | **WARN** | Latencia promedio GeoAPI > `1500 ms` | 1. Evaluar contención I/O de disco/PostGIS.<br>2. Revisar uso de índices GiST (`EXPLAIN ANALYZE`) y caché LRU ráster. |

---

## 5. Respaldos, Recuperación ante Desastres y Rotación de Secretos

### 5.1 Snapshots Completos del Sistema (DB + PostGIS + SHA-256)
- **Creación desde API (requiere rol `admin`/`editor`):** `POST /api/geotech/system-backups/create`
  - Escribe copia atómica de `data/db.json`.
  - Si `POSTGIS_DSN` y `pg_dump` están activos, genera `postgis_dump.sql` consistente (`--clean --if-exists --no-owner`).
  - Calcula `SHA-256` sobre `db.json` y `postgis_dump.sql`, registrando `manifest.json` y aplicando rotación automática (`MAX_SYSTEM_BACKUPS`).
- **Listados:** `GET /api/geotech/system-backups`
- **Restauración Verificada (requiere rol `admin`):** `POST /api/geotech/system-backups/:id/restore`
  - Verifica obligatoriamente la integridad criptográfica **SHA-256** antes de tocar archivos activos; aborta si el hash no coincide.
  - Restaura `data/db.json` mediante reemplazo atómico en caliente y recarga el estado en memoria.
  - Si existe `postgis_dump.sql`, ejecuta `psql -v ON_ERROR_STOP=1` contra `POSTGIS_DSN`.
- **Resiliencia ante corrupción accidental:** Si `data/db.json` queda dañado al arranque, `Database` recupera automáticamente desde `data/backups/db_latest.bak.json`.

### 5.2 Backups por Proyecto (S3-Local Object Store) & `TEST Y`
- `POST /api/geotech/backups/create` almacena el paquete JSON del proyecto en `data/geotech_objects/<org>/` con hash `SHA-256`.
- `POST /api/geotech/recovery-test-y` ejecuta una prueba automatizada no destructiva (*Backup → Corrupción simulada `-9999` → Restore → Verificación `hashBefore === hashRestored`*).

### 5.3 Rotación del Token Bearer (`GEOSPATIAL_WORKER_TOKEN`)
1. Generar un nuevo token criptográfico (`openssl rand -hex 32`) en el entorno del operador.
2. Actualizar `WORKER_AUTH_TOKEN` en el servicio Worker y reiniciar Worker (en HA, soportar ventana de doble token o drenaje por `/readyz`).
3. Actualizar `GEOSPATIAL_WORKER_TOKEN` en ECOINTELLIGENCE y reiniciar servidor.
4. Verificar `GET /readyz` (`200`) y `POST /api/geotech/worker/inspect` (`CONECTADO`).

---

## 6. Seguridad, Controles de Carga y Troubleshooting

- **Cabeceras de Seguridad Activas:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Content-Security-Policy`, y `Strict-Transport-Security` en `production`. `X-Powered-By` deshabilitado.
- **Límites de Ingesta & Seguridad de Archivos:**
  - Bloqueo por *magic bytes* ante ejecutables (`MZ`/`ELF`), binarios multimedia camuflados bajo extensiones de texto SIG, *path traversal* (`../`), ZIP bombs (`ratio > 100x`) y cabeceras corruptas en `.las`/`.laz`/`.gpkg`/`.tif`.
  - Límite de carga en Worker: `MAX_UPLOAD_MB=150` (retorna HTTP `413`).
- **Rate Limiting:**
  - `/api/auth/login`: máx. `40` intentos/minuto por IP (`HTTP 429`).
  - `/api/geotech/ogc/*`: máx. `90` solicitudes/minuto por tenant (`HTTP 429` + cabecera `Retry-After`).
  - `/api/geotech/worker/*`: máx. `60` solicitudes/minuto por tenant (`HTTP 429`).
- **Errores comunes y solución rápida:**
  - *Error `403 Origen no permitido`:* Agregue el dominio exacto HTTPS en `ALLOWED_ORIGINS` y reinicie.
  - *Error `403 Operación bloqueada en entorno de producción` al resetear seed:* Comportamiento esperado de seguridad. Nunca active `ALLOW_LAB_RESET=true` en datos reales de clientes.
  - *Error `502/503` al exportar `.gpkg` o cargar `.laz`:* Verifique que el Worker esté en línea (`GET /readyz`) y consulte `GeoOps Center`.
