# AUDITORÍA TÉCNICA INTEGRAL — SIG & GEOTECH AI 2.0 → 3.0

**Plataforma:** ECOINTELLIGENCE  
**Fecha de auditoría:** 2026-11-18  
**Alcance:** Inspección código por código del módulo SIG & GEOTECH AI 2.0 previo a la implementación de la fase 3.0.  
**Entorno verificado:** Node.js v22 (`tsx`), Express, Vite + React 19, TypeScript, `@turf/turf`, `proj4`, `geotiff`, `jszip`, `leaflet`, `three`, `@google/genai`, Python 3.11 (contenedor sin binarios C++ `gdal`, `pdal`, `qgis`, `grass`, ni motor `postgres/postgis` local activo).

---

## Criterios de Clasificación

- **A — Producción verificada:** Funciona realmente de extremo a extremo, persiste correctamente y cuenta con pruebas unitarias o de navegador verificadas.
- **B — Funcional pero limitada:** Funciona con matemática real, pero requiere mayor profundidad algorítmica, metadatos de precisión/incertidumbre, escalabilidad por lotes/streaming o ampliación funcional en 3.0.
- **C — Dependiente de infraestructura externa:** Depende de microservicio Docker (`/services/gdal-worker/` + `GEOSPATIAL_WORKER_URL`), PostGIS externo, red pública externa (STAC AWS) o secreto `GEMINI_API_KEY`.
- **D — Experimental:** Prototipo científico o heurístico válido como tamizaje, pero requiere mayor calibración/validación en laboratorio o campo.
- **E — Pendiente:** Capacidad nueva de nivel 3.0 aún inexistente en 2.0.

---

## Matriz Técnica Detallada (10 Atributos por Capacidad)

### 1. Motor Vectorial, Topología y Reproyección CRS
- **Capacidad:** 12 operaciones vectoriales (`buffer`, `clip`, `intersect`, `union`, `difference`, `dissolve`, `centroid`, `convex_hull`, `voronoi`, `spatial_join`, `select_by_attribute`, `select_by_location`) + reproyección entre 7 CRS (`EPSG:4326/3857/32717/32718/32719/24877/24878`).
- **Archivo responsable:** `src/utils/geotechEngine.ts`
- **Motor utilizado:** `@turf/turf` v7 + `proj4`
- **Entradas:** `GeoFeatureCollection` GeoJSON + parámetros de operación / códigos EPSG.
- **Salidas:** `GeoFeatureCollection` resultante + reporte topológico (`validateGeometryTopology`).
- **Precisión:** Geodésica/elipsoidal WGS84 y UTM estándar (`proj4`).
- **Limitaciones:** Ejecución monolítica en memoria sobre un único arreglo sin índice espacial R-tree ni procesamiento particionado por chunks para >100k–1M entidades; el validador topológico no computaba índice global de calidad (self-intersections detalladas, gaps/overlaps inter-polígono, duplicados exactos, atributos incompletos).
- **Pruebas:** `src/utils/geotechEngine.test.ts` (20 pruebas).
- **Dependencias:** `@turf/turf`, `proj4`.
- **Estado real:** **A — Producción verificada** (base vectorial) / **B** para escala masiva de 1M entidades y calidad integral.

### 2. Morfometría DEM, Geoestadística IDW, Moran's I y Gi*
- **Capacidad:** Pendiente Horn 3×3, Orientación, Hillshade, Curvatura laplaciana, Viewshed, Volumen Corte/Relleno, Perfil topográfico, IDW, Moran's I y Getis-Ord Gi*.
- **Archivo responsable:** `src/utils/geotechEngine.ts`
- **Motor utilizado:** TypeScript puro sobre matrices `DemGrid` en memoria.
- **Entradas:** `DemGrid` y capas puntuales con atributo numérico.
- **Salidas:** Grillas ráster `DemGrid`, perfiles de elevación y capas hotspot Gi*.
- **Precisión:** Adecuada a la resolución de celda del DEM; IDW no entregaba mapa paralelo de confianza/incertidumbre ni análisis de sensibilidad.
- **Limitaciones:** Sin envolvente estándar de precisión científica (método, CRS, resolución, datos fuente, advertencias) en la salida unificada.
- **Pruebas:** `src/utils/geotechEngine.test.ts`.
- **Dependencias:** Ninguna externa.
- **Estado real:** **A — Producción verificada**.

