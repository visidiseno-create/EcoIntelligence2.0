import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Geometry, Point, Polygon, MultiPolygon } from 'geojson';
import proj4 from 'proj4';

// Register standard CRS definitions used in Latin America & Global Engineering
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs +type=crs');
proj4.defs(
  'EPSG:3857',
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs'
);
proj4.defs('EPSG:32717', '+proj=utm +zone=17 +south +datum=WGS84 +units=m +no_defs +type=crs');
proj4.defs('EPSG:32718', '+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs +type=crs');
proj4.defs('EPSG:32719', '+proj=utm +zone=19 +south +datum=WGS84 +units=m +no_defs +type=crs');
proj4.defs(
  'EPSG:24877',
  '+proj=utm +zone=17 +south +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +units=m +no_defs +type=crs'
);
proj4.defs(
  'EPSG:24878',
  '+proj=utm +zone=18 +south +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +units=m +no_defs +type=crs'
);

export type CrsCode =
  | 'EPSG:4326'
  | 'EPSG:3857'
  | 'EPSG:32717'
  | 'EPSG:32718'
  | 'EPSG:32719'
  | 'EPSG:24877'
  | 'EPSG:24878';

export const SUPPORTED_CRS: Array<{ code: CrsCode; name: string; unit: 'grados' | 'metros' }> = [
  { code: 'EPSG:4326', name: 'WGS 84 (Geográfica Lat/Lon)', unit: 'grados' },
  { code: 'EPSG:32717', name: 'WGS 84 / UTM Zona 17S (Ecuador / Perú Norte)', unit: 'metros' },
  { code: 'EPSG:32718', name: 'WGS 84 / UTM Zona 18S (Perú Centro / Lima)', unit: 'metros' },
  { code: 'EPSG:32719', name: 'WGS 84 / UTM Zona 19S (Perú Sur / Altiplano)', unit: 'metros' },
  { code: 'EPSG:3857', name: 'WGS 84 / Pseudo-Mercator (Web GIS)', unit: 'metros' },
  { code: 'EPSG:24877', name: 'PSAD56 / UTM Zona 17S', unit: 'metros' },
  { code: 'EPSG:24878', name: 'PSAD56 / UTM Zona 18S', unit: 'metros' },
];

export type GeoFeatureCollection = FeatureCollection<Geometry, Record<string, any>>;

export interface GisLayerSymbology {
  color: string;
  fillColor?: string;
  fillOpacity?: number;
  weight?: number;
  radius?: number;
  labelField?: string;
  rampField?: string;
  colorRamp?: 'emerald' | 'terrain' | 'hazard' | 'water' | 'thermal';
}

export interface GisLayer {
  id: string;
  name: string;
  category:
    | 'ambiental'
    | 'geotecnia'
    | 'hidrologia'
    | 'infraestructura'
    | 'geoproceso'
    | 'teledeteccion'
    | 'multicriterio'
    | 'externa';
  kind: 'vector' | 'raster' | 'wms' | 'xyz';
  visible: boolean;
  opacity: number;
  crs: CrsCode;
  source: string;
  license?: string;
  capturedDate?: string;
  symbology: GisLayerSymbology;
  geojson?: GeoFeatureCollection;
  raster?: DemGrid;
  serviceUrl?: string;
  wmsLayers?: string;
  metadata?: {
    provenance: 'observado' | 'interpolacion' | 'modelo_analitico' | 'oficial';
    notes?: string;
  };
}

export interface DemGrid {
  id: string;
  name: string;
  cols: number;
  rows: number;
  cellSizeMeters: number;
  bounds: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  crs: CrsCode;
  noData: number;
  unit: string;
  values: number[]; // row-major: row 0 is North (maxLat), row rows-1 is South (minLat)
  colorScale?: 'elevation' | 'slope' | 'aspect' | 'hillshade' | 'twi' | 'ndvi' | 'ndwi' | 'thermal' | 'suitability' | 'idw' | 'classes';
  classLabels?: string[];
}

export interface SpectralBandData {
  date: string;
  sensor: string;
  resolutionM: number;
  blue: number[];
  green: number[];
  red: number[];
  nir: number[];
  swir1: number[];
  swir2: number[];
  thermalK?: number[];
}

export interface SpectralScene {
  id: string;
  name: string;
  cols: number;
  rows: number;
  cellSizeMeters: number;
  bounds: [number, number, number, number];
  crs: CrsCode;
  t1: SpectralBandData;
  t2: SpectralBandData;
}

export interface BoreholeStratum {
  fromM: number;
  toM: number;
  lithology: string;
  uscs: string;
  sptN60: number;
  unitWeightKnM3: number;
  cohesionKpa: number;
  frictionDeg: number;
  color: string;
}

export interface BoreholeCptReading {
  depthM: number;
  qcMpa: number;
  fsKpa: number;
  u2Kpa: number;
}

export interface BoreholeLabTest {
  sampleId: string;
  depthM: number;
  moisturePct: number;
  liquidLimitPct: number;
  plasticLimitPct: number;
  plasticityIndexPct: number;
  finesPct: number;
  bulkDensityKnM3: number;
  cohesionKpa: number;
  frictionDeg: number;
}

export interface BoreholeRecord {
  id: string;
  code: string;
  name: string;
  lng: number;
  lat: number;
  collarElevM: number;
  totalDepthM: number;
  waterTableDepthM: number;
  pgaG?: number;
  strata: BoreholeStratum[];
  cptProfile?: BoreholeCptReading[];
  labTests?: BoreholeLabTest[];
}

export interface PrecisionEnvelope {
  resultSummary: string;
  method: string;
  crs: CrsCode;
  resolution: string;
  units: string;
  sourceData: string[];
  timestamp: string;
  estimatedAccuracy: string;
  dataKind: 'observado' | 'interpolado' | 'modelo_analitico' | 'prediccion_ml';
  warnings: string[];
}

export interface OperationHistoryEntry {
  id: string;
  timestamp: string;
  tool: string;
  module: string;
  agent?: string;
  parameters: Record<string, any>;
  inputLayers: string[];
  outputLayer?: string;
  durationMs: number;
  status: 'completado' | 'error';
  summary: string;
  precisionEnvelope?: PrecisionEnvelope;
}

export interface GeotechLidarPoint {
  lng: number;
  lat: number;
  z: number;
  intensity: number;
  returnNum: number;
  classification: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  hag?: number;
}

export interface SavedGeotechWorkflow {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  createdBy: string;
  steps: PlannedWorkflowStep[];
}

export interface GeotechProjectVersion {
  id: string;
  label: string;
  createdAt: string;
  author: string;
  layerCount: number;
  historyCount: number;
  snapshot: {
    dem: DemGrid;
    layers: GisLayer[];
    boreholes: BoreholeRecord[];
    defaultCrs: CrsCode;
  };
}

export type ModelNodeKind =
  | 'dem_input'
  | 'vector_input'
  | 'fill_sinks'
  | 'slope'
  | 'reclassify'
  | 'buffer'
  | 'intersect'
  | 'ahp_suitability'
  | 'uncertainty'
  | 'output_layer';

export interface ModelBuilderNode {
  id: string;
  kind: ModelNodeKind;
  label: string;
  x: number;
  y: number;
  params: Record<string, any>;
}

export interface ModelBuilderEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface ModelBuilderGraph {
  id: string;
  name: string;
  version: string;
  description: string;
  updatedAt: string;
  nodes: ModelBuilderNode[];
  edges: ModelBuilderEdge[];
}

export interface GeoMlSavedModel {
  id: string;
  name: string;
  algorithm: 'random_forest' | 'svm' | 'decision_tree' | 'linear_regression' | 'kmeans' | 'anomaly_zscore';
  targetTask: string;
  createdAt: string;
  trainedBy: string;
  sampleCount: number;
  featureNames: string[];
  metrics: {
    accuracyPct?: number;
    precisionPct?: number;
    recallPct?: number;
    f1Pct?: number;
    kappa?: number;
    rmse?: number;
    mae?: number;
    r2?: number;
    confusionMatrix?: number[][];
  };
  classLabels?: string[];
  params: Record<string, any>;
  isPredictionWarning: string;
}

export interface DigitalTwin4DFrame {
  id: string;
  label: string;
  timestamp: string;
  scenario: 'actual' | 'proyectado_2028' | 'emergencia_lluvias';
  waterTableShiftM: number;
  vegetationFactor: number;
  settlementMm: number;
  newBuildingsScale: number;
  notes: string;
}

export interface DigitalTwinIotSensor {
  id: string;
  code: string;
  name: string;
  sensorType: 'piezometro' | 'inclinometro' | 'pluviometro' | 'estacion_aire';
  lng: number;
  lat: number;
  lastValue: number;
  unit: string;
  thresholdWarning: number;
  status: 'normal' | 'alerta' | 'critico';
  updatedAt: string;
}

export type EnterpriseRoleKey =
  | 'super_admin'
  | 'gis_director'
  | 'lead_geotech'
  | 'hydrologist'
  | 'remote_sensing_specialist'
  | 'environmental_auditor'
  | 'field_operator'
  | 'data_engineer'
  | 'external_reviewer'
  | 'lector_viewer';

