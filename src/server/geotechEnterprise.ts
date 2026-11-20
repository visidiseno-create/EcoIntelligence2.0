import os from 'node:os';
import * as turf from '@turf/turf';
import {
  GeoMlSavedModel,
  GeotechProject,
  PlannedWorkflowStep,
  PrecisionEnvelope,
  planDeterministicGeospatialCommand,
} from '../utils/geotechEngine';
import { BatchJobRecord } from '../utils/batchJobEngine';
import { buildPrecisionEnvelope } from '../utils/geoEngine3';
import { evaluateGeoOpsAlerts, sanitizeWorkerUrl } from '../utils/geoOpsHealth';

export interface StacSceneItem {
  id: string;
  collection: string;
  datetime: string;
  cloudCover: number | null;
  platform: string;
  resolutionM?: number | null;
  bbox: [number, number, number, number];
  thumbnailUrl?: string;
  selfUrl?: string;
}

export async function searchRealStacCatalog(params: {
  bbox: [number, number, number, number];
  collection?: string;
  limit?: number;
  maxCloudCover?: number;
  startDate?: string;
  endDate?: string;
  sensor?: string;
  maxResolutionM?: number;
}): Promise<{
  provider: string;
  endpoint: string;
  queryApplied: Record<string, any>;
  items: StacSceneItem[];
}> {
  const endpoint = 'https://earth-search.aws.element84.com/v1/search';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const queryFilter: Record<string, any> = {};
    if (typeof params.maxCloudCover === 'number') {
      queryFilter['eo:cloud_cover'] = { lte: params.maxCloudCover };
    }
    if (params.sensor && params.sensor.trim()) {
      queryFilter['platform'] = { in: [params.sensor.trim().toLowerCase()] };
    }

    const datetimeRange =
      params.startDate || params.endDate
        ? `${params.startDate ? `${params.startDate}T00:00:00Z` : '..'}/${
            params.endDate ? `${params.endDate}T23:59:59Z` : '..'
          }`
        : undefined;

    const body: Record<string, any> = {
      bbox: params.bbox,
      collections: [params.collection || 'sentinel-2-l2a'],
      limit: Math.min(18, Math.max(1, params.limit || 8)),
      ...(datetimeRange ? { datetime: datetimeRange } : {}),
      ...(Object.keys(queryFilter).length > 0 ? { query: queryFilter } : {}),
    };

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json, application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Catálogo STAC respondió HTTP ${resp.status}: ${txt.slice(0, 120)}`);
    }

    const data: any = await resp.json();
    const features: any[] = Array.isArray(data?.features) ? data.features : [];
    let items: StacSceneItem[] = features.map((f) => {
      const gsd = Number(f.properties?.gsd || f.assets?.red?.gsd || (String(f.collection).includes('sentinel') ? 10 : 30));
      return {
        id: String(f.id || 'scene'),
        collection: String(f.collection || params.collection || 'sentinel-2-l2a'),
        datetime: String(f.properties?.datetime || ''),
        cloudCover:
          typeof f.properties?.['eo:cloud_cover'] === 'number'
            ? Math.round(f.properties['eo:cloud_cover'] * 10) / 10
            : null,
        platform: String(f.properties?.platform || f.properties?.constellation || 'Sentinel-2'),
        resolutionM: Number.isFinite(gsd) ? gsd : null,
        bbox:
          Array.isArray(f.bbox) && f.bbox.length >= 4
            ? [f.bbox[0], f.bbox[1], f.bbox[2], f.bbox[3]]
            : params.bbox,
        thumbnailUrl: f.assets?.thumbnail?.href || f.assets?.rendered_preview?.href,
        selfUrl: Array.isArray(f.links) ? f.links.find((l: any) => l.rel === 'self')?.href : undefined,
      };
    });

    if (typeof params.maxResolutionM === 'number' && params.maxResolutionM > 0) {
      items = items.filter((it) => !it.resolutionM || it.resolutionM <= params.maxResolutionM!);
    }

    return {
      provider: 'Earth Search AWS STAC v1 (Element84 / Copernicus)',
      endpoint,
      queryApplied: body,
      items,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// =========================================================
// ENTERPRISE TELEMETRY & PROCESSING DASHBOARD
// =========================================================

export interface LiveWorkerProbeState {
  configured: boolean;
  reachable: boolean;
  checkedAt: string;
  latencyMs: number | null;
  error: string | null;
  postgisConfigured: boolean;
  postgisConnected: boolean;
  postgisVersion: string | null;
  enginesSummary?: {
    gdal?: string | null;
    proj?: string | null;
    geos?: string | null;
    pdal?: string | null;
    activeWorkerJobs?: number;
  };
}

export function getGeotechInfraTelemetry(
  projects: GeotechProject[],
  jobs: BatchJobRecord[] = [],
  activeUsersCount: number = 1,
  liveOpts?: {
    workerProbe?: LiveWorkerProbeState;
    diskStats?: { diskFreeMb: number | null; diskTotalMb: number | null };
    observability?: { totalRequests: number; errorRatePct: number; avgLatencyMs: number };
  }
) {
  const mem = process.memoryUsage();
  const totalSysMemMb = Math.round((os.totalmem() / 1048576) * 10) / 10;
  const freeSysMemMb = Math.round((os.freemem() / 1048576) * 10) / 10;
  const rssMb = Math.round((mem.rss / 1048576) * 10) / 10;
  const heapUsedMb = Math.round((mem.heapUsed / 1048576) * 10) / 10;
  const heapTotalMb = Math.round((mem.heapTotal / 1048576) * 10) / 10;

  const totalLayers = projects.reduce((s, p) => s + (p.layers?.length || 0), 0);
  const totalFeatures = projects.reduce(
    (s, p) => s + p.layers.reduce((ls, l) => ls + (l.geojson?.features.length || 0), 0),
    0
  );
  const totalDemCells = projects.reduce((s, p) => s + (p.dem?.values?.length || 0), 0);
  const totalLidarPoints = projects.reduce((s, p) => s + (p.lidarCloud?.length || 0), 0);
  const totalVersions = projects.reduce((s, p) => s + (p.versions?.length || 0), 0);
  const totalModels = projects.reduce((s, p) => s + (p.trainedMlModels?.length || 0), 0);

  const runningJobs = jobs.filter((j) => j.status === 'ejecutando' || j.status === 'pendiente').length;
  const completedJobs = jobs.filter((j) => j.status === 'completado').length;
  const failedJobs = jobs.filter((j) => j.status === 'error' || j.failedItems > 0).length;
  const nowMs = Date.now();
  const stalledJobs = jobs.filter((j) => {
    if (j.status !== 'ejecutando') return false;
    const t = new Date(j.createdAt || 0).getTime();
    return Number.isFinite(t) && t > 0 && nowMs - t > 300_000;
  }).length;

  const configured = Boolean((process.env.GEOSPATIAL_WORKER_URL || '').trim());
  const probe = liveOpts?.workerProbe || {
    configured,
    reachable: false,
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    error: configured ? 'Sin sondeo en vivo reciente' : null,
    postgisConfigured: false,
    postgisConnected: false,
    postgisVersion: null,
  };
  const diskStats = liveOpts?.diskStats || { diskFreeMb: null, diskTotalMb: null };
  const obs = liveOpts?.observability || { totalRequests: 0, errorRatePct: 0, avgLatencyMs: 0 };

  const operationalAlerts = evaluateGeoOpsAlerts({
    workerConfigured: probe.configured,
    workerReachable: probe.reachable,
    workerError: probe.error,
    postgisConfigured: probe.postgisConfigured,
    postgisConnected: probe.postgisConnected,
    totalRequests: obs.totalRequests,
    errorRatePct: obs.errorRatePct,
    avgLatencyMs: obs.avgLatencyMs,
    rssMb,
    sysTotalMb: totalSysMemMb,
    heapUsedMb,
    heapTotalMb,
    runningJobs,
    failedJobs,
    stalledJobs,
    diskFreeMb: diskStats.diskFreeMb,
    diskTotalMb: diskStats.diskTotalMb,
  });

  const statusLabel = !probe.configured
    ? 'DEPENDENCIA EXTERNA NO DISPONIBLE'
    : probe.reachable
    ? 'CONECTADO'
    : 'CAÍDO — WORKER NO RESPONDE';

  return {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    cpuCount: os.cpus().length,
    loadAvg1m: Math.round((os.loadavg()[0] || 0) * 100) / 100,
    uptimeSec: Math.round(process.uptime()),
    memory: {
      rssMb,
      heapUsedMb,
      heapTotalMb,
      externalMb: Math.round((mem.external / 1048576) * 10) / 10,
      sysTotalMb: totalSysMemMb,
      sysFreeMb: freeSysMemMb,
    },
    storage: {
      diskFreeMb: diskStats.diskFreeMb,
      diskTotalMb: diskStats.diskTotalMb,
    },
    dataset: {
      projectCount: projects.length,
      totalLayers,
      totalFeatures,
      totalDemCells,
      totalLidarPoints,
      totalVersions,
      totalModels,
    },
    enterpriseQueue: {
      totalJobs: jobs.length,
      runningJobs,
      completedJobs,
      failedJobs,
      stalledJobs,
      activeUsersCount,
      estimatedStorageMb: Math.round(((totalFeatures * 0.6 + totalDemCells * 0.015 + totalLidarPoints * 0.04) / 1024) * 100) / 100,
    },
    externalWorker: {
      configured: probe.configured,
      reachable: probe.reachable,
      connected: probe.configured && probe.reachable,
      statusLabel,
      checkedAt: probe.checkedAt,
      latencyMs: probe.latencyMs,
      error: probe.error,
      workerUrl: sanitizeWorkerUrl(process.env.GEOSPATIAL_WORKER_URL),
      blueprintPath: '/services/gdal-worker/',
      postgisConfigured: probe.postgisConfigured,
      postgisConnected: probe.postgisConnected,
      postgisVersion: probe.postgisVersion,
      engines: probe.enginesSummary || null,
    },
    operationalAlerts,
  };
}

// =========================================================
// GEOCATALOG UNIFICADO (DATASET / LAYER / RASTER / LIDAR / ML)
// =========================================================

export interface GeoCatalogItem {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  title: string;
  assetKind: 'proyecto' | 'capa_vector' | 'raster_dem' | 'escena_satelital' | 'nube_lidar' | 'sondeo_geotecnico' | 'modelo_ml';
  source: string;
  capturedDate: string;
  resolution: string;
  crs: string;
  license: string;
  owner: string;
  version: string;
  recordCount: number;
}

export function buildUnifiedGeoCatalog(
  projects: GeotechProject[],
  filters?: { q?: string; assetKind?: string; crs?: string }
): GeoCatalogItem[] {
  const items: GeoCatalogItem[] = [];

  for (const p of projects) {
    items.push({
      id: `cat-proj-${p.id}`,
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      title: `${p.code} — ${p.name}`,
      assetKind: 'proyecto',
      source: `ECOINTELLIGENCE (${p.domain})`,
      capturedDate: p.updatedAt.slice(0, 10),
      resolution: `${p.areaHa.toLocaleString()} ha`,
      crs: p.defaultCrs,
      license: 'Corporativo Interno',
      owner: p.organizationId,
      version: `v${(p.versions?.length || 0) + 1}`,
      recordCount: p.layers.length,
    });

    items.push({
      id: `cat-dem-${p.dem.id}`,
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      title: p.dem.name,
      assetKind: 'raster_dem',
      source: 'Modelo Digital de Elevación Proyecto',
      capturedDate: p.createdAt.slice(0, 10),
      resolution: `${p.dem.cellSizeMeters} m (${p.dem.cols}×${p.dem.rows})`,
      crs: p.dem.crs,
      license: 'Uso Técnico Autorizado',
      owner: p.organizationId,
      version: 'v1.0',
      recordCount: p.dem.values.length,
    });

    for (const l of p.layers) {
      items.push({
        id: `cat-lyr-${l.id}`,
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        title: l.name,
        assetKind: 'capa_vector',
        source: l.source || 'Capa SIG',
        capturedDate: l.capturedDate || p.updatedAt.slice(0, 10),
        resolution: l.kind.toUpperCase(),
        crs: l.crs,
        license: l.license || 'Uso Interno / Normativo',
        owner: p.organizationId,
        version: 'v1.0',
        recordCount: l.geojson?.features.length || 0,
      });
    }

    if (p.spectralScene) {
      items.push({
        id: `cat-sc-${p.spectralScene.id}`,
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        title: p.spectralScene.name,
        assetKind: 'escena_satelital',
        source: `${p.spectralScene.t2.sensor} (T1/T2)`,
        capturedDate: p.spectralScene.t2.date,
        resolution: `${p.spectralScene.t2.resolutionM} m`,
        crs: p.spectralScene.crs,
        license: 'Copernicus / Open Data',
        owner: p.organizationId,
        version: 'T1→T2',
        recordCount: p.spectralScene.cols * p.spectralScene.rows,
      });
    }

    if (p.lidarCloud && p.lidarCloud.length > 0) {
      items.push({
        id: `cat-lid-${p.id}`,
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        title: `Nube de Puntos LiDAR — ${p.code}`,
        assetKind: 'nube_lidar',
        source: 'ASPRS LAS v1.2/1.4',
        capturedDate: p.updatedAt.slice(0, 10),
        resolution: 'Sub-métrico 3D',
        crs: p.defaultCrs,
        license: 'Corporativo Interno',
        owner: p.organizationId,
        version: 'v1.0',
        recordCount: p.lidarCloud.length,
      });
    }

    for (const bh of p.boreholes) {
      items.push({
        id: `cat-bh-${bh.id}`,
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        title: `${bh.code} — ${bh.name}`,
        assetKind: 'sondeo_geotecnico',
        source: 'Ensayo SPT / CPT / Lab',
        capturedDate: p.createdAt.slice(0, 10),
        resolution: `Prof. ${bh.totalDepthM} m`,
        crs: 'EPSG:4326',
        license: 'Informe Geotécnico Certificado',
        owner: p.organizationId,
        version: 'v1.0',
        recordCount: bh.strata.length,
      });
    }

    for (const mdl of p.trainedMlModels || []) {
      items.push({
        id: `cat-ml-${mdl.id}`,
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        title: mdl.name,
        assetKind: 'modelo_ml',
        source: `GeoML (${mdl.algorithm})`,
        capturedDate: mdl.createdAt.slice(0, 10),
        resolution: `${mdl.sampleCount} muestras`,
        crs: p.defaultCrs,
        license: 'Modelo Analítico Interno',
        owner: mdl.trainedBy,
        version: 'v3.0',
        recordCount: mdl.sampleCount,
      });
    }
  }

  return items.filter((item) => {
    if (filters?.assetKind && filters.assetKind !== 'all' && item.assetKind !== filters.assetKind) return false;
    if (filters?.crs && filters.crs !== 'all' && item.crs !== filters.crs) return false;
    if (filters?.q && filters.q.trim()) {
      const q = filters.q.toLowerCase();
      const hay = `${item.title} ${item.source} ${item.projectName} ${item.projectCode} ${item.crs}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// =========================================================
// GEOTECH AI 2.0 & 3.0 AUTONOMOUS AGENT + EXPLAINABILITY
// =========================================================

export interface CollaborativeWorkflowPlan {
  engine: string;
  summary: string;
  agentsInvolved: string[];
  requiresApproval: boolean;
  approvalReason?: string;
  destructiveActionType?: 'overwrite_dem' | 'delete_layer';
  steps: PlannedWorkflowStep[];
}

export function planCollaborativeWorkflow2(prompt: string): CollaborativeWorkflowPlan {
  const q = prompt.toLowerCase();
  const base = planDeterministicGeospatialCommand(prompt);

  const destructive =
    q.includes('reemplazar dem') ||
    q.includes('sobrescribir dem') ||
    q.includes('eliminar capa') ||
    q.includes('borrar capa');

  const agentsSet = new Set<string>(base.steps.map((s) => s.agent));
  if (q.includes('lidar') || q.includes('nube')) {
    agentsSet.add('Agente LiDAR 3D');
  }
  if (q.includes('ciment') || q.includes('terzaghi') || q.includes('meyerhof') || q.includes('lpi')) {
    agentsSet.add('Agente Geotécnico');
  }

  return {
    engine: 'Orquestador Multi-Agente Geotech AI 2.0 (Determinístico)',
    summary: destructive
      ? `Atención: la instrucción solicita una modificación destructiva sobre capas/DEM. Se requiere aprobación explícita del ingeniero antes de aplicar cambios.`
      : `${base.summary} Agentes coordinados: ${Array.from(agentsSet).join(' → ')}.`,
    agentsInvolved: Array.from(agentsSet),
    requiresApproval: destructive,
    approvalReason: destructive
      ? 'La operación afectaría o eliminaría el Modelo Digital de Elevación o capas vectoriales existentes en el proyecto.'
      : undefined,
    destructiveActionType: q.includes('eliminar capa') || q.includes('borrar capa')
      ? 'delete_layer'
      : destructive
      ? 'overwrite_dem'
      : undefined,
    steps: base.steps,
  };
}

export interface ExplainabilityManifest {
  objective: string;
  dataUsed: string[];
  toolsUsed: string[];
  parameters: Record<string, any>;
  operationsTrace: Array<{ stepNo: number; agent: string; operation: string; purpose: string }>;
  expectedOutputs: string[];
  limitations: string[];
  safetyControls: {
    maxStepsCap: number;
    timeoutMsCap: number;
    sandboxDryRun: boolean;
    rollbackSnapshotAvailable: boolean;
    requiresApproval: boolean;
  };
  precisionEnvelope: PrecisionEnvelope;
}

export interface AutonomousAgentV3Response extends CollaborativeWorkflowPlan {
  autonomousGoalDetected: boolean;
  explainability: ExplainabilityManifest;
}

export function planAutonomousAgentV3(params: {
  prompt: string;
  project?: GeotechProject;
  sandboxDryRun?: boolean;
}): AutonomousAgentV3Response {
  const q = params.prompt.toLowerCase();
  const isIndustrialSuitability =
    q.includes('parque industrial') ||
    q.includes('zonas ambientalmente') ||
    q.includes('idoneidad') ||
    q.includes('aptitud');

  const base = planCollaborativeWorkflow2(params.prompt);

  let steps: PlannedWorkflowStep[] = base.steps;
  let agentsInvolved = base.agentsInvolved;
  let summary = base.summary;

  if (isIndustrialSuitability) {
    steps = [
      { tool: 'slope', label: '1. Verificación Relieve & Pendientes (Horn 3×3)', agent: 'Agente Topográfico', params: { maxSlopeDeg: 18 } },
      { tool: 'twi_hydrology', label: '2. Red Hídrica & Susceptibilidad TWI', agent: 'Agente Hidrológico', params: { flowMethod: 'D8' } },
      ...(params.project?.spectralScene
        ? [{ tool: 'ndvi' as const, label: '3. Cobertura Vegetal Sentinel-2 (NDVI)', agent: 'Agente Teledetección', params: { slot: 't2' } }]
        : []),
      { tool: 'buffer', label: '4. Faja de Amortiguamiento & Restricciones (250 m)', agent: 'Agente Territorial', params: { distanceMeters: 250 } },
      { tool: 'ahp_suitability', label: '5. Ponderación Multicriterio Saaty AHP (CR<=0.10)', agent: 'Agente Multicriterio AHP', params: { maxSlopeDeg: 18 } },
      { tool: 'slope_stability', label: '6. Validación Preliminar Estabilidad Bishop', agent: 'Agente Geotécnico', params: { method: 'simplified_bishop' } },
    ];
    agentsInvolved = Array.from(new Set(steps.map((s) => s.agent)));
    summary = `Agente Autónomo 3.0 estructuró un flujo completo de ${steps.length} etapas para determinar zonas ambiental y geotécnicamente adecuadas (${params.sandboxDryRun ? 'Modo Sandbox Dry-Run' : 'Ejecución Verificada con Rollback'}).`;
  }

  // Enforce strict resource caps
  const MAX_STEPS = 8;
  steps = steps.slice(0, MAX_STEPS);

  const proj = params.project;
  const explainability: ExplainabilityManifest = {
    objective: params.prompt.trim(),
    dataUsed: proj
      ? [
          `DEM: ${proj.dem.name} (${proj.dem.cols}×${proj.dem.rows}, ${proj.dem.cellSizeMeters} m)`,
          ...proj.layers.slice(0, 4).map((l) => `Capa: ${l.name} (${l.geojson?.features.length || 0} ent.)`),
          ...(proj.spectralScene ? [`Escena: ${proj.spectralScene.name}`] : []),
        ]
      : ['Contexto del proyecto activo'],
    toolsUsed: steps.map((s) => s.tool),
    parameters: {
      crs: proj?.defaultCrs || 'EPSG:32718',
      sandboxDryRun: Boolean(params.sandboxDryRun),
      maxStepsLimit: MAX_STEPS,
      timeoutMsLimit: 15000,
    },
    operationsTrace: steps.map((s, idx) => ({
      stepNo: idx + 1,
      agent: s.agent,
      operation: s.label,
      purpose: `Ejecuta "${s.tool}" con parámetros verificados (${JSON.stringify(s.params || {})})`,
    })),
    expectedOutputs: [
      'Capas vectoriales derivadas (buffers/restricciones)',
      'Grillas ráster analíticas (Pendiente, TWI, Aptitud AHP)',
      'Registro trazable con marca de tiempo en Historial & Auditoría',
    ],
    limitations: [
      'La idoneidad territorial resultante es un modelo analítico multi-criterio dependiente de la resolución del DEM y pesos AHP.',
      'No sustituye estudios de mecánica de suelos in situ (calicatas/SPT/triaxiales) ni modelamiento hidráulico 2D (HEC-RAS).',
    ],
    safetyControls: {
      maxStepsCap: MAX_STEPS,
      timeoutMsCap: 15000,
      sandboxDryRun: Boolean(params.sandboxDryRun),
      rollbackSnapshotAvailable: true,
      requiresApproval: base.requiresApproval,
    },
    precisionEnvelope: buildPrecisionEnvelope({
      resultSummary: `${steps.length} operaciones orquestadas (${agentsInvolved.join(', ')})`,
      method: 'Geotech AI Autonomous Pipeline 3.0',
      crs: proj?.defaultCrs || 'EPSG:32718',
      resolution: proj ? `${proj.dem.cellSizeMeters} m` : 'Según DEM',
      units: 'multi-producto',
      sourceData: proj ? [proj.dem.name] : ['Proyecto activo'],
      estimatedAccuracy: 'Ejecución matemática determinística supervisada por reglas y RBAC',
      dataKind: 'modelo_analitico',
    }),
  };

  return {
    ...base,
    engine: 'Geotech AI Autonomous Agent 3.0 (Determinístico + Trazabilidad)',
    summary,
    agentsInvolved,
    steps,
    autonomousGoalDetected: isIndustrialSuitability,
    explainability,
  };
}

// =========================================================
// OGC API FEATURES & VECTOR TILES HELPERS
// =========================================================

export function buildOgcCollections(projects: GeotechProject[]) {
  const collections: Array<Record<string, any>> = [];
  for (const p of projects) {
    for (const l of p.layers) {
      if (l.kind !== 'vector' || !l.geojson) continue;
      let bbox = [p.center[0] - 0.05, p.center[1] - 0.05, p.center[0] + 0.05, p.center[1] + 0.05];
      try {
        if (l.geojson.features.length > 0) bbox = turf.bbox(l.geojson as any);
      } catch {
        // fallback bbox
      }
      collections.push({
        id: l.id,
        title: `${p.code}: ${l.name}`,
        description: `Capa ${l.category} (${l.crs}) del proyecto ${p.name}`,
        extent: { spatial: { bbox: [bbox], crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' } },
        itemCount: l.geojson.features.length,
        links: [
          { href: `/api/geotech/ogc/collections/${l.id}/items`, rel: 'items', type: 'application/geo+json' },
        ],
      });
    }
  }
  return collections;
}

export function queryOgcCollectionItems(
  projects: GeotechProject[],
  collectionId: string,
  bboxParam?: string,
  limitParam?: number
) {
  for (const p of projects) {
    const lyr = p.layers.find((l) => l.id === collectionId);
    if (lyr?.geojson) {
      let features = lyr.geojson.features;
      if (bboxParam) {
        const nums = bboxParam.split(',').map(Number);
        if (nums.length === 4 && nums.every((n) => Number.isFinite(n))) {
          const roi = turf.bboxPolygon([nums[0], nums[1], nums[2], nums[3]]);
          features = features.filter((f) => {
            try {
              return !turf.booleanDisjoint(f as any, roi);
            } catch {
              return true;
            }
          });
        }
      }
      const limit = Math.min(1000, Math.max(1, limitParam || 100));
      const sliced = features.slice(0, limit);
      return {
        type: 'FeatureCollection',
        numberMatched: features.length,
        numberReturned: sliced.length,
        timeStamp: new Date().toISOString(),
        collectionId: lyr.id,
        projectCode: p.code,
        features: sliced,
      };
    }
  }
  return null;
}

export function queryOgcTileItems(projects: GeotechProject[], z: number, x: number, y: number) {
  const n = Math.pow(2, z);
  const tile2Lon = (tx: number) => (tx / n) * 360 - 180;
  const tile2Lat = (ty: number) => {
    const r = Math.PI - (2 * Math.PI * ty) / n;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(r) - Math.exp(-r)));
  };
  const minLon = tile2Lon(x);
  const maxLon = tile2Lon(x + 1);
  const maxLat = tile2Lat(y);
  const minLat = tile2Lat(y + 1);
  const roi = turf.bboxPolygon([minLon, minLat, maxLon, maxLat]);

  const matchedFeatures: any[] = [];
  for (const p of projects) {
    for (const l of p.layers) {
      if (!l.geojson) continue;
      for (const f of l.geojson.features) {
        try {
          if (!turf.booleanDisjoint(f as any, roi)) {
            matchedFeatures.push({
              ...f,
              properties: { ...f.properties, _layer: l.name, _project: p.code },
            });
          }
        } catch {
          // ignore
        }
      }
    }
  }

  return {
    type: 'FeatureCollection',
    tile: { z, x, y, bbox: [minLon, minLat, maxLon, maxLat] },
    numberReturned: matchedFeatures.length,
    features: matchedFeatures,
  };
}