### 3. Motor Ráster 2.0 (Bloques, Pirámides, Álgebra Segura y Mosaico)
- **Capacidad:** Procesamiento por tiles (`tileSize`), pirámides multirresolución `2x`, analizador recursivo de álgebra de mapas sin `eval()`, mosaico multigrilla, estadísticas zonales, reproyección bilineal/vecino más cercano y cola asíncrona básica con caché LRU.
- **Archivo responsable:** `src/utils/rasterEngine2.ts`, `src/components/geotech/RasterLabPanel.tsx`
- **Motor utilizado:** TypeScript puro (parser aritmético descendente + `Map` LRU).
- **Entradas:** `DemGrid[]`, expresiones matemáticas (`(a - b) / (a + b)`), zonas poligonales.
- **Salidas:** Grillas derivadas, estadísticas zonales y métricas de caché.
- **Precisión:** Determinística en coma flotante IEEE-754.
- **Limitaciones:** Cola básica solo para ráster en memoria del navegador (sin prioridad, pausa/reanudación real en servidor, reintentos, recuperación tras interrupción ni ejecución por lotes multi-proyecto); caché LRU de 16 entradas en memoria de sesión.
- **Pruebas:** `src/utils/geotechEngine2.test.ts`.
- **Dependencias:** `@turf/turf`.
- **Estado real:** **B — Funcional pero limitada** (motor ráster sólido; orquestación de colas y lotes necesita nivel 3.0).

### 4. Laboratorio LiDAR y Nubes de Puntos 3D
- **Capacidad:** Lector/escritor binario ASPRS `.las` v1.2/v1.4, generador sintético de encuesta de referencia, filtro SOR de ruido, clasificación morfológica de suelo (clase 2), cálculo HAG/vegetación/edificios (clases 3–6), generación DTM/DSM/nDSM, mapa de densidad y extracción de curvas de nivel Marching Squares + visor 3D `THREE.Points`.
- **Archivo responsable:** `src/utils/lidarEngine.ts`, `src/components/geotech/LidarLabPanel.tsx`
- **Motor utilizado:** TypeScript puro (`DataView` binario + Three.js `Points`).
- **Entradas:** Buffer binario `.las` o `DemGrid` base.
- **Salidas:** Arreglo `GeotechLidarPoint[]`, archivo `.las`, grillas DTM/DSM/nDSM y curvas `LineString`.
- **Precisión:** Fiel al formato ASPRS LAS para puntos sin compresión `.laz`.
- **Limitaciones:** `.laz` comprimido (LASzip C++) requiere worker PDAL externo; no incluye validador independiente de calidad LiDAR (densidad irregular, puntos duplicados, clases inválidas, outliers extremos, huecos espaciales) ni streaming por bloques para nubes >100k–1M puntos sin presión en heap.
- **Pruebas:** `src/utils/geotechEngine2.test.ts`.
- **Dependencias:** `three`.
- **Estado real:** **B — Funcional pero limitada** (`.las` local verificado; `.laz` es **C**).

### 5. Hidrología Avanzada 2.0
- **Capacidad:** Relleno de sumideros Priority-Flood (Barnes 2014), dirección D8 sin sumideros, orden de corrientes Strahler, delimitación de cuenca vertiente, compacidad Gravelius (`Kc`), tiempo de concentración Kirpich (`Tc`), Caudal Racional (`Q = CIA/3.6`) y exposición de instalaciones.
- **Archivo responsable:** `src/utils/hydrology2.ts`, `src/components/geotech/Hydrology2Panel.tsx`
- **Motor utilizado:** Min-Heap Priority-Flood en TypeScript + `@turf/turf`.
- **Entradas:** `DemGrid`, intensidad de lluvia `mm/h`, coeficiente `C`, capa de instalaciones.
- **Salidas:** `Hydrology2Result` (red `LineString` Strahler, polígono cuenca, grillas acumulación y TWI, exposición).
- **Precisión:** Relleno hidrológico exacto sobre la malla DEM; caudal racional limitado a microcuencas preliminares.
- **Limitaciones:** Faltan relaciones morfométricas de Horton (`Rb`, `Rl`, `Ra`), curvas IDF multitormenta/periodos de retorno, comparación multi-escenario formal y separación explícita en UI/API entre **Análisis topográfico** vs **Análisis hidrológico** vs **Modelamiento hidráulico externo (HEC-RAS/IBER)**.
- **Pruebas:** `src/utils/geotechEngine2.test.ts`.
- **Dependencias:** `@turf/turf`.
- **Estado real:** **B — Funcional pero limitada**.