export interface ProjectComment {
  id: string;
  author: string;
  authorRole: string;
  createdAt: string;
  targetType: 'project' | 'layer' | 'version' | 'analysis';
  targetName: string;
  message: string;
  resolved: boolean;
}

export interface ProjectApproval {
  id: string;
  stage: string;
  requestedBy: string;
  reviewer: string;
  status: 'pendiente' | 'aprobado' | 'observado';
  notes: string;
  updatedAt: string;
}

export interface ProjectMemberAssignment {
  userName: string;
  email: string;
  enterpriseRole: EnterpriseRoleKey;
  assignedAt: string;
}

export interface GeotechProject {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  domain: 'ambiental' | 'geotecnia' | 'industrial' | 'gubernamental';
  description: string;
  areaHa: number;
  defaultCrs: CrsCode;
  center: [number, number]; // [lng, lat]
  zoom: number;
  layers: GisLayer[];
  dem: DemGrid;
  spectralScene?: SpectralScene;
  boreholes: BoreholeRecord[];
  operationHistory: OperationHistoryEntry[];
  lidarCloud?: GeotechLidarPoint[];
  savedWorkflows?: SavedGeotechWorkflow[];
  versions?: GeotechProjectVersion[];
  modelGraphs?: ModelBuilderGraph[];
  trainedMlModels?: GeoMlSavedModel[];
  temporalFrames?: DigitalTwin4DFrame[];
  iotSensors?: DigitalTwinIotSensor[];
  comments?: ProjectComment[];
  approvals?: ProjectApproval[];
  projectMembers?: ProjectMemberAssignment[];
  publicationStatus?: 'borrador' | 'revision' | 'aprobacion' | 'publicado';
  publicationHistory?: Array<{ from: string; to: string; by: string; role: string; at: string; qualityScore: number }>;
  reproPackages?: any[];
  monitoringStations?: any[];
  objectKeys?: Array<{ assetId: string; objectKey: string; sha256: string; byteSize: number; storedAt: string }>;
  updatedAt: string;
  createdAt: string;
}

// =========================================================
// 1. CRS TRANSFORMATION & TOPOLOGY VALIDATION
// =========================================================

export function projectCoordinate(
  coord: [number, number],
  fromCrs: CrsCode,
  toCrs: CrsCode
): [number, number] {
  if (fromCrs === toCrs) return [coord[0], coord[1]];
  const res = proj4(fromCrs, toCrs, coord);
  return [Number(res[0].toFixed(6)), Number(res[1].toFixed(6))];
}

function mapCoordinatesDeep(coords: any, fn: (c: [number, number]) => [number, number]): any {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const projected = fn([coords[0], coords[1]]);
    return coords.length > 2 ? [projected[0], projected[1], coords[2]] : projected;
  }
  return coords.map((child) => mapCoordinatesDeep(child, fn));
}

export function transformFeatureCollectionCrs(
  fc: GeoFeatureCollection,
  fromCrs: CrsCode,
  toCrs: CrsCode
): GeoFeatureCollection {
  if (fromCrs === toCrs) return fc;
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      ...f,
      geometry: f.geometry
        ? ({
            ...f.geometry,
            coordinates: mapCoordinatesDeep((f.geometry as any).coordinates, (c) =>
              projectCoordinate(c, fromCrs, toCrs)
            ),
          } as Geometry)
        : f.geometry,
    })),
  };
}

export interface TopologyValidationReport {
  valid: boolean;
  featureCount: number;
  invalidCount: number;
  issues: Array<{ featureIndex: number; featureName: string; reason: string }>;
  detectedBounds: [number, number, number, number] | null;
  likelyCrs: CrsCode;
}

export function detectCrsFromGeoJson(fc: GeoFeatureCollection): CrsCode {
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const coords = turf.coordAll(f as any);
    if (coords.length > 0) {
      const [x, y] = coords[0];
      if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
        return 'EPSG:4326';
      }
      if (Math.abs(x) > 1000000 || Math.abs(y) > 10000000) {
        return 'EPSG:3857';
      }
      // UTM South heuristic
      if (x >= 160000 && x <= 840000 && y > 1000000 && y <= 10000000) {
        return 'EPSG:32718';
      }
    }
  }
  return 'EPSG:4326';
}

export function validateGeometryTopology(fc: GeoFeatureCollection): TopologyValidationReport {
  const issues: TopologyValidationReport['issues'] = [];
  let invalidCount = 0;

  fc.features.forEach((f, idx) => {
    const label = String(f.properties?.name || f.properties?.nombre || f.id || `Feature #${idx + 1}`);
    if (!f.geometry || !(f.geometry as any).coordinates) {
      invalidCount++;
      issues.push({ featureIndex: idx, featureName: label, reason: 'Geometría nula o sin coordenadas.' });
      return;
    }

    const coords = turf.coordAll(f as any);
    if (coords.length === 0) {
      invalidCount++;
      issues.push({ featureIndex: idx, featureName: label, reason: 'Sin vértices válidos.' });
      return;
    }

    const hasNaN = coords.some((c) => !Number.isFinite(c[0]) || !Number.isFinite(c[1]));
    if (hasNaN) {
      invalidCount++;
      issues.push({ featureIndex: idx, featureName: label, reason: 'Contiene coordenadas NaN o infinitas.' });
      return;
    }

    if (f.geometry.type === 'Polygon') {
      const rings = f.geometry.coordinates;
      const outer = rings[0];
      if (!outer || outer.length < 4) {
        invalidCount++;
        issues.push({ featureIndex: idx, featureName: label, reason: 'Polígono con menos de 4 vértices.' });
        return;
      }
      const first = outer[0];
      const last = outer[outer.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        invalidCount++;
        issues.push({ featureIndex: idx, featureName: label, reason: 'Anillo de polígono no cerrado.' });
        return;
      }
      if (turf.area(f as any) <= 0) {
        invalidCount++;
        issues.push({ featureIndex: idx, featureName: label, reason: 'Polígono con área nula o degenerada.' });
      }
    } else if (f.geometry.type === 'LineString') {
      if (f.geometry.coordinates.length < 2) {
        invalidCount++;
        issues.push({ featureIndex: idx, featureName: label, reason: 'Línea con menos de 2 vértices.' });
      }
    }
  });

  const likelyCrs = detectCrsFromGeoJson(fc);
  let detectedBounds: [number, number, number, number] | null = null;
  if (fc.features.length > 0 && invalidCount < fc.features.length) {
    try {
      const b = turf.bbox(fc as any);
      if (b.every((v) => Number.isFinite(v))) {
        detectedBounds = [b[0], b[1], b[2], b[3]];
      }
    } catch {
      detectedBounds = null;
    }
  }

  return {
    valid: invalidCount === 0 && fc.features.length > 0,
    featureCount: fc.features.length,
    invalidCount,
    issues,
    detectedBounds,
    likelyCrs,
  };
}

// =========================================================
// 2. REAL VECTOR GEOPROCESSING ENGINE (TURF.JS)
// =========================================================

export type VectorOpType =
  | 'buffer'
  | 'clip'
  | 'intersect'
  | 'union'
  | 'difference'
  | 'dissolve'
  | 'centroid'
  | 'convex_hull'
  | 'voronoi'
  | 'spatial_join'
  | 'select_by_attribute'
  | 'select_by_location';

export interface VectorLayerStats {
  featureCount: number;
  geometryTypes: string[];
  totalAreaHa: number;
  totalLengthKm: number;
  bbox: [number, number, number, number] | null;
}

export function computeVectorLayerStats(fc: GeoFeatureCollection): VectorLayerStats {
  if (!fc.features.length) {
    return {
      featureCount: 0,
      geometryTypes: [],
      totalAreaHa: 0,
      totalLengthKm: 0,
      bbox: null,
    };
  }
  const typeSet = new Set<string>();
  let totalAreaM2 = 0;
  let totalLengthKm = 0;

  for (const f of fc.features) {
    if (!f.geometry) continue;
    typeSet.add(f.geometry.type);
    if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
      totalAreaM2 += turf.area(f as any);
    } else if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') {
      totalLengthKm += turf.length(f as any, { units: 'kilometers' });
    }
  }

  let bbox: [number, number, number, number] | null = null;
  try {
    const b = turf.bbox(fc as any);
    if (b.every(Number.isFinite)) bbox = [b[0], b[1], b[2], b[3]];
  } catch {
    bbox = null;
  }

  return {
    featureCount: fc.features.length,
    geometryTypes: Array.from(typeSet),
    totalAreaHa: Math.round((totalAreaM2 / 10000) * 100) / 100,
    totalLengthKm: Math.round(totalLengthKm * 1000) / 1000,
    bbox,
  };
}

function extractPolygons(fc: GeoFeatureCollection): Array<Feature<Polygon | MultiPolygon>> {
  const polys: Array<Feature<Polygon | MultiPolygon>> = [];
  for (const f of fc.features) {
    if (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') {
      polys.push(f as Feature<Polygon | MultiPolygon>);
    }
  }
  return polys;
}

