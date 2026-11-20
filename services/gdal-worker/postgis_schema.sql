-- ECOINTELLIGENCE SIG & GEOTECH AI 3.0 — Esquema Empresarial PostGIS / PostgreSQL 2D/3D + Versionamiento
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;

CREATE TABLE IF NOT EXISTS gis_projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  default_crs TEXT NOT NULL DEFAULT 'EPSG:32718',
  area_ha DOUBLE PRECISION NOT NULL,
  extent GEOMETRY(Polygon, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Soporte 2D/3D (GeometryZ) y particionamiento lógico por organization_id
CREATE TABLE IF NOT EXISTS gis_vector_features (
  id BIGSERIAL,
  project_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  layer_id TEXT NOT NULL,
  layer_name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom GEOMETRY(GeometryZ, 4326) NOT NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, organization_id)
) PARTITION BY HASH (organization_id);

CREATE TABLE IF NOT EXISTS gis_vector_features_p0 PARTITION OF gis_vector_features FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE IF NOT EXISTS gis_vector_features_p1 PARTITION OF gis_vector_features FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE IF NOT EXISTS gis_vector_features_p2 PARTITION OF gis_vector_features FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE IF NOT EXISTS gis_vector_features_p3 PARTITION OF gis_vector_features FOR VALUES WITH (MODULUS 4, REMAINDER 3);

CREATE INDEX IF NOT EXISTS idx_gis_features_geom ON gis_vector_features USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_gis_features_org ON gis_vector_features (organization_id, project_id, layer_id);
CREATE INDEX IF NOT EXISTS idx_gis_features_props ON gis_vector_features USING GIN (properties);

-- Tabla histórica de versionamiento espacial de entidades
CREATE TABLE IF NOT EXISTS gis_feature_versions (
  version_id BIGSERIAL PRIMARY KEY,
  feature_id BIGINT NOT NULL,
  project_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  properties JSONB NOT NULL,
  geom GEOMETRY(GeometryZ, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gis_feat_ver_lookup ON gis_feature_versions (organization_id, project_id, feature_id, version_no);

CREATE TABLE IF NOT EXISTS gis_boreholes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES gis_projects(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  collar_elev_m DOUBLE PRECISION NOT NULL,
  total_depth_m DOUBLE PRECISION NOT NULL,
  water_table_m DOUBLE PRECISION NOT NULL,
  strata JSONB NOT NULL DEFAULT '[]'::jsonb,
  cpt_profile JSONB NOT NULL DEFAULT '[]'::jsonb,
  lab_tests JSONB NOT NULL DEFAULT '[]'::jsonb,
  geom GEOMETRY(PointZ, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gis_boreholes_geom ON gis_boreholes USING GIST (geom);

CREATE TABLE IF NOT EXISTS gis_geocatalog (
  catalog_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  title TEXT NOT NULL,
  crs TEXT NOT NULL,
  resolution_label TEXT,
  source TEXT,
  license TEXT DEFAULT 'Uso Corporativo Interno',
  owner TEXT,
  version_tag TEXT DEFAULT 'v1.0',
  bbox GEOMETRY(Polygon, 4326),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gis_geocatalog_bbox ON gis_geocatalog USING GIST (bbox);