### 6. Teledetección Satelital 2.0 y Catálogo STAC
- **Capacidad:** 11 índices espectrales + fórmula libre segura, corrección atmosférica DOS1, máscara de nubes heurística, composiciones RGB/Falso Color/SWIR, clasificación no supervisada K-Means (4 clases), clasificación supervisada mínima distancia con matriz de confusión/Kappa y búsqueda STAC 1.0 a Element84 Earth Search AWS.
- **Archivo responsable:** `src/utils/spectralEngine2.ts`, `src/server/geotechEnterprise.ts`, `src/components/geotech/SpectralLabPanel.tsx`
- **Motor utilizado:** Álgebra espectral TS + `fetch` HTTP a `earth-search.aws.element84.com/v1/search`.
- **Entradas:** `SpectralScene` (B2, B3, B4, B8, B11, B12, térmica), BBOX y nubosidad máx.
- **Salidas:** Rásteres de índices, PNG RGBA, matriz de confusión/Kappa y listado de escenas STAC.
- **Precisión:** Clasificación supervisada usa solo distancia euclidiana mínima al centroide (sin Random Forest, SVM ni Decision Tree).
- **Limitaciones:** Sin segmentación por objetos/superpíxeles, sin flujos dedicados de deforestación/incendios/humedad/urbanización con persistencia de modelos entrenados ni filtro temporal/sensor/resolución/AOI STAC 2.0 con comparación multitemporal directa.
- **Pruebas:** `src/utils/geotechEngine2.test.ts`.
- **Dependencias:** Red externa opcional para STAC (`earth-search.aws.element84.com`).
- **Estado real:** **B — Funcional pero limitada** (procesamiento local) / **C** (consulta STAC externa).

### 7. Geotecnia Pro 2.0 (Sondeos, Cimentaciones y Estabilidad)
- **Capacidad:** Perfil estratigráfico transversal multi-sondeo, interpolación IDW de nivel freático y basamento con mapa de distancia, capacidad portante Terzaghi/Meyerhof, asentamiento elástico + consolidación 1D, estabilidad sísmica pseudoestática Bishop/Talud Infinito, LPI de licuefacción multiestrato y mapa de zonificación geotécnica.
- **Archivo responsable:** `src/utils/geotechPro2.ts`, `src/utils/geotechEngine.ts`, `src/components/geotech/GeotechProPanel.tsx`
- **Motor utilizado:** Mecánica de suelos analítica en TypeScript + `@turf/turf`.
- **Entradas:** `BoreholeRecord[]` (profundidad, USCS, SPT `N60`, `c'`, `φ'`, `γ`), `DemGrid`, parámetros de zapata.
- **Salidas:** `BearingCapacityResult`, `SettlementResult`, `LPI`, grillas IDW y zonificación.
- **Precisión:** Fórmulas analíticas clásicas verificadas en tests.
- **Limitaciones:** Faltan registros estructurados de ensayos CPT (`qc`, `fs`, `u2`) y laboratorio geotécnico (granulometría, límites de Atterberg LL/LP/IP, humedad natural, densidad, corte directo/triaxial), visualización explícita de ecuación/fuente metodológica por cálculo e incertidumbre espacial normalizada en mapa dual (Resultado vs Confianza).
- **Pruebas:** `src/utils/geotechEngine.test.ts` y `src/utils/geotechEngine2.test.ts`.
- **Dependencias:** `@turf/turf`.
- **Estado real:** **B — Funcional pero limitada**.