export function runVectorBuffer(
  fc: GeoFeatureCollection,
  distanceMeters: number,
  dissolveOutput: boolean = false
): GeoFeatureCollection {
  if (distanceMeters <= 0) {
    throw new Error('La distancia del buffer debe ser mayor a 0 metros.');
  }
  const buffered: Feature[] = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const b = turf.buffer(f as any, distanceMeters / 1000, { units: 'kilometers', steps: 24 });
    if (b && b.type === 'Feature') {
      const areaHa = Math.round((turf.area(b) / 10000) * 100) / 100;
      buffered.push({
        ...b,
        properties: {
          ...(f.properties || {}),
          buffer_m: distanceMeters,
          area_ha: areaHa,
        },
      });
    }
  }
  const outFc: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: buffered as any,
  };
  if (dissolveOutput && buffered.length > 1) {
    return runVectorDissolve(outFc);
  }
  return outFc;
}

export function runVectorDissolve(
  fc: GeoFeatureCollection,
  propertyName?: string
): GeoFeatureCollection {
  const polys = extractPolygons(fc);
  if (polys.length === 0) {
    throw new Error('Dissolve requiere geometrías de tipo Polígono.');
  }
  const flattened = turf.flatten(turf.featureCollection(polys));
  const dissolved = propertyName
    ? turf.dissolve(flattened as any, { propertyName })
    : turf.dissolve(flattened as any);

  return {
    type: 'FeatureCollection',
    features: dissolved.features.map((f, idx) => ({
      ...f,
      properties: {
        ...(f.properties || {}),
        dissolved_id: idx + 1,
        area_ha: Math.round((turf.area(f as any) / 10000) * 100) / 100,
      },
    })),
  };
}

export function runVectorIntersect(
  fcA: GeoFeatureCollection,
  fcB: GeoFeatureCollection
): GeoFeatureCollection {
  const polysA = extractPolygons(fcA);
  const polysB = extractPolygons(fcB);
  if (polysA.length === 0 || polysB.length === 0) {
    throw new Error('Intersect requiere capas de polígonos en ambas entradas.');
  }
  const out: Feature[] = [];
  for (const a of polysA) {
    for (const b of polysB) {
      const inter = turf.intersect(turf.featureCollection([a, b]));
      if (inter) {
        out.push({
          ...inter,
          properties: {
            ...(a.properties || {}),
            intersect_source: b.properties?.name || b.properties?.nombre || 'Capa B',
            area_ha: Math.round((turf.area(inter as any) / 10000) * 100) / 100,
          },
        });
      }
    }
  }
  return { type: 'FeatureCollection', features: out as any };
}

export function runVectorClip(
  targetFc: GeoFeatureCollection,
  clipMaskFc: GeoFeatureCollection
): GeoFeatureCollection {
  const masks = extractPolygons(clipMaskFc);
  if (masks.length === 0) {
    throw new Error('Clip requiere al menos un polígono máscara.');
  }
  const out: Feature[] = [];
  for (const f of targetFc.features) {
    if (!f.geometry) continue;
    if (f.geometry.type === 'Point') {
      const inside = masks.some((m) => turf.booleanPointInPolygon(f as any, m));
      if (inside) out.push(f);
    } else if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
      for (const m of masks) {
        const clipped = turf.intersect(turf.featureCollection([f as any, m]));
        if (clipped) {
          out.push({
            ...clipped,
            properties: {
              ...(f.properties || {}),
              area_ha: Math.round((turf.area(clipped as any) / 10000) * 100) / 100,
            },
          });
        }
      }
    } else if (f.geometry.type === 'LineString') {
      const maskBbox = turf.bbox(turf.featureCollection(masks));
      const clippedLine = turf.bboxClip(f as any, maskBbox);
      if ((clippedLine.geometry as any).coordinates.length > 0) {
        out.push({ ...clippedLine, properties: { ...(f.properties || {}) } });
      }
    }
  }
  return { type: 'FeatureCollection', features: out as any };
}

export function runVectorUnion(
  fcA: GeoFeatureCollection,
  fcB: GeoFeatureCollection
): GeoFeatureCollection {
  const allPolys = [...extractPolygons(fcA), ...extractPolygons(fcB)];
  if (allPolys.length === 0) {
    throw new Error('Union requiere polígonos válidos.');
  }
  let merged: Feature<Polygon | MultiPolygon> = allPolys[0];
  for (let i = 1; i < allPolys.length; i++) {
    const u = turf.union(turf.featureCollection([merged, allPolys[i]]));
    if (u) merged = u;
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        ...merged,
        properties: {
          name: 'Unión Geométrica',
          area_ha: Math.round((turf.area(merged as any) / 10000) * 100) / 100,
        },
      },
    ],
  };
}

