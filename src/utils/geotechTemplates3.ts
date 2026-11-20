import {
  DemGrid,
  DigitalTwin4DFrame,
  EnterpriseRoleKey,
  GeotechProject,
  GeotechProjectVersion,
  GisLayer,
  ModelBuilderGraph,
} from './geotechEngine';
import { generateReferenceLidarSurvey } from './lidarEngine';

// =========================================================
// 1. 10 DOMAIN PROJECT TEMPLATES (SIG & GEOTECH AI 3.0)
// =========================================================

export interface ProjectTemplateSpec {
  id: string;
  title: string;
  domain: GeotechProject['domain'];
  sectorTag: string;
  description: string;
  defaultAreaHa: number;
  recommendedCrs: GeotechProject['defaultCrs'];
  formsAndAttributes: string[];
  modelGraph: ModelBuilderGraph;
}

export const GEOTECH_PROJECT_TEMPLATES: ProjectTemplateSpec[] = [
  {
    id: 'tpl-evaluacion-ambiental',
    title: '1. Evaluación Ambiental (EIA / DIA)',
    domain: 'ambiental',
    sectorTag: 'Gestión Ambiental',
    description: 'Genera red de monitoreo, áreas de influencia, buffers normativos, pendientes y modelo hidrológico TWI.',
    defaultAreaHa: 12000,
    recommendedCrs: 'EPSG:32718',
    formsAndAttributes: ['Estación Monitoreo', 'Parámetro ECA', 'Sensibilidad Ecológica'],
    modelGraph: {
      id: 'mb-tpl-eia',
      name: 'Pipeline EIA Base',
      version: 'v1.0',
      description: 'DEM → Fill Sinks → Pendiente → Buffer → AHP → Salida',
      updatedAt: '2026-11-18',
      nodes: [
        { id: 'n1', kind: 'dem_input', label: 'DEM Proyecto', x: 40, y: 80, params: {} },
        { id: 'n2', kind: 'fill_sinks', label: 'Fill Sinks', x: 200, y: 80, params: {} },
        { id: 'n3', kind: 'slope', label: 'Slope (°)', x: 360, y: 80, params: {} },
        { id: 'n4', kind: 'reclassify', label: 'Reclasificar >15°', x: 520, y: 80, params: { threshold: 15 } },
        { id: 'n5', kind: 'ahp_suitability', label: 'AHP Ambiental', x: 680, y: 80, params: { maxSlopeDeg: 35 } },
        { id: 'n6', kind: 'output_layer', label: 'Salida EIA', x: 840, y: 80, params: { outputName: 'Zonificación EIA Base' } },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
        { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
        { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4' },
        { id: 'e4', fromNodeId: 'n4', toNodeId: 'n5' },
        { id: 'e5', fromNodeId: 'n5', toNodeId: 'n6' },
      ],
    },
  },
  {
    id: 'tpl-parque-industrial',
    title: '2. Parque Industrial & Plataformas',
    domain: 'industrial',
    sectorTag: 'Infraestructura Industrial',
    description: 'Estructura parcelario de naves industriales, red vial logística, zonificación AHP y corte/relleno.',
    defaultAreaHa: 85,
    recommendedCrs: 'EPSG:32718',
    formsAndAttributes: ['Lote Industrial', 'Cota Rasante', 'Carga Admisible kPa'],
    modelGraph: {
      id: 'mb-tpl-ind',
      name: 'Idoneidad Parque Industrial',
      version: 'v1.0',
      description: 'Evalúa pendiente, hidrología y aptitud multicriterio AHP para implantación industrial.',
      updatedAt: '2026-11-18',
      nodes: [
        { id: 'n1', kind: 'dem_input', label: 'DEM Terreno', x: 40, y: 80, params: {} },
        { id: 'n2', kind: 'slope', label: 'Pendiente Horn', x: 220, y: 80, params: {} },
        { id: 'n3', kind: 'ahp_suitability', label: 'AHP Implantación', x: 400, y: 80, params: { maxSlopeDeg: 18 } },
        { id: 'n4', kind: 'uncertainty', label: 'Mapa Confianza', x: 580, y: 80, params: {} },
        { id: 'n5', kind: 'output_layer', label: 'Zonas Aptas', x: 760, y: 80, params: { outputName: 'Aptitud Parque Industrial' } },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
        { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
        { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4' },
        { id: 'e4', fromNodeId: 'n4', toNodeId: 'n5' },
      ],
    },
  },
  {
    id: 'tpl-estudio-cuenca',
    title: '3. Estudio Integral de Cuenca Hidrográfica',
    domain: 'ambiental',
    sectorTag: 'Hidrología & Recursos Hídricos',
    description: 'Configura DEM hidro-corregido, red Strahler/Horton, subcuencas y curvas IDF.',
    defaultAreaHa: 35000,
    recommendedCrs: 'EPSG:32718',
    formsAndAttributes: ['Orden Strahler', 'Tc Kirpich (min)', 'Caudal Pico (m3/s)'],
    modelGraph: {
      id: 'mb-tpl-hydro',
      name: 'Flujo Hidrológico de Cuenca',
      version: 'v1.0',
      description: 'DEM → Fill Sinks Priority-Flood → Pendiente → Salida',
      updatedAt: '2026-11-18',
      nodes: [
        { id: 'n1', kind: 'dem_input', label: 'DEM Cuenca', x: 60, y: 80, params: {} },
        { id: 'n2', kind: 'fill_sinks', label: 'Fill Sinks (Barnes)', x: 260, y: 80, params: {} },
        { id: 'n3', kind: 'slope', label: 'Pendiente Cauce', x: 460, y: 80, params: {} },
        { id: 'n4', kind: 'output_layer', label: 'Producto Hidro', x: 660, y: 80, params: { outputName: 'Red Hidrológica Base' } },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
        { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
        { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4' },
      ],
    },
  },
  {
    id: 'tpl-zonificacion-geotecnica',
    title: '4. Zonificación Geotécnica & Cimentaciones',
    domain: 'geotecnia',
    sectorTag: 'Geotecnia / Ingeniería Civil',
    description: 'Incluye sondeos SPT/CPT, ensayos de laboratorio, mapa de nivel freático e incertidumbre.',
    defaultAreaHa: 4500,
    recommendedCrs: 'EPSG:32718',
    formsAndAttributes: ['USCS', 'SPT N60', 'Cohesión kPa', 'Capacidad Admisible'],
    modelGraph: {
      id: 'mb-tpl-geo',
      name: 'Flujo Zonificación Geotécnica',
      version: 'v1.0',
      description: 'DEM → Pendiente → Incertidumbre Sondeos → Salida',
      updatedAt: '2026-11-18',
      nodes: [
        { id: 'n1', kind: 'dem_input', label: 'DEM Relieve', x: 60, y: 80, params: {} },
        { id: 'n2', kind: 'slope', label: 'Pendiente Taludes', x: 250, y: 80, params: {} },
        { id: 'n3', kind: 'uncertainty', label: 'Confianza Sondeos', x: 440, y: 80, params: {} },
        { id: 'n4', kind: 'output_layer', label: 'Mapa Geotécnico', x: 630, y: 80, params: { outputName: 'Zonas Geotécnicas Preliminares' } },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
        { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
        { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4' },
      ],
    },
  },
  {
    id: 'tpl-ordenamiento-territorial',
    title: '5. Ordenamiento Territorial & ZEE Municipal',
    domain: 'gubernamental',
    sectorTag: 'Gobierno & Catastro',
    description: 'Zonificación ecológica económica, restricciones urbanas, áreas protegidas y multicriterio AHP.',
    defaultAreaHa: 48000,
    recommendedCrs: 'EPSG:32718',
    formsAndAttributes: ['Categoría ZEE', 'Uso Permitido', 'Restricción Legal'],
    modelGraph: {
      id: 'mb-tpl-zee',
      name: 'Modelo ZEE Municipal',
      version: 'v1.0',
      description: 'Vector → Buffer → Intersect → AHP → Salida',
      updatedAt: '2026-11-18',
      nodes: [
        { id: 'n1', kind: 'vector_input', label: 'Zonificación', x: 60, y: 80, params: {} },
        { id: 'n2', kind: 'buffer', label: 'Amortiguamiento 250m', x: 250, y: 80, params: { distanceMeters: 250 } },
        { id: 'n3', kind: 'ahp_suitability', label: 'Aptitud AHP', x: 440, y: 80, params: { maxSlopeDeg: 25 } },
        { id: 'n4', kind: 'output_layer', label: 'ZEE Final', x: 630, y: 80, params: { outputName: 'Propuesta ZEE' } },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
        { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
        { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4' },
      ],
    },
  },
  {
    id: 'tpl-analisis-riesgos',
    title: '6. Análisis de Riesgos Naturales & Deslizamientos',
    domain: 'geotecnia',
    sectorTag: 'Gestión de Riesgos (GRD)',
    description: 'Combina pendientes críticas (>25°), TWI de saturación y vulnerabilidad de infraestructura.',
    defaultAreaHa: 9000,
    recommendedCrs: 'EPSG:32718',
    formsAndAttributes: ['Nivel Peligro', 'Exposición Activos', 'Factor de Seguridad'],
    modelGraph: {
      id: 'mb-tpl-risk',
      name: 'Peligro Remoción en Masa',
      version: 'v1.0',
      description: 'DEM → Fill Sinks → Slope → Reclassify >25° → Salida',
      updatedAt: '2026-11-18',
      nodes: [
        { id: 'n1', kind: 'dem_input', label: 'DEM Escarpe', x: 60, y: 80, params: {} },
        { id: 'n2', kind: 'slope', label: 'Pendiente (°)', x: 250, y: 80, params: {} },
        { id: 'n3', kind: 'reclassify', label: 'Laderas Críticas >25°', x: 440, y: 80, params: { threshold: 25 } },
        { id: 'n4', kind: 'output_layer', label: 'Mapa Susceptibilidad', x: 630, y: 80, params: { outputName: 'Susceptibilidad Deslizamiento' } },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
        { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
        { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4' },
      ],
    },
  },
  {
    id: 'tpl-teledeteccion',
    title: '7. Teledetección Satelital & GeoML Multitemporal',
    domain: 'ambiental',
    sectorTag: 'Observación de la Tierra',
    description: 'Escena bitemporal T1/T2 lista para Random Forest, SVM, ΔNDVI deforestación y dNBR incendios.',
    defaultAreaHa: 25000,
    recommendedCrs: 'EPSG:32718',
    formsAndAttributes: ['Sensor', 'Cobertura Nubosa %', 'Clase ML Predicha'],
    modelGraph: {
      id: 'mb-tpl-rs',
      name: 'Monitoreo Cobertura Satelital',
      version: 'v1.0',
      description: 'Vector AOI → Buffer 500m → Salida AOI STAC',
      updatedAt: '2026-11-18',
      nodes: [
        { id: 'n1', kind: 'vector_input', label: 'Polígono AOI', x: 80, y: 80, params: {} },
        { id: 'n2', kind: 'buffer', label: 'Zona Tampón 500m', x: 300, y: 80, params: { distanceMeters: 500 } },
        { id: 'n3', kind: 'output_layer', label: 'AOI Vigilancia', x: 520, y: 80, params: { outputName: 'AOI Monitoreo Satelital' } },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
        { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
      ],
    },
  },
  {
    id: 'tpl-monitoreo-ambiental',
    title: '8. Monitoreo Ambiental & Redes de Sensores IoT',
    domain: 'ambiental',
    sectorTag: 'Cumplimiento Normativo',
    description: 'Red de estaciones calidad de aire/agua/ruido, interpolación con mapa de confianza y anomalías Z.',
    defaultAreaHa: 6000,
    recommendedCrs: 'EPSG:32718',
    formsAndAttributes: ['Estación', 'PM10 µg/m³', 'DQO mg/L', 'Estado ECA'],
    modelGraph: {
      id: 'mb-tpl-mon',
      name: 'Incertidumbre Red Monitoreo',
      version: 'v1.0',
      description: 'Vector Estaciones → Evaluación Incertidumbre Espacial → Salida',
      updatedAt: '2026-11-18',
      nodes: [
        { id: 'n1', kind: 'vector_input', label: 'Estaciones Campo', x: 80, y: 80, params: {} },
        { id: 'n2', kind: 'uncertainty', label: 'Confianza Muestreo', x: 320, y: 80, params: {} },
        { id: 'n3', kind: 'output_layer', label: 'Cobertura Red', x: 560, y: 80, params: { outputName: 'Auditoría Red Monitoreo' } },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
        { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
      ],
    },
  },
  {
    id: 'tpl-vial-carretera',
    title: '9. Proyecto Vial / Carretera & Corredor Lineal',
    domain: 'industrial',
    sectorTag: 'Infraestructura Lineal',
    description: 'Trazo lineal de eje vial, franja de servidumbre 100m, taludes de corte y volúmenes de terraplén.',
    defaultAreaHa: 3200,
    recommendedCrs: 'EPSG:32718',
    formsAndAttributes: ['Progresiva km', 'Derecho de Vía m', 'Vol. Corte/Relleno'],
    modelGraph: {
      id: 'mb-tpl-road',
      name: 'Servidumbre Vial & Pendientes',
      version: 'v1.0',
      description: 'Vector Eje → Buffer 100m → Salida Faja Vial',
      updatedAt: '2026-11-18',
      nodes: [
        { id: 'n1', kind: 'vector_input', label: 'Eje Vial', x: 60, y: 80, params: {} },
        { id: 'n2', kind: 'buffer', label: 'Derecho Vía 100m', x: 260, y: 80, params: { distanceMeters: 100, dissolve: true } },
        { id: 'n3', kind: 'slope', label: 'Pendiente Corredor', x: 460, y: 80, params: {} },
        { id: 'n4', kind: 'output_layer', label: 'Corredor Vial', x: 660, y: 80, params: { outputName: 'Faja Servidumbre Vial' } },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
        { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
        { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4' },
      ],
    },
  },
  {
    id: 'tpl-mineria',
    title: '10. Minería, Depósito de Relaves & Cierre',
    domain: 'geotecnia',
    sectorTag: 'Minería & Geotecnia Pesada',
    description: 'Presa de relaves, piezómetros IoT 4D, estabilidad pseudoestática Bishop, hidrología y monitoreo LiDAR.',
    defaultAreaHa: 7500,
    recommendedCrs: 'EPSG:32719',
    formsAndAttributes: ['Componente Minero', 'FS Pseudoestático', 'Cota Coronamiento'],
    modelGraph: {
      id: 'mb-tpl-min',
      name: 'Control Geotécnico Relavera',
      version: 'v1.0',
      description: 'DEM → Fill Sinks → Pendiente Talud → Salida',
      updatedAt: '2026-11-18',
      nodes: [
        { id: 'n1', kind: 'dem_input', label: 'DEM Tajo/Relavera', x: 60, y: 80, params: {} },
        { id: 'n2', kind: 'fill_sinks', label: 'Control Drenaje', x: 260, y: 80, params: {} },
        { id: 'n3', kind: 'slope', label: 'Pendiente Dique', x: 460, y: 80, params: {} },
        { id: 'n4', kind: 'output_layer', label: 'Reporte Dique', x: 660, y: 80, params: { outputName: 'Control Estabilidad Minera' } },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
        { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
        { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4' },
      ],
    },
  },
];

// =========================================================
// 2. 10 CONFIGURABLE ENTERPRISE ROLES MATRIX
// =========================================================

export interface EnterpriseRoleDefinition {
  key: EnterpriseRoleKey;
  label: string;
  canCreateProjects: boolean;
  canRunGeoprocessing: boolean;
  canTrainGeoMl: boolean;
  canApproveDeliverables: boolean;
  canManageRoles: boolean;
  canExportData: boolean;
}

export const ENTERPRISE_ROLES_MATRIX: EnterpriseRoleDefinition[] = [
  { key: 'super_admin', label: '1. Super Administrador Plataforma', canCreateProjects: true, canRunGeoprocessing: true, canTrainGeoMl: true, canApproveDeliverables: true, canManageRoles: true, canExportData: true },
  { key: 'gis_director', label: '2. Director SIG & Ingeniería', canCreateProjects: true, canRunGeoprocessing: true, canTrainGeoMl: true, canApproveDeliverables: true, canManageRoles: true, canExportData: true },
  { key: 'lead_geotech', label: '3. Especialista Geotécnico Líder', canCreateProjects: true, canRunGeoprocessing: true, canTrainGeoMl: true, canApproveDeliverables: true, canManageRoles: false, canExportData: true },
  { key: 'hydrologist', label: '4. Ingeniero Hidrólogo Senior', canCreateProjects: true, canRunGeoprocessing: true, canTrainGeoMl: false, canApproveDeliverables: true, canManageRoles: false, canExportData: true },
  { key: 'remote_sensing_specialist', label: '5. Analista Teledetección & GeoML', canCreateProjects: true, canRunGeoprocessing: true, canTrainGeoMl: true, canApproveDeliverables: false, canManageRoles: false, canExportData: true },
  { key: 'environmental_auditor', label: '6. Auditor Ambiental / Cumplimiento', canCreateProjects: false, canRunGeoprocessing: true, canTrainGeoMl: false, canApproveDeliverables: true, canManageRoles: false, canExportData: true },
  { key: 'field_operator', label: '7. Operador SIG / Levantamiento Campo', canCreateProjects: false, canRunGeoprocessing: true, canTrainGeoMl: false, canApproveDeliverables: false, canManageRoles: false, canExportData: true },
  { key: 'data_engineer', label: '8. Ingeniero de Datos & PostGIS', canCreateProjects: true, canRunGeoprocessing: true, canTrainGeoMl: true, canApproveDeliverables: false, canManageRoles: false, canExportData: true },
  { key: 'external_reviewer', label: '9. Revisor Externo / Entidad Pública', canCreateProjects: false, canRunGeoprocessing: false, canTrainGeoMl: false, canApproveDeliverables: true, canManageRoles: false, canExportData: true },
  { key: 'lector_viewer', label: '10. Lector / Visor Ejecutivo (Solo Lectura)', canCreateProjects: false, canRunGeoprocessing: false, canTrainGeoMl: false, canApproveDeliverables: false, canManageRoles: false, canExportData: false },
];

// =========================================================
// 3. PROJECT VERSION DIFF ENGINE
// =========================================================

export interface ProjectVersionDiff {
  versionALabel: string;
  versionBLabel: string;
  crsChanged: boolean;
  crsFrom: string;
  crsTo: string;
  layersAdded: string[];
  layersRemoved: string[];
  layersFeatureCountDelta: Array<{ layerName: string; countA: number; countB: number; delta: number }>;
  boreholesDelta: number;
  demMeanElevationDeltaM: number;
  summary: string;
}

export function computeProjectVersionDiff(
  verA: GeotechProjectVersion,
  verB: GeotechProjectVersion
): ProjectVersionDiff {
  const namesA = new Map(verA.snapshot.layers.map((l) => [l.name, l.geojson?.features.length || 0]));
  const namesB = new Map(verB.snapshot.layers.map((l) => [l.name, l.geojson?.features.length || 0]));

  const layersAdded: string[] = [];
  const layersRemoved: string[] = [];
  const layersFeatureCountDelta: Array<{ layerName: string; countA: number; countB: number; delta: number }> = [];

  for (const [name, cntB] of namesB.entries()) {
    if (!namesA.has(name)) {
      layersAdded.push(name);
    } else {
      const cntA = namesA.get(name)!;
      if (cntA !== cntB) {
        layersFeatureCountDelta.push({ layerName: name, countA: cntA, countB: cntB, delta: cntB - cntA });
      }
    }
  }
  for (const name of namesA.keys()) {
    if (!namesB.has(name)) layersRemoved.push(name);
  }

  const meanA =
    verA.snapshot.dem.values.reduce((s, v) => s + v, 0) / Math.max(verA.snapshot.dem.values.length, 1);
  const meanB =
    verB.snapshot.dem.values.reduce((s, v) => s + v, 0) / Math.max(verB.snapshot.dem.values.length, 1);

  const boreholesDelta = verB.snapshot.boreholes.length - verA.snapshot.boreholes.length;
  const crsChanged = verA.snapshot.defaultCrs !== verB.snapshot.defaultCrs;
  const demMeanElevationDeltaM = Math.round((meanB - meanA) * 100) / 100;

  return {
    versionALabel: verA.label,
    versionBLabel: verB.label,
    crsChanged,
    crsFrom: verA.snapshot.defaultCrs,
    crsTo: verB.snapshot.defaultCrs,
    layersAdded,
    layersRemoved,
    layersFeatureCountDelta,
    boreholesDelta,
    demMeanElevationDeltaM,
    summary: `Diff (${verA.label} → ${verB.label}): +${layersAdded.length} capas agregadas, -${layersRemoved.length} eliminadas, ${layersFeatureCountDelta.length} modificadas en entidades, ΔDEM medio ${demMeanElevationDeltaM} m.`,
  };
}

// =========================================================
// 4. TEMPLATE INSTANTIATOR & 4D TEMPORAL DEFAULTS
// =========================================================

export function buildDefaultTemporalFrames(): DigitalTwin4DFrame[] {
  return [
    {
      id: 'tf-2026-actual',
      label: 'T0: Situación Base Actual (2026)',
      timestamp: '2026-11',
      scenario: 'actual',
      waterTableShiftM: 0,
      vegetationFactor: 1.0,
      settlementMm: 0,
      newBuildingsScale: 1.0,
      notes: 'Condición geotécnica e hidro-ambiental observada en campo.',
    },
    {
      id: 'tf-2027-obra',
      label: 'T1: Escenario Expansión / Obra (2027)',
      timestamp: '2027-08',
      scenario: 'proyectado_2028',
      waterTableShiftM: -0.4,
      vegetationFactor: 0.78,
      settlementMm: 14.5,
      newBuildingsScale: 1.28,
      notes: 'Proyección de asentamiento primario por sobrecarga de nuevas naves/estructuras.',
    },
    {
      id: 'tf-2028-lluvias',
      label: 'T2: Escenario Lluvias Extremas / El Niño (2028)',
      timestamp: '2028-02',
      scenario: 'emergencia_lluvias',
      waterTableShiftM: 1.65,
      vegetationFactor: 1.15,
      settlementMm: 22.0,
      newBuildingsScale: 1.28,
      notes: 'Ascenso piezométrico crítico (+1.65 m) sobre terrazas aluviales y drenaje D8.',
    },
  ];
}

export function buildTemplateSeedArtifacts(
  tpl: ProjectTemplateSpec,
  center: [number, number],
  orgId: string,
  nameOverride?: string
): Partial<GeotechProject> {
  const [cLng, cLat] = center;
  const bounds: [number, number, number, number] = [cLng - 0.035, cLat - 0.035, cLng + 0.035, cLat + 0.035];
  const dem: DemGrid = {
    id: `dem-tpl-${Date.now()}`,
    name: `DEM Base — ${nameOverride || tpl.title}`,
    cols: 28,
    rows: 28,
    cellSizeMeters: 140,
    bounds,
    crs: 'EPSG:4326',
    noData: -9999,
    unit: 'msnm',
    colorScale: 'elevation',
    values: Array.from({ length: 28 * 28 }, (_, idx) => {
      const r = Math.floor(idx / 28) / 27;
      const c = (idx % 28) / 27;
      return Math.round((65 + c * 150 + (1 - r) * 80 + 20 * Math.sin(c * 6) * Math.cos(r * 5)) * 100) / 100;
    }),
  };

  const samplePolygons: GisLayer = {
    id: `lyr-tpl-poly-${Date.now()}`,
    name: `Área de Estudio (${tpl.sectorTag})`,
    category: tpl.domain === 'geotecnia' ? 'geotecnia' : tpl.domain === 'industrial' ? 'infraestructura' : 'ambiental',
    kind: 'vector',
    visible: true,
    opacity: 0.75,
    crs: 'EPSG:4326',
    source: `Plantilla ${tpl.title}`,
    capturedDate: new Date().toISOString().split('T')[0],
    metadata: { provenance: 'modelo_analitico', notes: `Atributos base: ${tpl.formsAndAttributes.join(', ')}` },
    symbology: { color: '#047857', fillColor: '#10b981', fillOpacity: 0.25, weight: 2, labelField: 'name' },
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: `Polígono Maestro — ${tpl.sectorTag}`,
            sector: tpl.sectorTag,
            plantilla: tpl.id,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [cLng - 0.022, cLat - 0.018],
              [cLng + 0.022, cLat - 0.018],
              [cLng + 0.022, cLat + 0.018],
              [cLng - 0.022, cLat + 0.018],
              [cLng - 0.022, cLat - 0.018],
            ]],
          },
        },
      ],
    },
  };

  const sampleMonitoring: GisLayer = {
    id: `lyr-tpl-pts-${Date.now() + 1}`,
    name: `Puntos Control — ${tpl.sectorTag}`,
    category: 'ambiental',
    kind: 'vector',
    visible: true,
    opacity: 1,
    crs: 'EPSG:4326',
    source: `Plantilla ${tpl.title}`,
    capturedDate: new Date().toISOString().split('T')[0],
    metadata: { provenance: 'observado' },
    symbology: { color: '#0284c7', fillColor: '#38bdf8', fillOpacity: 0.9, radius: 7, labelField: 'name' },
    geojson: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'Punto Control P-01', indice_valor: 48.5 }, geometry: { type: 'Point', coordinates: [cLng - 0.012, cLat - 0.008] } },
        { type: 'Feature', properties: { name: 'Punto Control P-02', indice_valor: 74.2 }, geometry: { type: 'Point', coordinates: [cLng + 0.004, cLat + 0.005] } },
        { type: 'Feature', properties: { name: 'Punto Control P-03', indice_valor: 62.0 }, geometry: { type: 'Point', coordinates: [cLng + 0.014, cLat - 0.010] } },
      ],
    },
  };

  return {
    organizationId: orgId,
    domain: tpl.domain,
    areaHa: tpl.defaultAreaHa,
    defaultCrs: tpl.recommendedCrs,
    description: `${tpl.description} Atributos configurados: ${tpl.formsAndAttributes.join(' · ')}.`,
    dem,
    layers: [samplePolygons, sampleMonitoring],
    lidarCloud: generateReferenceLidarSurvey(dem, undefined, 1),
    modelGraphs: [{ ...tpl.modelGraph, id: `mb-${Date.now()}` }],
    temporalFrames: buildDefaultTemporalFrames(),
  };
}
