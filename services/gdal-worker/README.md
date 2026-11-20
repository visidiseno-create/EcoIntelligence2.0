# ECOINTELLIGENCE — Microservicio Geoespacial Externo 4.0

Este contenedor provee ejecución real C++/Python para formatos pesados y consultas espaciales masivas:
- **GDAL / OGR / PROJ / GEOS** (`.gpkg`, `.shp`, `.gml`, `.gdb`, Cloud Optimized GeoTIFF)
- **GeoPandas + PyOGRIO + GeoParquet (`pyarrow`)**
- **PDAL + `laspy`/`lazrs`** (clasificación SMRF, filtrado de ruido, DTM/DSM desde `.las`/`.laz`)
- **PostGIS 16** (índices GiST, joins multi-millón y versionamiento espacial `postgis_schema.sql`)
- **MinIO S3** (almacenamiento de objetos binarios separado de metadatos)

## Despliegue local o en producción

```bash
cd services/gdal-worker
docker compose up -d --build
```

Una vez levantado el contenedor en el puerto `8081`, configure en ECOINTELLIGENCE:

```env
GEOSPATIAL_WORKER_URL=http://localhost:8081
```

Cuando `GEOSPATIAL_WORKER_URL` no está configurada, ECOINTELLIGENCE informa explícitamente `DEPENDENCIA EXTERNA NO DISPONIBLE` en lugar de simular resultados.