### 8. Evaluación Multicriterio AHP (Saaty)
- **Capacidad:** Matriz de comparación por pares con vector propio principal y Ratio de Consistencia (`CR <= 0.10`), generando grilla ponderada de aptitud territorial (`0–100`) y superficies por clase en hectáreas.
- **Archivo responsable:** `src/utils/geotechEngine.ts`, `src/components/geotech/MulticriteriaAhpPanel.tsx`
- **Motor utilizado:** Método de la potencia (eigenvector Saaty) en TypeScript.
- **Entradas:** Matriz `4×4` de comparaciones pareadas + restricciones de pendiente.
- **Salidas:** Pesos normalizados, `consistencyRatio`, `DemGrid` de idoneidad territorial.
- **Precisión:** Exacta matemáticamente respecto al algoritmo estándar de Saaty.
- **Limitaciones:** Fijo a 4 factores base si se ejecuta fuera del Model Builder; análisis de sensibilidad de pesos pendiente de automatizar en el motor de incertidumbre 3.0.
- **Pruebas:** `src/utils/geotechEngine.test.ts`.
- **Dependencias:** Ninguna.
- **Estado real:** **A — Producción verificada**.

### 9. Visor 2D (Leaflet) & Gemelo Digital 3D (Three.js)
- **Capacidad:** Mapa 2D multicapa con 4 mapas base, medición geodésica, digitalización, perfil DEM y HUD WGS84/UTM; Visor 3D con malla desplazada por DEM, extrusión de naves/redes 3D, horizonte rocoso, plano freático, corte E-O, raycasting de sondeos SPT y soporte software WebGL (`afterDraw`).
- **Archivo responsable:** `src/components/geotech/GisMap2DCanvas.tsx`, `src/components/geotech/Terrain3DViewer.tsx`
- **Motor utilizado:** `leaflet` + `three` (`WebGL2` con render bajo demanda).
- **Entradas:** `DemGrid`, `GisLayer[]`, `BoreholeRecord[]`.
- **Salidas:** Canvas interactivo 2D/3D y selecciones por clic.
- **Precisión:** Fidelidad visual sincronizada con la grilla DEM.
- **Limitaciones:** Sin línea temporal **4D (`X, Y, Z, Tiempo`)**, comparación `Escenario Actual vs Escenario Futuro`, capas explícitas de vegetación/sensores IoT en vivo ni arquitectura declarada de flujos de telemetría temporal.
- **Pruebas:** Verificadas en Chromium vía Playwright en 1.0 y 2.0.
- **Dependencias:** `leaflet`, `three`.
- **Estado real:** **B — Funcional pero limitada** (3D verificado; 4D temporal faltante).

### 10. Interoperabilidad, Formatos I/O y Cartografía
- **Capacidad:** Importación/exportación GeoJSON, KML, KMZ, CSV (WGS84/UTM), ESRI ASCII Grid `.asc`, GeoTIFF lectura y escritura Float32, Shapefile completo ZIP (`.shp/.dbf/.shx/.prj`), DXF CAD, GML, conectores WMS/XYZ, exportación SVG cartográfica y reporte HTML; formatos binarios C++ (`.gpkg`, `.gdb`, `.parquet`, `.laz`, `.nc`, `.h5`) delegados al puente worker.
- **Archivo responsable:** `src/utils/gisFormats.ts`, `src/utils/gisFormats2.ts`, `src/components/geotech/CartographyExportPanel.tsx`
- **Motor utilizado:** `geotiff`, `jszip`, parsers/escritores binarios TS.
- **Entradas:** Archivos cargados o proyectos activos.
- **Salidas:** Capas `GisLayer` / `DemGrid` y descargas estándar.
- **Precisión:** Estándar OGC/ESRI en formatos implementados en TS.
- **Limitaciones:** No existían endpoints estándar **OGC API Features / Tiles** ni especificación OpenAPI geoespacial expuesta; formatos propietarios C++ siguen siendo **C**.
- **Pruebas:** `src/utils/geotechEngine.test.ts`, `src/utils/geotechEngine2.test.ts`.
- **Dependencias:** `geotiff`, `jszip`, worker GDAL externo para `.gpkg/.gdb/.parquet/.laz/.nc/.h5`.
- **Estado real:** **A — Producción verificada** (formatos TS) / **C** (formatos C++ vía worker).