export function runVectorDifference(
  fcA: GeoFeatureCollection,
  fcB: GeoFeatureCollection
): GeoFeatureCollection {
  const polysA = extractPolygons(fcA);
  const polysB = extractPolygons(fcB);
  if (polysA.length === 0) {
    throw new Error('Difference requiere polígonos en la capa base.');
  }
  if (polysB.length === 0) return fcA;
  const out: Feature[] = [];
  for (const a of polysA) {
    let current: Feature<Polygon | MultiPolygon> | null = a;
    for (const b of polysB) {
      if (!current) break;
      current = turf.difference(turf.featureCollection([current, b]));
    }
    if (current) {
      out.push({
        ...current,
        properties: {
          ...(a.properties || {}),
          area_ha: Math.round((turf.area(current as any) / 10000) * 100) / 100,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features: out as any };
}

export function runVectorCentroids(fc: GeoFeatureCollection): GeoFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features
      .filter((f) => Boolean(f.geometry))
      .map((f, idx) => {
        const c = turf.centroid(f as any);
        const areaHa =
          f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
            ? Math.round((turf.area(f as any) / 10000) * 100) / 100
            : 0;
        return {
          ...c,
          properties: {
            ...(f.properties || {}),
            centroid_idx: idx + 1,
            source_area_ha: areaHa,
          },
        };
      }),
  };
}

export function runVectorConvexHull(fc: GeoFeatureCollection): GeoFeatureCollection {
  if (fc.features.length === 0) throw new Error('Convex Hull requiere elementos en la capa.');
  const hull = turf.convex(fc as any);
  if (!hull) throw new Error('Se requieren al menos 3 puntos no colineales para Convex Hull.');
  return {
    type: 'FeatureCollection',
    features: [
      {
        ...hull,
        properties: {
          name: 'Envolvente Convexa (Convex Hull)',
          area_ha: Math.round((turf.area(hull as any) / 10000) * 100) / 100,
        },
      },
    ],
  };
}

export function runVectorVoronoi(fc: GeoFeatureCollection): GeoFeatureCollection {
  const pts = fc.features.filter((f) => f.geometry?.type === 'Point');
  const sourcePts =
    pts.length >= 2
      ? turf.featureCollection(pts as any)
      : runVectorCentroids(fc);
  if (sourcePts.features.length < 2) {
    throw new Error('Polígonos de Thiessen / Voronoi requieren al menos 2 puntos.');
  }
  const b = turf.bbox(sourcePts as any);
  const padX = Math.max((b[2] - b[0]) * 0.25, 0.01);
  const padY = Math.max((b[3] - b[1]) * 0.25, 0.01);
  const vor = turf.voronoi(sourcePts as any, {
    bbox: [b[0] - padX, b[1] - padY, b[2] + padX, b[3] + padY],
  });
  return {
    type: 'FeatureCollection',
    features: vor.features
      .filter((f): f is Feature<Polygon> => Boolean(f))
      .map((f, idx) => ({
        ...f,
        properties: {
          ...(sourcePts.features[idx]?.properties || {}),
          thiessen_id: idx + 1,
          area_ha: Math.round((turf.area(f as any) / 10000) * 100) / 100,
        },
      })),
  };
}

export function runVectorSpatialJoin(
  targetFc: GeoFeatureCollection,
  joinFc: GeoFeatureCollection
): GeoFeatureCollection {
  const joinPolys = extractPolygons(joinFc);
  if (joinPolys.length === 0) {
    throw new Error('Spatial Join requiere polígonos en la capa de unión.');
  }
  return {
    type: 'FeatureCollection',
    features: targetFc.features.map((f) => {
      const refPt = f.geometry.type === 'Point' ? (f as any) : turf.centroid(f as any);
      const matched = joinPolys.find((p) => turf.booleanPointInPolygon(refPt, p));
      return {
        ...f,
        properties: {
          ...(f.properties || {}),
          joined_zone: matched ? matched.properties?.name || matched.properties?.nombre || 'Zona intersectada' : 'Fuera de cobertura',
          joined_category: matched?.properties?.category || matched?.properties?.uso || null,
        },
      };
    }),
  };
}

export function selectFeaturesByAttribute(
  fc: GeoFeatureCollection,
  field: string,
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains',
  rawValue: string
): GeoFeatureCollection {
  const numVal = Number(rawValue);
  const filtered = fc.features.filter((f) => {
    const actual = f.properties?.[field];
    if (actual === undefined || actual === null) return false;
    if (operator === 'contains') {
      return String(actual).toLowerCase().includes(rawValue.toLowerCase());
    }
    const actualNum = Number(actual);
    const useNumeric = !Number.isNaN(numVal) && rawValue.trim() !== '' && !Number.isNaN(actualNum);
    switch (operator) {
      case '=':
        return useNumeric ? actualNum === numVal : String(actual).toLowerCase() === rawValue.toLowerCase();
      case '!=':
        return useNumeric ? actualNum !== numVal : String(actual).toLowerCase() !== rawValue.toLowerCase();
      case '>':
        return useNumeric && actualNum > numVal;
      case '<':
        return useNumeric && actualNum < numVal;
      case '>=':
        return useNumeric && actualNum >= numVal;
      case '<=':
        return useNumeric && actualNum <= numVal;
      default:
        return false;
    }
  });
  return { type: 'FeatureCollection', features: filtered };
}

export function selectFeaturesByLocation(
  targetFc: GeoFeatureCollection,
  maskFc: GeoFeatureCollection,
  predicate: 'intersects' | 'within_distance',
  distanceMeters: number = 500
): GeoFeatureCollection {
  const searchFc =
    predicate === 'within_distance'
      ? runVectorBuffer(maskFc, distanceMeters, false)
      : maskFc;

  const matched = targetFc.features.filter((f) =>
    searchFc.features.some((m) => {
      try {
        return turf.booleanIntersects(f as any, m as any);
      } catch {
        return false;
      }
    })
  );
  return { type: 'FeatureCollection', features: matched };
}

// =========================================================
// 3. SPATIAL STATISTICS & IDW INTERPOLATION
// =========================================================

export function computeIdwRasterGrid(
  pointsFc: GeoFeatureCollection,
  valueField: string,
  bounds: [number, number, number, number],
  cols: number = 32,
  rows: number = 32,
  power: number = 2
): DemGrid {
  const pts = pointsFc.features
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => ({
      lng: (f.geometry as Point).coordinates[0],
      lat: (f.geometry as Point).coordinates[1],
      val: Number(f.properties?.[valueField]),
    }))
    .filter((p) => Number.isFinite(p.val));

  if (pts.length === 0) {
    throw new Error(`No se encontraron puntos con atributo numérico "${valueField}".`);
  }

  const [minLng, minLat, maxLng, maxLat] = bounds;
  const dx = (maxLng - minLng) / cols;
  const dy = (maxLat - minLat) / rows;
  const values: number[] = new Array(rows * cols);

  for (let r = 0; r < rows; r++) {
    const lat = maxLat - (r + 0.5) * dy;
    for (let c = 0; c < cols; c++) {
      const lng = minLng + (c + 0.5) * dx;
      let num = 0;
      let den = 0;
      let exactVal: number | null = null;
      for (const p of pts) {
        const dist = Math.hypot((lng - p.lng) * 111320 * Math.cos((lat * Math.PI) / 180), (lat - p.lat) * 110540);
        if (dist < 1) {
          exactVal = p.val;
          break;
        }
        const w = 1 / Math.pow(dist, power);
        num += w * p.val;
        den += w;
      }
      values[r * cols + c] = exactVal !== null ? exactVal : Math.round((num / den) * 100) / 100;
    }
  }

  const widthMeters = turf.distance([minLng, (minLat + maxLat) / 2], [maxLng, (minLat + maxLat) / 2], {
    units: 'meters',
  });

  return {
    id: `idw-${Date.now()}`,
    name: `Interpolación IDW (${valueField})`,
    cols,
    rows,
    cellSizeMeters: Math.max(10, Math.round(widthMeters / cols)),
    bounds,
    crs: 'EPSG:4326',
    noData: -9999,
    unit: valueField,
    values,
    colorScale: 'idw',
  };
}

export interface MoransIResult {
  moransI: number;
  expectedI: number;
  zScore: number;
  n: number;
  pattern: 'Agrupado (Clustered)' | 'Disperso' | 'Aleatorio';
}

export function computeMoransI(
  pointsFc: GeoFeatureCollection,
  valueField: string,
  thresholdMeters: number = 5000
): MoransIResult {
  const pts = pointsFc.features
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => ({
      coord: (f.geometry as Point).coordinates as [number, number],
      val: Number(f.properties?.[valueField]),
    }))
    .filter((p) => Number.isFinite(p.val));

  const n = pts.length;
  if (n < 3) {
    throw new Error(`Autocorrelación Moran's I requiere al menos 3 puntos con "${valueField}".`);
  }

  const mean = pts.reduce((s, p) => s + p.val, 0) / n;
  const devs = pts.map((p) => p.val - mean);
  const sumSq = devs.reduce((s, d) => s + d * d, 0);
  if (sumSq === 0) {
    return { moransI: 0, expectedI: -1 / (n - 1), zScore: 0, n, pattern: 'Aleatorio' };
  }

  let s0 = 0;
  let num = 0;
  let s1 = 0;
  let s2 = 0;

  const weights: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const distM = turf.distance(pts[i].coord, pts[j].coord, { units: 'meters' });
      if (distM <= thresholdMeters) {
        const w = 1 / Math.max(distM / 1000, 0.1);
        weights[i][j] = w;
        s0 += w;
        num += w * devs[i] * devs[j];
      }
    }
  }

  if (s0 === 0) {
    // Fallback to inverse distance across all pairs if threshold had no neighbors
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const distKm = Math.max(turf.distance(pts[i].coord, pts[j].coord, { units: 'kilometers' }), 0.1);
        const w = 1 / distKm;
        weights[i][j] = w;
        s0 += w;
        num += w * devs[i] * devs[j];
      }
    }
  }

  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    let colSum = 0;
    for (let j = 0; j < n; j++) {
      rowSum += weights[i][j];
      colSum += weights[j][i];
      s1 += 0.5 * Math.pow(weights[i][j] + weights[j][i], 2);
    }
    s2 += Math.pow(rowSum + colSum, 2);
  }

  const moransI = (n / s0) * (num / sumSq);
  const expectedI = -1 / (n - 1);
  // Standard variance approximation under randomization
  const m4 = devs.reduce((s, d) => s + Math.pow(d, 4), 0) / n;
  const m2 = sumSq / n;
  const b2 = m4 / (m2 * m2);
  const s0Sq = s0 * s0;
  const numVar =
    n * ((n * n - 3 * n + 3) * s1 - n * s2 + 3 * s0Sq) -
    b2 * ((n * n - n) * s1 - 2 * n * s2 + 6 * s0Sq);
  const denVar = (n - 1) * (n - 2) * (n - 3) * s0Sq;
  const variance = n > 3 && denVar > 0 ? Math.max(numVar / denVar - expectedI * expectedI, 1e-6) : 0.05;
  const zScore = (moransI - expectedI) / Math.sqrt(variance);

  const pattern: MoransIResult['pattern'] =
    zScore > 1.65 ? 'Agrupado (Clustered)' : zScore < -1.65 ? 'Disperso' : 'Aleatorio';

  return {
    moransI: Math.round(moransI * 1000) / 1000,
    expectedI: Math.round(expectedI * 1000) / 1000,
    zScore: Math.round(zScore * 100) / 100,
    n,
    pattern,
  };
}

export function computeGetisOrdGiStar(
  pointsFc: GeoFeatureCollection,
  valueField: string,
  distanceMeters: number = 5000
): GeoFeatureCollection {
  const pts = pointsFc.features
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => ({
      feature: f,
      coord: (f.geometry as Point).coordinates as [number, number],
      val: Number(f.properties?.[valueField]),
    }))
    .filter((p) => Number.isFinite(p.val));

  const n = pts.length;
  if (n < 3) {
    throw new Error(`Getis-Ord Gi* requiere al menos 3 puntos con "${valueField}".`);
  }

  const mean = pts.reduce((s, p) => s + p.val, 0) / n;
  const variance = pts.reduce((s, p) => s + Math.pow(p.val - mean, 2), 0) / n;
  const S = Math.sqrt(variance);

  const outFeatures = pts.map((pi, i) => {
    let sumWijXj = 0;
    let sumWij = 0;
    let sumWijSq = 0;
    for (let j = 0; j < n; j++) {
      const dist = i === j ? 0 : turf.distance(pi.coord, pts[j].coord, { units: 'meters' });
      const w = dist <= distanceMeters ? 1 : 0;
      if (w > 0) {
        sumWijXj += w * pts[j].val;
        sumWij += w;
        sumWijSq += w * w;
      }
    }
    const denom = S * Math.sqrt((n * sumWijSq - sumWij * sumWij) / Math.max(n - 1, 1));
    const zScore = denom > 0 ? (sumWijXj - mean * sumWij) / denom : 0;
    const roundedZ = Math.round(zScore * 100) / 100;

    let giClass = 'No Significativo';
    if (roundedZ >= 2.58) giClass = 'Hotspot 99%';
    else if (roundedZ >= 1.96) giClass = 'Hotspot 95%';
    else if (roundedZ <= -2.58) giClass = 'Coldspot 99%';
    else if (roundedZ <= -1.96) giClass = 'Coldspot 95%';

    return {
      ...pi.feature,
      properties: {
        ...(pi.feature.properties || {}),
        gi_zscore: roundedZ,
        gi_class: giClass,
      },
    };
  });

  return { type: 'FeatureCollection', features: outFeatures };
}

// =========================================================
// 4. DEM, TERRAIN MORPHOMETRY, HYDROLOGY & VIEWSHED
// =========================================================

function getCell(dem: DemGrid, r: number, c: number): number {
  const cr = Math.max(0, Math.min(dem.rows - 1, r));
  const cc = Math.max(0, Math.min(dem.cols - 1, c));
  return dem.values[cr * dem.cols + cc];
}

