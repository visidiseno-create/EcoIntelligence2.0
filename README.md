# ECOINTELLIGENCE — Plataforma Empresarial de Gestión y Análisis Ambiental

Plataforma tecnológica de gestión, inteligencia y análisis ambiental para empresas e industrias (SaaS B2B).
Cumplimiento normativo ISO 14001, monitoreo de vectores ambientales (residuos, agua, aire, energía), inspecciones en terreno, acciones correctivas (CAPA), biblioteca documental y motor determinístico de consultas sin alucinaciones.

---

## 1. Arquitectura Técnica

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Motion.
- **Backend**: Node.js, Express, TypeScript (`server.ts`) con integración de Vite en middleware dev.
- **Persistencia**: Base de datos relacional simulando migraciones 001–038 con persistencia de archivos en disco (`data/db.json`) y restauración de datos de laboratorio.
- **Inteligencia Ambiental**: Motor determinístico de consultas relacionales contrastadas directamente contra la base de datos de la organización activa, citando tablas origen, límites legales y recomendaciones técnicas.
- **Seguridad & RBAC**: Aislamiento estricto multitenant por organización y control de acceso basado en roles (Administrador, Auditor Líder, Operador de Planta, Lector Ejecutivo).

---

## 2. Manual de Instalación y Ejecución

### Requisitos Previos
- Node.js versión 20 o superior.
- Gestor de paquetes `npm` (o `bun`).

### Pasos de Instalación
```bash
# 1. Clonar o extraer el proyecto
cd ecoinntelligence

# 2. Instalar dependencias
npm install

# 3. Ejecutar suite de pruebas unitarias
npm test

# 4. Iniciar servidor full-stack (Backend Express + Frontend Vite)
npm run dev
```

El servidor estará disponible inmediatamente en `http://localhost:3000`.

---

## 3. Credenciales de Laboratorio (Perfiles RBAC)

La plataforma cuenta con 4 usuarios preconfigurados accesibles con 1 solo clic en el selector de roles o modal de autenticación:

| Usuario | Correo Electrónico | Rol | Permisos |
| :--- | :--- | :--- | :--- |
| **Ing. Valeria Mendoza** | `admin@ecoinntelligence.com` | Administrador Ambiental | Acceso total a configuración, sedes, matriz legal y planes. |
| **Dr. Roberto Santillán** | `auditor@ecoinntelligence.com` | Auditor Líder | Ejecución de inspecciones en campo y formulación de hallazgos. |
| **Tec. Carlos Paredes** | `operador@ecoinntelligence.com` | Operador de Planta | Registro técnico de residuos, agua, aire y energía. |
| **Lic. Andrea Benavides** | `lector@ecoinntelligence.com` | Lector Directivo | Visualización ejecutiva de métricas e informes (solo lectura). |

---

## 4. Estructura de Módulos Implementados

1. **Dashboard Ejecutivo**: KPIs calculados matemáticamente desde la base de datos (cumplimiento legal %, residuos totales kg, balance hídrico m³, energía kWh, huella tCO₂e), calendario de vencimientos próximos y estado de hallazgos.
2. **Cumplimiento Legal & Obligaciones**: Matriz de compromisos IGA, fuentes normativas, jurisdicciones, periodicidades, estados (cumplida, en progreso, pendiente, vencida), vinculación de evidencias y vista calendario.
3. **Gestión de Instalaciones**: Registro de plantas industriales, coordenadas GPS, códigos IGA aprobados y actividades productivas.
4. **Gestión de Residuos**: Registro por categorías (peligrosos, comunes, reciclables, orgánicos, RAEE), transportistas autorizados (EO-RS), manifiestos oficiales y tasa de valorización.
5. **Gestión del Agua**: Captación por fuentes (pozo, red, recirculada), efluentes vertidos, parámetros de vertimiento (DBO₅, DQO, pH) y conformidad con Límites Máximos Permisibles (LMP).
6. **Aire & Emisiones**: Monitoreo de chimeneas fijas, concentraciones de PM10, PM2.5, SO₂, NOx, CO, límites permisibles y alertas visuales de excedencia.
7. **Gestión Energética & Huella CO₂**: Consumo por red eléctrica, solar fotovoltaica, diésel y gas natural, con cálculo de factores de emisión GHG Protocol Alcance 1 y 2.
8. **Inspecciones en Campo**: Listas de verificación, ponderaciones, cálculo de puntaje y registro de hallazgos (No Conformidad Mayor, Menor, Oportunidad de Mejora).
9. **Acciones Correctivas (CAPA)**: Análisis causal de 5 Porqués, planes de remediación, asignación de responsables, plazos y verificación con evidencias de cierre.
10. **Biblioteca Documental**: Repositorio centralizado de Resoluciones Directorales, informes de ensayo acreditados ante INACAL y manifiestos con descarga de verificación.
11. **Analítica & Informes Oficiales**: Generación y formateo imprimible de Expediente Ambiental Ejecutivo en PDF con bloque de firmas técnicas y exportación a formato CSV.
12. **Asistente Inteligente (BD Verificada)**: Motor determinístico de consultas que analiza preguntas en lenguaje natural, extrae datos de la base de datos relacional y cita tablas normativas sin generar alucinaciones.
13. **Suscripción SaaS & Cuotas**: Estructura de monetización por suscripción (Starter Eco, Pro Compliance, Enterprise), barras de progreso de límites de cuota (sedes, usuarios, almacenamiento) y selector administrativo de plan.
14. **Trazabilidad & Auditoría**: Registro inmutable de eventos de seguridad con usuario, rol, timestamp y detalle para cumplimiento de auditorías ISO 14001.

---

## 5. Pruebas Automatizadas

El proyecto incluye pruebas determinísticas que verifican:
- Ratios de cumplimiento y detección de vencimientos.
- Agregación y segregación de masa de residuos y tasa de valorización.
- Balance volumétrico hídrico y tasa de recirculación.
- Evaluación de conformidad y excedencias en emisiones atmosféricas.
- Cálculo de intensidad energética y huella de carbono según GHG Protocol.
- Respuestas determinísticas del motor de consultas citando tablas exactas.

Ejecución de pruebas:
```bash
npm test
```
Resultado: **6/6 pruebas unitarias aprobadas**.
