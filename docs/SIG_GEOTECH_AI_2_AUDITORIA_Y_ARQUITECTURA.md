# AUDITORÍA TÉCNICA INICIAL Y ARQUITECTURA — SIG & GEOTECH AI 2.0

**Plataforma:** ECOINTELLIGENCE  
**Fecha de auditoría:** 2026-11-17  
**Entorno auditado:** Node.js v22 + Express + TypeScript (`tsx`) + Vite/React 19 + Python 3.11 stdlib (4 vCPUs, 12 GB RAM, sin binarios C++ GDAL/PDAL/QGIS/PostGIS preinstalados en el contenedor).

---

## 1. AUDITORÍA POR CATEGORÍAS (ESTADO BASE 1.0)

### A. Funcionalidades Completas y Verificadas (No reconstruir; preservar y extender)
1. **Visor SIG 2D Interactivo (`GisMap2DCanvas.tsx`)**: Leaflet multicapa, 4 mapas base (OSM, ESRI Satélite, OpenTopoMap, Lienzo Blanco), control de opacidad ráster, simbología configurable, medición geodésica de distancias/áreas, digitalización de puntos y polígonos, extracción de perfil topográfico DEM, HUD en vivo WGS84 + UTM.
2. **Motor Vectorial y Proyección CRS (`geotechEngine.ts`)**: Transformaciones reales con `proj4` (`EPSG:4326`, `EPSG:3857`, `EPSG:32717/18/19`, `EPSG:24877/78`), validador topológico, estadísticas vectoriales, y 12 operaciones `@turf/turf` v7 (`buffer`, `clip`, `intersect`, `union`, `difference`, `dissolve`, `centroid`, `convex_hull`, `voronoi`, `spatial_join`, `select_by_attribute`, `select_by_location`).
3. **Estadística Espacial y Morfometría DEM (`geotechEngine.ts`)**: Interpolación IDW, Autocorrelación Global Moran's I, Hotspots Locales Getis-Ord Gi*, pendiente Horn 3×3, orientación (aspect), hillshade, curvatura, flujo D8 básico, índice TWI, cuenca visual (viewshed) y cálculo volumétrico Corte/Relleno.
4. **Visor 3D Base (`Terrain3DViewer.tsx`)**: Malla Three.js desplazada por DEM, textura dinámica sincronizada, exageración Z, malla TIN, plano de nivel freático y sondeos SPT 3D interactivos vía `Raycaster` con soporte software-WebGL (`afterDraw`).
5. **Teledetección Base (`SpectralLabPanel.tsx`)**: Índices `NDVI`, `NDWI`, `MNDWI`, `NDBI`, `SAVI`, `EVI`, `NBR`, detección de cambio T1→T2 y clasificación no supervisada K-Means (4 clases).
6. **Geotecnia Base & AHP Saaty (`geotechEngine.ts`, `MulticriteriaAhpPanel.tsx`)**: Equilibrio límite Talud Infinito y Bishop Simplificado (10 dovelas), tamizaje de licuefacción Seed & Idriss, y matriz multicriterio AHP con eigenvector y Ratio de Consistencia (`CR <= 0.10`).
7. **Interoperabilidad Base, Persistencia y RBAC (`gisFormats.ts`, `server.ts`, `database.ts`)**: Importación/exportación de GeoJSON, KML, CSV (WGS84/UTM), ESRI ASCII Grid (`.asc`), lectura GeoTIFF (`.tif`), conectores WMS/XYZ, exportación cartográfica SVG y reporte técnico HTML, persistencia multitenant `org-1`/`org-2` en `data/db.json`, RBAC (`admin/auditor/operador` vs `lector` HTTP `403`), evidencias fotográficas (`ModuleEvidencePanel`), y suite Pruebas A–E (incluyendo procesamiento en bloques de 50,000 puntos).
8. **Geotech AI Base (`/api/geotech/ai-agent`)**: Planificador determinístico local y modo `Gemini 4 Hydrogen` (`@google/genai` con Function Calling) ejecutando operaciones reales sobre las capas.