export function computeSlopeGrid(dem: DemGrid): {
  grid: DemGrid;
  minDeg: number;
  maxDeg: number;
  meanDeg: number;
  steepPct: number;
} {
  const out = new Array<number>(dem.rows * dem.cols);
  const cell = dem.cellSizeMeters;
  let minDeg = Infinity;
  let maxDeg = -Infinity;
  let sum = 0;
  let steepCount = 0;

  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      const a = getCell(dem, r - 1, c - 1);
      const b = getCell(dem, r - 1, c);
      const d = getCell(dem, r - 1, c + 1);
      const e = getCell(dem, r, c - 1);
      const f = getCell(dem, r, c + 1);
      const g = getCell(dem, r + 1, c - 1);
      const h = getCell(dem, r + 1, c);
      const i = getCell(dem, r + 1, c + 1);

      const dzdx = (d + 2 * f + i - (a + 2 * e + g)) / (8 * cell);
      const dzdy = (g + 2 * h + i - (a + 2 * b + d)) / (8 * cell);
      const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
      const slopeDeg = Math.round(((slopeRad * 180) / Math.PI) * 100) / 100;

      out[r * dem.cols + c] = slopeDeg;
      if (slopeDeg < minDeg) minDeg = slopeDeg;
      if (slopeDeg > maxDeg) maxDeg = slopeDeg;
      sum += slopeDeg;
      if (slopeDeg > 25) steepCount++;
    }
  }

  return {
    grid: {
      ...dem,
      id: `slope-${Date.now()}`,
      name: `Pendiente (°) — ${dem.name}`,
      unit: 'grados',
      values: out,
      colorScale: 'slope',
    },
    minDeg: Math.round(minDeg * 100) / 100,
    maxDeg: Math.round(maxDeg * 100) / 100,
    meanDeg: Math.round((sum / out.length) * 100) / 100,
    steepPct: Math.round((steepCount / out.length) * 1000) / 10,
  };
}

export function computeAspectGrid(dem: DemGrid): DemGrid {
  const out = new Array<number>(dem.rows * dem.cols);
  const cell = dem.cellSizeMeters;

  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      const a = getCell(dem, r - 1, c - 1);
      const b = getCell(dem, r - 1, c);
      const d = getCell(dem, r - 1, c + 1);
      const e = getCell(dem, r, c - 1);
      const f = getCell(dem, r, c + 1);
      const g = getCell(dem, r + 1, c - 1);
      const h = getCell(dem, r + 1, c);
      const i = getCell(dem, r + 1, c + 1);

      const dzdx = (d + 2 * f + i - (a + 2 * e + g)) / (8 * cell);
      const dzdy = (g + 2 * h + i - (a + 2 * b + d)) / (8 * cell);

      if (dzdx === 0 && dzdy === 0) {
        out[r * dem.cols + c] = -1;
        continue;
      }
      let aspect = (Math.atan2(dzdy, -dzdx) * 180) / Math.PI;
      if (aspect < 0) aspect = 90 - aspect;
      else if (aspect > 90) aspect = 360 - aspect + 90;
      else aspect = 90 - aspect;
      out[r * dem.cols + c] = Math.round(((aspect + 360) % 360) * 10) / 10;
    }
  }

  return {
    ...dem,
    id: `aspect-${Date.now()}`,
    name: `Orientación de Laderas (°) — ${dem.name}`,
    unit: 'azimut°',
    values: out,
    colorScale: 'aspect',
  };
}

export function computeHillshadeGrid(
  dem: DemGrid,
  azimuthDeg: number = 315,
  altitudeDeg: number = 45
): DemGrid {
  const out = new Array<number>(dem.rows * dem.cols);
  const cell = dem.cellSizeMeters;
  const zenithRad = ((90 - altitudeDeg) * Math.PI) / 180;
  const azimuthRad = ((360 - azimuthDeg + 90) * Math.PI) / 180;

  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      const a = getCell(dem, r - 1, c - 1);
      const b = getCell(dem, r - 1, c);
      const d = getCell(dem, r - 1, c + 1);
      const e = getCell(dem, r, c - 1);
      const f = getCell(dem, r, c + 1);
      const g = getCell(dem, r + 1, c - 1);
      const h = getCell(dem, r + 1, c);
      const i = getCell(dem, r + 1, c + 1);

      const dzdx = (d + 2 * f + i - (a + 2 * e + g)) / (8 * cell);
      const dzdy = (g + 2 * h + i - (a + 2 * b + d)) / (8 * cell);
      const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
      const aspectRad = dzdx !== 0 ? Math.atan2(dzdy, -dzdx) : Math.PI / 2;

      const hs =
        255 *
        (Math.cos(zenithRad) * Math.cos(slopeRad) +
          Math.sin(zenithRad) * Math.sin(slopeRad) * Math.cos(azimuthRad - aspectRad));
      out[r * dem.cols + c] = Math.max(0, Math.min(255, Math.round(hs)));
    }
  }

  return {
    ...dem,
    id: `hillshade-${Date.now()}`,
    name: `Modelo Sombreado (Hillshade) — ${dem.name}`,
    unit: 'iluminación',
    values: out,
    colorScale: 'hillshade',
  };
}

export function computeCurvatureGrid(dem: DemGrid): DemGrid {
  const out = new Array<number>(dem.rows * dem.cols);
  const c2 = dem.cellSizeMeters * dem.cellSizeMeters;

  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      const z = getCell(dem, r, c);
      const zn = getCell(dem, r - 1, c);
      const zs = getCell(dem, r + 1, c);
      const ze = getCell(dem, r, c + 1);
      const zw = getCell(dem, r, c - 1);
      const laplacian = ((zn + zs + ze + zw) - 4 * z) / c2;
      out[r * dem.cols + c] = Math.round(laplacian * 10000) / 100; // 1/100m
    }
  }

  return {
    ...dem,
    id: `curv-${Date.now()}`,
    name: `Curvatura del Terreno — ${dem.name}`,
    unit: '1/100m',
    values: out,
    colorScale: 'slope',
  };
}

export function computeHydrologyD8AndTwi(dem: DemGrid): {
  twiGrid: DemGrid;
  maxFlowAccumulation: number;
  floodPronePct: number;
  meanTwi: number;
} {
  const n = dem.rows * dem.cols;
  const receiver = new Int32Array(n).fill(-1);
  const dr = [-1, -1, 0, 1, 1, 1, 0, -1];
  const dc = [0, 1, 1, 1, 0, -1, -1, -1];
  const distFactor = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

  // D8 steepest descent
  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      const idx = r * dem.cols + c;
      const z = dem.values[idx];
      let bestSlope = 0;
      let bestTarget = -1;
      for (let k = 0; k < 8; k++) {
        const nr = r + dr[k];
        const nc = c + dc[k];
        if (nr < 0 || nr >= dem.rows || nc < 0 || nc >= dem.cols) continue;
        const nIdx = nr * dem.cols + nc;
        const slope = (z - dem.values[nIdx]) / (dem.cellSizeMeters * distFactor[k]);
        if (slope > bestSlope) {
          bestSlope = slope;
          bestTarget = nIdx;
        }
      }
      receiver[idx] = bestTarget;
    }
  }

  // Topological order from highest elevation to lowest to accumulate flow in O(n log n)
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => dem.values[b] - dem.values[a]);
  const flowAcc = new Float64Array(n).fill(1);
  for (const idx of order) {
    const target = receiver[idx];
    if (target >= 0) {
      flowAcc[target] += flowAcc[idx];
    }
  }

  const slopeRes = computeSlopeGrid(dem);
  const twiValues = new Array<number>(n);
  let maxFlowAccumulation = 1;
  let floodCount = 0;
  let sumTwi = 0;

  for (let i = 0; i < n; i++) {
    if (flowAcc[i] > maxFlowAccumulation) maxFlowAccumulation = flowAcc[i];
    const tanBeta = Math.max(Math.tan((slopeRes.grid.values[i] * Math.PI) / 180), 0.005);
    const specificCatchmentArea = (flowAcc[i] * dem.cellSizeMeters);
    const twi = Math.round(Math.log(specificCatchmentArea / tanBeta) * 100) / 100;
    twiValues[i] = twi;
    sumTwi += twi;
    if (twi >= 8.5) floodCount++;
  }

  return {
    twiGrid: {
      ...dem,
      id: `twi-${Date.now()}`,
      name: `Índice Topográfico de Humedad (TWI / Susceptibilidad Hídrica)`,
      unit: 'TWI',
      values: twiValues,
      colorScale: 'twi',
    },
    maxFlowAccumulation: Math.round(maxFlowAccumulation),
    floodPronePct: Math.round((floodCount / n) * 1000) / 10,
    meanTwi: Math.round((sumTwi / n) * 100) / 100,
  };
}