### 11. Microservicio Externo GDAL/PDAL & PostGIS
- **Capacidad:** Servicio FastAPI en `/services/gdal-worker/` con conversión vector GeoPandas/OGR, inspección Rasterio y esquema SQL inicial (`gis_projects`, `gis_vector_features`, `gis_boreholes`).
- **Archivo responsable:** `services/gdal-worker/main.py`, `services/gdal-worker/postgis_schema.sql`, `server.ts` (`/api/geotech/worker/inspect`).
- **Motor utilizado:** Python FastAPI + GDAL/Rasterio/GeoPandas + PostgreSQL/PostGIS (desplegable aparte en Docker).
- **Entradas:** `UploadFile` espaciales y sentencias DDL PostGIS.
- **Salidas:** GeoJSON reproyectado, metadatos COG/GeoTIFF, tablas GIST.
- **Precisión:** Nivel librería C++ nativa (cuando el contenedor Docker externo está activo).
- **Limitaciones:** Sin `GEOSPATIAL_WORKER_URL` configurado en el entorno local actual; faltaban en PostGIS consultas bbox/spatial-join expuestas, soporte 2D/3D (`GEOMETRYZ`), particionamiento temporal/espacial y tabla de versionamiento de entidades.
- **Pruebas:** Revisión estática (no hay PostgreSQL/GDAL corriendo en el sandbox).
- **Dependencias:** Docker externo con PostgreSQL + PostGIS + GDAL + PDAL + `GEOSPATIAL_WORKER_URL`.
- **Estado real:** **C — Dependiente de infraestructura externa**.

### 12. Geotech AI 2.0 (Orquestación Multi-Agente & Confirmación Crítica)
- **Capacidad:** Planificador determinístico multi-agente y modo `Gemini 4 Hydrogen` con Function Calling + confirmación explícita ante acciones destructivas (`overwrite_dem`, `delete_layer`) y guardado de flujos reproducibles.
- **Archivo responsable:** `src/server/geotechEnterprise.ts`, `server.ts` (`/api/geotech/ai-agent-v2`), `src/views/GeotechView.tsx`.
- **Motor utilizado:** Reglas determinísticas + `@google/genai` (`gemini-4-hydrogen`).
- **Entradas:** Instrucción en lenguaje natural + contexto del proyecto.
- **Salidas:** Secuencia de pasos ejecutables + resumen textual.
- **Precisión:** Depende de las herramientas ejecutadas sobre el proyecto.
- **Limitaciones:** Sin ejecución autónoma de extremo a extremo de metas complejas multi-paso (ej. idoneidad completa de parque industrial con verificación CRS → pendiente → hidrología → restricciones → AHP → incertidumbre → informe), sin límites/sandbox/rollback formal ni panel de explicabilidad técnica **«Ver cómo se obtuvo este resultado»**.
- **Pruebas:** Verificada ruta `/api/geotech/ai-agent-v2` y ejecución determinística.
- **Dependencias:** Opcional `GEMINI_API_KEY`.
- **Estado real:** **B — Funcional pero limitada** (determinístico) / **C** (Gemini LLM).

### 13. Infraestructura Enterprise, Persistencia Multitenant y RBAC
- **Capacidad:** Persistencia en `data/db.json` por organización (`org-1`/`org-2`), control RBAC (`lector` bloqueado con HTTP `403`), snapshot y restauración de versiones de proyecto, telemetría básica V8/memoria y pruebas `TEST A–G`.
- **Archivo responsable:** `server.ts`, `src/server/database.ts`, `src/components/geotech/EnterpriseInfraPanel.tsx`.
- **Motor utilizado:** Express + almacenamiento JSON atómico en disco.
- **Entradas:** Cabeceras `x-organization-id`, `x-user-email` y cuerpo JSON de proyectos.
- **Salidas:** Estado persistente, instantáneas y métricas de heap.
- **Precisión:** Telemetría real de `process.memoryUsage()` y `os`.
- **Limitaciones:** Faltaban **Diff visual de versiones**, comentarios/revisiones/aprobaciones colaborativas, matriz de 10 roles configurables, **GeoCatalog unificado**, **Model Builder visual**, **Batch Job Queue**, **GeoML Engine**, **Motor de Incertidumbre Espacial**, **10 Plantillas de Dominio**, y **Pruebas de Estrés H–P (incl. 1 millón de entidades + benchmarking comparativo)**.
- **Pruebas:** Verificadas en Chromium y `node:test`.
- **Dependencias:** Sistema de archivos local (`data/db.json`).
- **Estado real:** **A — Producción verificada** (multitenant/RBAC/versiones) / **E** (capacidades 3.0 listadas).