### B. Funcionalidades Parcialmente Implementadas (A expandir en Fase 2.0)
1. **Formatos vectoriales y ráster binarios**: GeoTIFF solo tenía lectura con remuestreo fijo a 64×64 sin escritura Float32 georreferenciada ni procesamiento por bloques/pirámides/álgebra de mapas; KML carecía de contenedor `.kmz` y no existía soporte nativo de Shapefile completo (`.shp/.dbf/.shx/.prj`), DXF CAD ni GML.
2. **Motor Hidrológico**: El algoritmo D8 operaba sin llenado previo de depresiones (sink filling), sin extracción vectorial de red de drenaje Strahler, sin delimitación automática de cuencas/subcuencas ni modelamiento hidrológico de escorrentía con precipitación (Kirpich + Método Racional).
3. **Teledetección Satelital**: Faltaban índices clave (`NDMI`, `BSI`, `GNDVI`, fórmulas libres), corrección atmosférica (DOS1) / máscara de nubes, composición RGB/Falso Color, clasificación supervisada con matriz de confusión/Kappa y consulta en vivo a catálogos STAC externos.
4. **Geotecnia & 3D**: Faltaba correlación estratigráfica transversal entre múltiples sondeos, superficie interpolada de basamento y nivel freático con mapa de incertidumbre, cálculo de capacidad portante (Terzaghi/Meyerhof), asentamientos (elástico + consolidación 1D), sismicidad pseudoestática y extrusión de edificaciones/redes/cortes 3D.
5. **Geotech AI Core**: No guardaba flujos reproducibles ni requería confirmación explícita del usuario ante acciones destructivas.

### C. Funcionalidades Pendientes de Desarrollo (A construir o integrar vía worker)
1. **Laboratorio LiDAR y Nubes de Puntos (`.las` binario, filtro ruido SOR, clasificación suelo/vegetación/edificios, DTM/DSM/nDSM, densidad, curvas de nivel y visor 3D `THREE.Points`)**.
2. **Infraestructura Enterprise (cola de tareas ráster, caché LRU, versionamiento de proyectos con restauración, observabilidad de memoria V8/heap y microservicio puente GDAL/PDAL/PostGIS)**.
3. **Microservicio externo GDAL/PDAL/QGIS/PostGIS**: Al no estar presentes binarios C++ (`gdalinfo`, `ogr2ogr`, `pdal`, `psql`) dentro del contenedor Node.js del navegador/sandbox, el soporte de formatos propietarios C++ (`.laz` comprimido, `.gdb` FileGDB, `.nc` NetCDF, `.h5` HDF5, `.parquet` GeoParquet) se implementa mediante un servicio FastAPI + GDAL/PDAL independiente (`/services/gdal-worker/`) conectado vía `GEOSPATIAL_WORKER_URL`, manteniendo transparencia absoluta sobre lo que se ejecuta localmente vs vía worker externo.

---

## 2. ARQUITECTURA ACTUALIZADA (SIG & GEOTECH AI 2.0)

- **Capa Matemática & Formatos Puros (`src/utils/`)**:
  - `geotechEngine.ts` (núcleo 1.0 intacto)
  - `gisFormats.ts` + `gisFormats2.ts` (Shapefile ZIP binario, GeoTIFF Float32 escritor/lector, DXF, GML, KMZ)
  - `rasterEngine2.ts` (bloques, pirámides, álgebra de mapas sin `eval()`, mosaico, estadísticas zonales, reproyección/remuestreo, cola de tareas y caché)
  - `lidarEngine.ts` (lector/escritor binario ASPRS `.las` v1.2/1.4, SOR, filtro morfológico de suelo, HAG vegetación/edificios, DTM/DSM/nDSM, densidad, Marching Squares curvas de nivel)
  - `spectralEngine2.ts` (11 índices + expresión libre, DOS1/máscara nubes, composiciones RGB/SWIR, clasificación supervisada + Matriz de Confusión/Kappa)
  - `geotechPro2.ts` (correlación entre sondeos, nivel freático/basamento + incertidumbre, Terzaghi/Meyerhof, asentamiento 1D, Bishop sísmico `kh`, LPI)
  - `hydrology2.ts` (Priority-Flood sink fill, red Strahler, delimitación de subcuencas, Kirpich `Tc`, caudal racional `Q`, exposición territorial)
- **Capa Backend & Orquestación (`server.ts`, `src/server/enterpriseInfra.ts`, `/services/gdal-worker/`)**:
  - Persistencia en `data/db.json` (versionamiento por proyecto, flujos guardados, nubes LiDAR), telemetría V8/caché, búsqueda STAC en vivo (`Earth Search AWS`), puente configurable a worker GDAL/PDAL (`GEOSPATIAL_WORKER_URL`), y Geotech AI 2.0 multiagente con aprobación de acciones destructivas.
- **Capa UI Modular (`src/components/geotech/`, `src/views/GeotechView.tsx`)**:
  - Pestañas profesionales: `Visor 2D & Geoproceso`, `Terreno 3D & Gemelo Digital`, `Ráster & Álgebra 2.0`, `LiDAR & Nubes 3D`, `Hidrología Avanzada`, `Teledetección 2.0`, `Geotecnia Pro 2.0`, `Multicriterio AHP`, `Cartografía, I/O & Interoperabilidad`, `Infraestructura & Auditoría`.