export function sampleDemElevation(dem: DemGrid, lng: number, lat: number): number {
  const [minLng, minLat, maxLng, maxLat] = dem.bounds;
  const nx = ((lng - minLng) / Math.max(maxLng - minLng, 1e-9)) * (dem.cols - 1);
  const ny = ((maxLat - lat) / Math.max(maxLat - minLat, 1e-9)) * (dem.rows - 1);
  const c0 = Math.max(0, Math.min(dem.cols - 1, Math.floor(nx)));
  const r0 = Math.max(0, Math.min(dem.rows - 1, Math.floor(ny)));
  const c1 = Math.min(dem.cols - 1, c0 + 1);
  const r1 = Math.min(dem.rows - 1, r0 + 1);
  const tx = Math.max(0, Math.min(1, nx - c0));
  const ty = Math.max(0, Math.min(1, ny - r0));

  const z00 = getCell(dem, r0, c0);
  const z10 = getCell(dem, r0, c1);
  const z01 = getCell(dem, r1, c0);
  const z11 = getCell(dem, r1, c1);
  const z0 = z00 * (1 - tx) + z10 * tx;
  const z1 = z01 * (1 - tx) + z11 * tx;
  return Math.round((z0 * (1 - ty) + z1 * ty) * 100) / 100;
}

export interface ElevationProfilePoint {
  distanceM: number;
  elevationM: number;
  lng: number;
  lat: number;
}

export function extractElevationProfile(
  dem: DemGrid,
  lineCoords: Array<[number, number]>,
  samples: number = 32
): {
  points: ElevationProfilePoint[];
  minElevM: number;
  maxElevM: number;
  reliefM: number;
  totalLengthM: number;
} {
  if (lineCoords.length < 2) {
    throw new Error('El perfil topográfico requiere al menos 2 vértices.');
  }
  const line = turf.lineString(lineCoords);
  const totalKm = turf.length(line, { units: 'kilometers' });
  const totalLengthM = Math.round(totalKm * 1000 * 10) / 10;

  const points: ElevationProfilePoint[] = [];
  let minElevM = Infinity;
  let maxElevM = -Infinity;

  for (let i = 0; i <= samples; i++) {
    const frac = i / samples;
    const pt = turf.along(line, totalKm * frac, { units: 'kilometers' });
    const [lng, lat] = pt.geometry.coordinates as [number, number];
    const elev = sampleDemElevation(dem, lng, lat);
    if (elev < minElevM) minElevM = elev;
    if (elev > maxElevM) maxElevM = elev;
    points.push({
      distanceM: Math.round(totalLengthM * frac * 10) / 10,
      elevationM: elev,
      lng,
      lat,
    });
  }

  return {
    points,
    minElevM: Math.round(minElevM * 100) / 100,
    maxElevM: Math.round(maxElevM * 100) / 100,
    reliefM: Math.round((maxElevM - minElevM) * 100) / 100,
    totalLengthM,
  };
}

export function computeCutFillVolume(
  dem: DemGrid,
  targetElevationM: number
): {
  cutVolumeM3: number;
  fillVolumeM3: number;
  netVolumeM3: number;
  areaHa: number;
} {
  const cellAreaM2 = dem.cellSizeMeters * dem.cellSizeMeters;
  let cutM3 = 0;
  let fillM3 = 0;

  for (const z of dem.values) {
    const diff = z - targetElevationM;
    if (diff > 0) cutM3 += diff * cellAreaM2;
    else if (diff < 0) fillM3 += Math.abs(diff) * cellAreaM2;
  }

  return {
    cutVolumeM3: Math.round(cutM3),
    fillVolumeM3: Math.round(fillM3),
    netVolumeM3: Math.round(cutM3 - fillM3),
    areaHa: Math.round(((dem.values.length * cellAreaM2) / 10000) * 100) / 100,
  };
}

export function computeViewshedGrid(
  dem: DemGrid,
  obsCol: number,
  obsRow: number,
  observerHeightM: number = 2,
  maxRadiusCells: number = 20
): { grid: DemGrid; visiblePct: number } {
  const c0 = Math.max(0, Math.min(dem.cols - 1, obsCol));
  const r0 = Math.max(0, Math.min(dem.rows - 1, obsRow));
  const obsElev = getCell(dem, r0, c0) + observerHeightM;
  const out = new Array<number>(dem.rows * dem.cols).fill(0);

  let evaluated = 0;
  let visibleCount = 0;

  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      const distCells = Math.hypot(c - c0, r - r0);
      if (distCells > maxRadiusCells) continue;
      evaluated++;
      if (distCells === 0) {
        out[r * dem.cols + c] = 1;
        visibleCount++;
        continue;
      }

      const targetElev = getCell(dem, r, c);
      const targetAngle = (targetElev - obsElev) / (distCells * dem.cellSizeMeters);
      const steps = Math.max(2, Math.ceil(distCells * 2));
      let blocked = false;

      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const sr = Math.round(r0 + (r - r0) * t);
        const sc = Math.round(c0 + (c - c0) * t);
        const sd = Math.hypot(sc - c0, sr - r0) * dem.cellSizeMeters;
        if (sd <= 0) continue;
        const rayAngle = (getCell(dem, sr, sc) - obsElev) / sd;
        if (rayAngle > targetAngle + 1e-5) {
          blocked = true;
          break;
        }
      }

      if (!blocked) {
        out[r * dem.cols + c] = 1;
        visibleCount++;
      }
    }
  }

  return {
    grid: {
      ...dem,
      id: `viewshed-${Date.now()}`,
      name: `Cuenca Visual (Viewshed desde [${c0},${r0}])`,
      unit: 'visibilidad (0/1)',
      values: out,
      colorScale: 'classes',
      classLabels: ['Oculto', 'Visible'],
    },
    visiblePct: evaluated > 0 ? Math.round((visibleCount / evaluated) * 1000) / 10 : 0,
  };
}

// =========================================================
// 5. REMOTE SENSING SPECTRAL & MULTITEMPORAL ENGINE
// =========================================================

export type SpectralIndexType = 'NDVI' | 'NDWI' | 'MNDWI' | 'NDBI' | 'SAVI' | 'EVI' | 'NBR';

export function computeSpectralIndex(
  scene: SpectralScene,
  dateSlot: 't1' | 't2',
  indexType: SpectralIndexType
): {
  grid: DemGrid;
  min: number;
  max: number;
  mean: number;
  positiveCoveragePct: number;
} {
  const bands = scene[dateSlot];
  const n = scene.rows * scene.cols;
  const values = new Array<number>(n);

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let positiveCount = 0;

  for (let i = 0; i < n; i++) {
    const b = bands.blue[i];
    const g = bands.green[i];
    const r = bands.red[i];
    const nir = bands.nir[i];
    const s1 = bands.swir1[i];
    const s2 = bands.swir2[i];

    let val = 0;
    switch (indexType) {
      case 'NDVI':
        val = (nir - r) / Math.max(nir + r, 1e-6);
        break;
      case 'NDWI':
        val = (g - nir) / Math.max(g + nir, 1e-6);
        break;
      case 'MNDWI':
        val = (g - s1) / Math.max(g + s1, 1e-6);
        break;
      case 'NDBI':
        val = (s1 - nir) / Math.max(s1 + nir, 1e-6);
        break;
      case 'SAVI':
        val = ((nir - r) / Math.max(nir + r + 0.5, 1e-6)) * 1.5;
        break;
      case 'EVI':
        val = (2.5 * (nir - r)) / Math.max(nir + 6 * r - 7.5 * b + 1, 1e-6);
        break;
      case 'NBR':
        val = (nir - s2) / Math.max(nir + s2, 1e-6);
        break;
    }

    const clamped = Math.max(-1, Math.min(1, Math.round(val * 1000) / 1000));
    values[i] = clamped;
    if (clamped < min) min = clamped;
    if (clamped > max) max = clamped;
    sum += clamped;
    if (clamped > 0.25) positiveCount++;
  }

  return {
    grid: {
      id: `idx-${indexType}-${dateSlot}-${Date.now()}`,
      name: `${indexType} (${bands.sensor} · ${bands.date})`,
      cols: scene.cols,
      rows: scene.rows,
      cellSizeMeters: scene.cellSizeMeters,
      bounds: scene.bounds,
      crs: scene.crs,
      noData: -9999,
      unit: indexType,
      values,
      colorScale: indexType === 'NDWI' || indexType === 'MNDWI' ? 'ndwi' : indexType === 'NDBI' ? 'thermal' : 'ndvi',
    },
    min: Math.round(min * 1000) / 1000,
    max: Math.round(max * 1000) / 1000,
    mean: Math.round((sum / n) * 1000) / 1000,
    positiveCoveragePct: Math.round((positiveCount / n) * 1000) / 10,
  };
}

export function computeSpectralChange(
  scene: SpectralScene,
  indexType: SpectralIndexType
): {
  deltaGrid: DemGrid;
  meanDelta: number;
  significantLossPct: number;
  significantGainPct: number;
  unchangedPct: number;
} {
  const res1 = computeSpectralIndex(scene, 't1', indexType);
  const res2 = computeSpectralIndex(scene, 't2', indexType);
  const n = res1.grid.values.length;
  const deltaVals = new Array<number>(n);

  let sumDelta = 0;
  let lossCount = 0;
  let gainCount = 0;

  for (let i = 0; i < n; i++) {
    const d = Math.round((res2.grid.values[i] - res1.grid.values[i]) * 1000) / 1000;
    deltaVals[i] = d;
    sumDelta += d;
    if (d <= -0.1) lossCount++;
    else if (d >= 0.1) gainCount++;
  }

  const unchangedCount = n - lossCount - gainCount;
  return {
    deltaGrid: {
      ...res2.grid,
      id: `delta-${indexType}-${Date.now()}`,
      name: `Cambio Multitemporal Δ${indexType} (${scene.t1.date} → ${scene.t2.date})`,
      unit: `Δ${indexType}`,
      values: deltaVals,
      colorScale: 'thermal',
    },
    meanDelta: Math.round((sumDelta / n) * 1000) / 1000,
    significantLossPct: Math.round((lossCount / n) * 1000) / 10,
    significantGainPct: Math.round((gainCount / n) * 1000) / 10,
    unchangedPct: Math.round((unchangedCount / n) * 1000) / 10,
  };
}