---

## Resumen Ejecutivo Pre-Implementación (Brechas a Cubrir en 3.0)

| Capacidad Nueva / Evolucionada en SIG & GEOTECH AI 3.0 | Estado Actual | Objetivo de Fase 3.0 |
| :--- | :---: | :--- |
| Capa de Abstracción `GeoEngine` + Envolvente Científica Obligatoria | **E** | Motor unificado con enrutamiento automático y metadatos de precisión/advertencias |
| Data Quality Engine (Vector, Ráster, LiDAR + GIS Data Quality Score) | **E** | Auditoría independiente sin falsos negativos y puntaje técnico ponderado |
| Model Builder Visual (Grafo de Nodos Ejecutable + Export/Import JSON) | **E** | Pipeline visual interactivo `DEM → Fill → Slope → Reclass → Buffer → Intersect → AHP` |
| Batch Processing & Job Queue Engine (Prioridades, Pausa/Reanudar/Retry, ETA) | **E** | Cola persistente servidor/cliente con recuperación tras interrupción y telemetría real |
| Procesamiento Masivo por Bloques (1M vectores benchmark + streaming) | **B / E** | Indexado espacial en bloques + prueba de estrés **TEST H** real sin congelar UI |
| PostGIS Enterprise (2D/3D `GEOMETRYZ`, particionamiento, spatial join, versionado) | **C** | Esquema SQL y endpoints FastAPI ampliados (dependiente de Docker/PostGIS externo) |
| GeoCatalog Unificado & STAC 2.0 (AOI, fechas, sensor, resolución, comparación) | **B / E** | Buscador multifaceta sobre todo el inventario + STAC 2.0 con comparación temporal |
| Teledetección 3.0 & GeoML Engine (Random Forest, SVM, Decision Tree, Clustering, Regresión, Anomalías, Segmentación) | **E** | Modelos entrenables reales con Accuracy, Precision, Recall, F1, Matriz de Confusión, RMSE, MAE, R² y guardado |
| Hidrología 3.0 (Horton, Curvas IDF, Multi-Escenario, Distinción Hidráulica) | **B** | Completar morfometría Horton e IDF + separación taxonómica estricta |
| Geotecnia 3.0 (CPT, Lab Atterberg/Granulometría, Ecuaciones/Fuentes) | **B** | Base geotécnica ampliada + trazabilidad matemática exacta |
| Motor de Incertidumbre Espacial (Mapa Resultado vs Mapa Confianza + Sensibilidad) | **E** | Evaluador cuantitativo de cobertura, densidad y sensibilidad paramétrica |
| Gemelo Digital 4D (`X, Y, Z, Tiempo`, Escenario Actual vs Futuro, IoT) | **B / E** | Timeline 4D interactivo en Three.js + arquitectura de sensores IoT |
| IA Autónoma 3.0, Sandbox/Rollback y Panel «Ver cómo se obtuvo este resultado» | **B / E** | Ejecución multi-paso verificada + panel de explicabilidad científica completo |
| 10 Plantillas de Proyecto + Colaboración/10 Roles + Diff Versiones + API OGC | **E** | Generación automática por dominio + comentarios/aprobaciones + OGC API Features/Tiles |
| Dashboard Enterprise + Pruebas de Estrés **TEST H–P** & Benchmarks | **E** | Suite de estrés reproducible + comparativa histórica de rendimiento |