export function classifyLandCoverKMeans(
  scene: SpectralScene,
  dateSlot: 't1' | 't2'
): {
  classGrid: DemGrid;
  breakdown: Array<{ classIndex: number; label: string; hectares: number; percent: number }>;
} {
  const bands = scene[dateSlot];
  const n = scene.rows * scene.cols;
  const k = 4;

  // Deterministic initial centroids [red, green, nir, swir1]
  // 0: Agua, 1: Suelo/Infraestructura, 2: Vegetación Dispersa, 3: Cobertura Densa
  const centroids: number[][] = [
    [0.06, 0.09, 0.04, 0.02],
    [0.24, 0.22, 0.28, 0.34],
    [0.14, 0.16, 0.38, 0.22],
    [0.07, 0.11, 0.62, 0.14],
  ];

  const labels = new Array<number>(n).fill(0);
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < n; i++) {
      let bestC = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const dist =
          Math.pow(bands.red[i] - centroids[c][0], 2) +
          Math.pow(bands.green[i] - centroids[c][1], 2) +
          Math.pow(bands.nir[i] - centroids[c][2], 2) +
          Math.pow(bands.swir1[i] - centroids[c][3], 2);
        if (dist < bestDist) {
          bestDist = dist;
          bestC = c;
        }
      }
      labels[i] = bestC;
    }

    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      counts[c]++;
      sums[c][0] += bands.red[i];
      sums[c][1] += bands.green[i];
      sums[c][2] += bands.nir[i];
      sums[c][3] += bands.swir1[i];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c] = sums[c].map((s) => s / counts[c]);
      }
    }
  }

  // Sort clusters by NDVI-like signature (nir - red) so classes keep semantic order
  const order = centroids
    .map((c, idx) => ({ idx, score: c[2] - c[0] - (c[3] > c[1] && c[2] < 0.12 ? 0.5 : 0) }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.idx);

  const remap = new Array<number>(k);
  order.forEach((oldIdx, newIdx) => {
    remap[oldIdx] = newIdx;
  });

  const remapped = labels.map((l) => remap[l]);
  const classNames = [
    'Cuerpo de Agua / Humedad Alta',
    'Suelo Desnudo / Infraestructura',
    'Vegetación Dispersa / Cultivo',
    'Cobertura Vegetal Densa',
  ];

  const cellAreaHa = (scene.cellSizeMeters * scene.cellSizeMeters) / 10000;
  const countsFinal = new Array<number>(k).fill(0);
  for (const l of remapped) countsFinal[l]++;

  return {
    classGrid: {
      id: `kmeans-${dateSlot}-${Date.now()}`,
      name: `Clasificación K-Means Coberturas (${bands.date})`,
      cols: scene.cols,
      rows: scene.rows,
      cellSizeMeters: scene.cellSizeMeters,
      bounds: scene.bounds,
      crs: scene.crs,
      noData: -9999,
      unit: 'clase',
      values: remapped,
      colorScale: 'classes',
      classLabels: classNames,
    },
    breakdown: classNames.map((label, idx) => ({
      classIndex: idx,
      label,
      hectares: Math.round(countsFinal[idx] * cellAreaHa * 100) / 100,
      percent: Math.round((countsFinal[idx] / n) * 1000) / 10,
    })),
  };
}

// =========================================================
// 6. GEOTECHNICAL LIMIT-EQUILIBRIUM & LIQUEFACTION ENGINE
// =========================================================

export interface SlopeStabilityInput {
  method: 'infinite_slope' | 'simplified_bishop';
  slopeAngleDeg: number;
  slopeHeightM: number;
  failureDepthM: number;
  unitWeightKnM3: number;
  cohesionKpa: number;
  frictionDeg: number;
  porePressureRatioRu: number; // 0 (dry) to 0.5 (saturated)
}

export interface SlopeStabilityResult {
  safetyFactor: number;
  stabilityClass: 'Estable (FS >= 1.50)' | 'Marginal / Precaución (1.15 <= FS < 1.50)' | 'Inestable / Crítico (FS < 1.15)';
  drivingForceOrMoment: number;
  resistingForceOrMoment: number;
  methodologyNote: string;
}

export function evaluateSlopeStability(input: SlopeStabilityInput): SlopeStabilityResult {
  const beta = (Math.max(1, Math.min(85, input.slopeAngleDeg)) * Math.PI) / 180;
  const phi = (Math.max(0, Math.min(60, input.frictionDeg)) * Math.PI) / 180;
  const ru = Math.max(0, Math.min(0.6, input.porePressureRatioRu));
  const gamma = Math.max(10, input.unitWeightKnM3);
  const c = Math.max(0, input.cohesionKpa);
  const z = Math.max(0.5, input.failureDepthM);

  let fs = 1;
  let driving = 0;
  let resisting = 0;

  if (input.method === 'infinite_slope') {
    const cosB = Math.cos(beta);
    const sinB = Math.sin(beta);
    driving = gamma * z * sinB * cosB;
    resisting = c + (gamma * z * cosB * cosB * (1 - ru)) * Math.tan(phi);
    fs = driving > 0 ? resisting / driving : 10;
  } else {
    // Simplified Bishop Method over 10 vertical slices along circular slip surface
    const H = Math.max(2, input.slopeHeightM);
    const slices = 10;
    const width = H / Math.tan(beta) / slices;
    const tanPhi = Math.tan(phi);

    // Iterative FS convergence
    fs = 1.3;
    for (let iter = 0; iter < 15; iter++) {
      let num = 0;
      let den = 0;
      for (let s = 0; s < slices; s++) {
        const frac = (s + 0.5) / slices;
        const sliceH = H * Math.sin(Math.PI * frac) * 0.55;
        const alpha = (frac - 0.3) * beta * 1.15;
        const W = gamma * sliceH * width;
        const u = ru * gamma * sliceH;
        const cosA = Math.cos(alpha);
        const sinA = Math.sin(alpha);
        const mAlpha = cosA + (sinA * tanPhi) / Math.max(fs, 0.2);

        num += (c * width + (W - u * width) * tanPhi) / Math.max(mAlpha, 0.25);
        den += W * sinA;
      }
      driving = Math.max(den, 1e-3);
      resisting = num;
      const nextFs = num / driving;
      if (Math.abs(nextFs - fs) < 0.001) {
        fs = nextFs;
        break;
      }
      fs = nextFs;
    }
  }

  const roundedFs = Math.round(Math.max(0.1, Math.min(9.99, fs)) * 100) / 100;
  const stabilityClass: SlopeStabilityResult['stabilityClass'] =
    roundedFs >= 1.5
      ? 'Estable (FS >= 1.50)'
      : roundedFs >= 1.15
      ? 'Marginal / Precaución (1.15 <= FS < 1.50)'
      : 'Inestable / Crítico (FS < 1.15)';

  return {
    safetyFactor: roundedFs,
    stabilityClass,
    drivingForceOrMoment: Math.round(driving * 100) / 100,
    resistingForceOrMoment: Math.round(resisting * 100) / 100,
    methodologyNote:
      input.method === 'infinite_slope'
        ? 'Modelo Analítico de Talud Infinito (Estimación preliminar; requiere validación geotécnica certificada de laboratorio).'
        : 'Modelo Analítico Bishop Simplificado (10 dovelas; estimación preliminar, no sustituye estudio geotécnico certificado).',
  };
}

export function evaluateLiquefactionScreening(
  sptN160: number,
  depthM: number,
  waterTableM: number,
  pgaG: number,
  unitWeightKnM3: number = 18.5
): { csr: number; crr: number; fsLiq: number; riskClass: string } {
  if (depthM <= waterTableM) {
    return {
      csr: 0,
      crr: 1,
      fsLiq: 5,
      riskClass: 'No Susceptible (Por encima del nivel freático)',
    };
  }
  const sigmaV = depthM * unitWeightKnM3;
  const sigmaVeff = sigmaV - (depthM - waterTableM) * 9.81;
  const rd = Math.max(0.5, 1 - 0.00765 * depthM);
  const csr = 0.65 * pgaG * (sigmaV / Math.max(sigmaVeff, 1)) * rd;

  const n = Math.min(34, Math.max(1, sptN160));
  const crr = n >= 30 ? 0.55 : 1 / (34 - n) + n / 135 + 50 / Math.pow(10 * n + 45, 2) - 1 / 200;
  const fsLiq = crr / Math.max(csr, 0.01);

  const riskClass =
    fsLiq >= 1.4
      ? 'Susceptibilidad Baja (FS >= 1.4)'
      : fsLiq >= 1.0
      ? 'Susceptibilidad Moderada (1.0 <= FS < 1.4)'
      : 'Susceptibilidad Alta a Licuefacción (FS < 1.0)';

  return {
    csr: Math.round(csr * 1000) / 1000,
    crr: Math.round(crr * 1000) / 1000,
    fsLiq: Math.round(fsLiq * 100) / 100,
    riskClass,
  };
}

// =========================================================
// 7. MULTI-CRITERIA TERRITORIAL AHP (SAATY) ENGINE
// =========================================================

const SAATY_RI: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0.58,
  4: 0.9,
  5: 1.12,
  6: 1.24,
};

export interface AhpResult {
  weights: number[];
  lambdaMax: number;
  consistencyIndex: number;
  consistencyRatio: number;
  isConsistent: boolean;
}

export function computeAhpWeights(matrix: number[][]): AhpResult {
  const n = matrix.length;
  const colSums = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      colSums[j] += matrix[i][j];
    }
  }

  const weights = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      rowSum += matrix[i][j] / Math.max(colSums[j], 1e-9);
    }
    weights[i] = rowSum / n;
  }

  let lambdaMax = 0;
  for (let i = 0; i < n; i++) {
    let aw = 0;
    for (let j = 0; j < n; j++) {
      aw += matrix[i][j] * weights[j];
    }
    lambdaMax += aw / Math.max(weights[i], 1e-9);
  }
  lambdaMax /= n;

  const ci = n > 2 ? (lambdaMax - n) / (n - 1) : 0;
  const ri = SAATY_RI[n] || 1.12;
  const cr = ri > 0 ? ci / ri : 0;

  return {
    weights: weights.map((w) => Math.round(w * 1000) / 1000),
    lambdaMax: Math.round(lambdaMax * 1000) / 1000,
    consistencyIndex: Math.round(ci * 1000) / 1000,
    consistencyRatio: Math.round(cr * 1000) / 1000,
    isConsistent: cr <= 0.1,
  };
}

export function computeSuitabilityGrid(
  dem: DemGrid,
  weights: { slope: number; hydrology: number; elevation: number; accessibility: number },
  excludeSteepOverDeg: number = 35
): {
  grid: DemGrid;
  highHa: number;
  mediumHa: number;
  lowHa: number;
  excludedHa: number;
} {
  const slope = computeSlopeGrid(dem).grid;
  const hydro = computeHydrologyD8AndTwi(dem).twiGrid;
  const minZ = Math.min(...dem.values);
  const maxZ = Math.max(...dem.values);
  const zRange = Math.max(maxZ - minZ, 1);

  const wSum = Math.max(weights.slope + weights.hydrology + weights.elevation + weights.accessibility, 1e-6);
  const ws = weights.slope / wSum;
  const wh = weights.hydrology / wSum;
  const we = weights.elevation / wSum;
  const wa = weights.accessibility / wSum;

  const n = dem.values.length;
  const out = new Array<number>(n);
  const cellHa = (dem.cellSizeMeters * dem.cellSizeMeters) / 10000;

  let high = 0;
  let medium = 0;
  let low = 0;
  let excluded = 0;

  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      const i = r * dem.cols + c;
      const slp = slope.values[i];
      if (slp > excludeSteepOverDeg) {
        out[i] = 0;
        excluded++;
        continue;
      }

      const slopeScore = Math.max(0, 100 - (slp / 35) * 100);
      const twi = hydro.values[i];
      const hydroScore = twi > 9.5 ? 20 : twi > 7.5 ? 60 : 95; // Penalize flood-prone high TWI
      const elevScore = 100 - Math.abs(((dem.values[i] - minZ) / zRange) * 100 - 35);
      // Accessibility proxy based on proximity to project corridor center row
      const distCenter = Math.abs(r - dem.rows * 0.5) / (dem.rows * 0.5);
      const accessScore = Math.max(10, 100 - distCenter * 75);

      const score = Math.max(
        1,
        Math.min(100, Math.round(slopeScore * ws + hydroScore * wh + elevScore * we + accessScore * wa))
      );
      out[i] = score;
      if (score >= 75) high++;
      else if (score >= 50) medium++;
      else low++;
    }
  }

  return {
    grid: {
      ...dem,
      id: `ahp-${Date.now()}`,
      name: `Idoneidad Territorial Multicriterio AHP`,
      unit: 'índice (0-100)',
      values: out,
      colorScale: 'suitability',
    },
    highHa: Math.round(high * cellHa * 100) / 100,
    mediumHa: Math.round(medium * cellHa * 100) / 100,
    lowHa: Math.round(low * cellHa * 100) / 100,
    excludedHa: Math.round(excluded * cellHa * 100) / 100,
  };
}

// =========================================================
// 8. DETERMINISTIC GEOSPATIAL WORKFLOW PLANNER (NO LLM)
// =========================================================

export interface PlannedWorkflowStep {
  tool:
    | 'slope'
    | 'twi_hydrology'
    | 'buffer'
    | 'ndvi'
    | 'spectral_change'
    | 'ahp_suitability'
    | 'slope_stability'
    | 'hotspots';
  label: string;
  agent: string;
  params: Record<string, any>;
}

export function planDeterministicGeospatialCommand(prompt: string): {
  summary: string;
  steps: PlannedWorkflowStep[];
} {
  const q = prompt.toLowerCase();
  const steps: PlannedWorkflowStep[] = [];

  if (q.includes('pendiente') || q.includes('slope') || q.includes('topograf') || q.includes('elevac') || q.includes('curva')) {
    steps.push({
      tool: 'slope',
      label: 'Cálculo de Pendientes (Algoritmo Horn 3x3 sobre DEM)',
      agent: 'Agente Topográfico',
      params: {},
    });
  }
  if (q.includes('twi') || q.includes('cuenca') || q.includes('hidr') || q.includes('inunda') || q.includes('drenaj') || q.includes('flujo')) {
    steps.push({
      tool: 'twi_hydrology',
      label: 'Modelamiento Hidrológico D8 y Susceptibilidad a Inundación (TWI)',
      agent: 'Agente Hidrológico',
      params: {},
    });
  }
  if (q.includes('buffer') || q.includes('influencia') || q.includes('proteg') || q.includes('retiro')) {
    const matchM = q.match(/(\d+)\s*m/);
    const dist = matchM ? Number(matchM[1]) : 500;
    steps.push({
      tool: 'buffer',
      label: `Generación de Área de Influencia Geodésica (${dist} m)`,
      agent: 'Agente SIG',
      params: { distanceMeters: dist },
    });
  }
  if (q.includes('compara') || q.includes('cambio') || q.includes('deforest') || q.includes('multitemp')) {
    steps.push({
      tool: 'spectral_change',
      label: 'Detección de Cambios Multitemporales Satelitales (ΔNDVI T1→T2)',
      agent: 'Agente Teledetección',
      params: { indexType: 'NDVI' },
    });
  } else if (q.includes('ndvi') || q.includes('vegeta') || q.includes('cobertura') || q.includes('satel')) {
    steps.push({
      tool: 'ndvi',
      label: 'Índice Espectral de Vigor Vegetal (NDVI)',
      agent: 'Agente Teledetección',
      params: { indexType: 'NDVI', dateSlot: 't2' },
    });
  }
  if (q.includes('talud') || q.includes('geotec') || q.includes('estabil') || q.includes('desliz') || q.includes('erosi')) {
    steps.push({
      tool: 'slope_stability',
      label: 'Evaluación de Estabilidad de Taludes (Método Bishop / Talud Infinito)',
      agent: 'Agente Geotécnico',
      params: { method: 'simplified_bishop' },
    });
  }
  if (q.includes('multicriterio') || q.includes('ahp') || q.includes('idoneidad') || q.includes('sensibil') || q.includes('estudio') || q.includes('completo')) {
    steps.push({
      tool: 'ahp_suitability',
      label: 'Evaluación Multicriterio Territorial AHP (Pendiente + Hidrología + Accesibilidad)',
      agent: 'Agente Territorial',
      params: {},
    });
  }
  if (q.includes('hotspot') || q.includes('calor') || q.includes('cluster') || q.includes('patron')) {
    steps.push({
      tool: 'hotspots',
      label: 'Análisis Estadístico Espacial (Getis-Ord Gi* y Moran\'s I)',
      agent: 'Agente Ambiental',
      params: {},
    });
  }

  if (steps.length === 0) {
    // Full baseline workflow
    steps.push(
      {
        tool: 'slope',
        label: 'Cálculo de Pendientes sobre Modelo Digital de Elevación',
        agent: 'Agente Topográfico',
        params: {},
      },
      {
        tool: 'twi_hydrology',
        label: 'Delimitación de Flujo D8 e Índice TWI de Humedad',
        agent: 'Agente Hidrológico',
        params: {},
      },
      {
        tool: 'ahp_suitability',
        label: 'Mapa de Idoneidad / Sensibilidad Territorial Multicriterio',
        agent: 'Agente Territorial',
        params: {},
      }
    );
  }

  return {
    summary: `Flujo determinístico planificado con ${steps.length} operación(es) geoespaciales reales sobre las capas del proyecto activo.`,
    steps,
  };
}
