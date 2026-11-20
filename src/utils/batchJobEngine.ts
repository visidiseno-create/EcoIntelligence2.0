import {
  DemGrid,
  GeoFeatureCollection,
  GeotechProject,
  GisLayer,
  ModelBuilderGraph,
  PrecisionEnvelope,
  computeAhpWeights,
  computeSlopeGrid,
  computeSuitabilityGrid,
  runVectorBuffer,
  runVectorIntersect,
} from './geotechEngine';
import { buildPrecisionEnvelope, computeSpatialUncertaintyAnalysis } from './geoEngine3';
import { fillDemSinksPriorityFlood } from './hydrology2';

// =========================================================
// 1. GEOPROCESSING MODEL BUILDER (DAG EXECUTOR)
// =========================================================

export interface ModelExecutionTrace {
  nodeId: string;
  label: string;
  kind: string;
  durationMs: number;
  status: 'completado' | 'omitido' | 'error';
  summary: string;
}

export interface ModelExecutionResult {
  executionOrder: string[];
  traces: ModelExecutionTrace[];
  producedRasters: DemGrid[];
  producedLayers: GisLayer[];
  totalDurationMs: number;
  precisionEnvelope: PrecisionEnvelope;
}

export function topologicalSortModelGraph(graph: ModelBuilderGraph): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of graph.nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (!adj.has(e.fromNodeId) || !inDegree.has(e.toNodeId)) continue;
    adj.get(e.fromNodeId)!.push(e.toNodeId);
    inDegree.set(e.toNodeId, (inDegree.get(e.toNodeId) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const ordered: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    ordered.push(cur);
    for (const nxt of adj.get(cur) || []) {
      const nextDeg = (inDegree.get(nxt) || 1) - 1;
      inDegree.set(nxt, nextDeg);
      if (nextDeg === 0) queue.push(nxt);
    }
  }

  if (ordered.length !== graph.nodes.length) {
    throw new Error('El grafo del Model Builder contiene un ciclo cerrado no válido (DAG requerido).');
  }
  return ordered;
}

export function executeModelBuilderGraph(
  graph: ModelBuilderGraph,
  project: GeotechProject
): ModelExecutionResult {
  const tStart = performance.now();
  const order = topologicalSortModelGraph(graph);
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  let currentDem: DemGrid = project.dem;
  const vectorLayers = project.layers.filter((l) => l.kind === 'vector' && l.geojson);
  let currentVector: GeoFeatureCollection | null = vectorLayers[0]?.geojson || null;
  let secondaryVector: GeoFeatureCollection | null = vectorLayers[1]?.geojson || currentVector;

  const producedRasters: DemGrid[] = [];
  const producedLayers: GisLayer[] = [];
  const traces: ModelExecutionTrace[] = [];

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId)!;
    const t0 = performance.now();
    try {
      if (node.kind === 'dem_input') {
        currentDem = project.dem;
        traces.push({
          nodeId,
          label: node.label,
          kind: node.kind,
          durationMs: 1,
          status: 'completado',
          summary: `Cargado DEM "${currentDem.name}" (${currentDem.cols}×${currentDem.rows}).`,
        });
      } else if (node.kind === 'vector_input') {
        const targetId = node.params?.layerId;
        const found = vectorLayers.find((l) => l.id === targetId) || vectorLayers[0];
        currentVector = found?.geojson || null;
        traces.push({
          nodeId,
          label: node.label,
          kind: node.kind,
          durationMs: 1,
          status: currentVector ? 'completado' : 'omitido',
          summary: found ? `Capa vectorial "${found.name}" (${found.geojson?.features.length || 0} ent.).` : 'Sin capa vectorial.',
        });
      } else if (node.kind === 'fill_sinks') {
        const fill = fillDemSinksPriorityFlood(currentDem);
        currentDem = fill.filledDem;
        producedRasters.push(currentDem);
        traces.push({
          nodeId,
          label: node.label,
          kind: node.kind,
          durationMs: Math.round(performance.now() - t0),
          status: 'completado',
          summary: `Priority-Flood rellenó ${fill.sinksFilledCount} sumideros (prof. máx ${fill.maxFillDepthM} m).`,
        });
      } else if (node.kind === 'slope') {
        const slp = computeSlopeGrid(currentDem);
        currentDem = slp.grid;
        producedRasters.push(slp.grid);
        traces.push({
          nodeId,
          label: node.label,
          kind: node.kind,
          durationMs: Math.round(performance.now() - t0),
          status: 'completado',
          summary: `Pendiente Horn: media ${slp.meanDeg}°, máx ${slp.maxDeg}°.`,
        });
      } else if (node.kind === 'reclassify') {
        const threshold = Number(node.params?.threshold ?? 15);
        const vals = currentDem.values.map((v) => (v >= threshold ? 1 : 0));
        const recGrid: DemGrid = {
          ...currentDem,
          id: `mb-reclass-${Date.now()}`,
          name: `Reclasificado (>= ${threshold} ${currentDem.unit})`,
          unit: 'clase (0/1)',
          values: vals,
          colorScale: 'classes',
          classLabels: [`< ${threshold}`, `>= ${threshold}`],
        };
        currentDem = recGrid;
        producedRasters.push(recGrid);
        const pctHigh = Math.round((vals.filter((v) => v === 1).length / Math.max(vals.length, 1)) * 1000) / 10;
        traces.push({
          nodeId,
          label: node.label,
          kind: node.kind,
          durationMs: Math.round(performance.now() - t0),
          status: 'completado',
          summary: `Reclasificación umbral ${threshold}: ${pctHigh}% de celdas en clase crítica (1).`,
        });
      } else if (node.kind === 'buffer') {
        const dist = Number(node.params?.distanceMeters ?? 300);
        if (currentVector) {
          currentVector = runVectorBuffer(currentVector, dist, Boolean(node.params?.dissolve));
          traces.push({
            nodeId,
            label: node.label,
            kind: node.kind,
            durationMs: Math.round(performance.now() - t0),
            status: 'completado',
            summary: `Buffer de ${dist} m generó ${currentVector.features.length} áreas.`,
          });
        } else {
          traces.push({ nodeId, label: node.label, kind: node.kind, durationMs: 0, status: 'omitido', summary: 'Sin vector de entrada.' });
        }
      } else if (node.kind === 'intersect') {
        if (currentVector && secondaryVector) {
          const inter = runVectorIntersect(currentVector, secondaryVector);
          if (inter.features.length > 0) currentVector = inter;
          traces.push({
            nodeId,
            label: node.label,
            kind: node.kind,
            durationMs: Math.round(performance.now() - t0),
            status: 'completado',
            summary: `Intersección evaluada: ${inter.features.length} polígonos coincidentes.`,
          });
        } else {
          traces.push({ nodeId, label: node.label, kind: node.kind, durationMs: 0, status: 'omitido', summary: 'Faltan dos capas poligonales.' });
        }
      } else if (node.kind === 'ahp_suitability') {
        const maxSlope = Number(node.params?.maxSlopeDeg ?? 35);
        const ahp = computeAhpWeights([
          [1, 2, 3, 4],
          [0.5, 1, 2, 3],
          [1 / 3, 0.5, 1, 2],
          [0.25, 1 / 3, 0.5, 1],
        ]);
        const suit = computeSuitabilityGrid(
          project.dem,
          { slope: ahp.weights[0], hydrology: ahp.weights[1], elevation: ahp.weights[2], accessibility: ahp.weights[3] },
          maxSlope
        );
        producedRasters.push(suit.grid);
        traces.push({
          nodeId,
          label: node.label,
          kind: node.kind,
          durationMs: Math.round(performance.now() - t0),
          status: 'completado',
          summary: `AHP (CR=${ahp.consistencyRatio}): Aptitud Alta ${suit.highHa} ha, Media ${suit.mediumHa} ha.`,
        });
      } else if (node.kind === 'uncertainty') {
        const ptLyr = vectorLayers.find((l) => l.geojson?.features.some((f) => f.geometry?.type === 'Point'));
        const props = ptLyr?.geojson?.features[0]?.properties || {};
        const numField = Object.keys(props).find((k) => typeof props[k] === 'number');
        if (ptLyr?.geojson && numField) {
          const unc = computeSpatialUncertaintyAnalysis(ptLyr.geojson, numField, project.dem);
          producedRasters.push(unc.confidenceGrid);
          traces.push({
            nodeId,
            label: node.label,
            kind: node.kind,
            durationMs: Math.round(performance.now() - t0),
            status: 'completado',
            summary: `Mapa de Confianza (${numField}): ${unc.overallConfidenceScore}% promedio.`,
          });
        } else {
          traces.push({ nodeId, label: node.label, kind: node.kind, durationMs: 0, status: 'omitido', summary: 'Sin capa de muestreo puntual numérica.' });
        }
      } else if (node.kind === 'output_layer') {
        if (currentVector) {
          const outLayer: GisLayer = {
            id: `lyr-mb-${Date.now()}`,
            name: String(node.params?.outputName || `Salida Modelo — ${graph.name}`),
            category: 'geoproceso',
            kind: 'vector',
            visible: true,
            opacity: 0.85,
            crs: 'EPSG:4326',
            source: `Model Builder (${graph.name} ${graph.version})`,
            capturedDate: new Date().toISOString().split('T')[0],
            metadata: { provenance: 'modelo_analitico' },
            symbology: { color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.35, weight: 2 },
            geojson: currentVector,
          };
          producedLayers.push(outLayer);
        }
        traces.push({
          nodeId,
          label: node.label,
          kind: node.kind,
          durationMs: 1,
          status: 'completado',
          summary: `Generados ${producedRasters.length} ráster(s) y ${producedLayers.length} capa(s) vectorial(es).`,
        });
      }
    } catch (err: any) {
      traces.push({
        nodeId,
        label: node.label,
        kind: node.kind,
        durationMs: Math.round(performance.now() - t0),
        status: 'error',
        summary: err?.message || 'Error ejecutando nodo',
      });
    }
  }

  const totalDurationMs = Math.round((performance.now() - tStart) * 100) / 100;
  return {
    executionOrder: order,
    traces,
    producedRasters,
    producedLayers,
    totalDurationMs,
    precisionEnvelope: buildPrecisionEnvelope({
      resultSummary: `Pipeline "${graph.name}" ejecutado (${order.length} nodos en ${totalDurationMs} ms)`,
      method: `Model Builder DAG (${graph.version})`,
      crs: project.defaultCrs,
      resolution: `${project.dem.cellSizeMeters} m`,
      units: 'multi-producto',
      sourceData: [project.dem.name, ...vectorLayers.slice(0, 2).map((l) => l.name)],
      estimatedAccuracy: 'Reproducibilidad determinística 100% sobre misma versión de entradas',
      dataKind: 'modelo_analitico',
    }),
  };
}

// =========================================================
// 2. BATCH PROCESSING & JOB QUEUE ENGINE
// =========================================================

export type BatchJobPriority = 'alta' | 'normal' | 'baja';
export type BatchJobStatus = 'pendiente' | 'ejecutando' | 'pausado' | 'completado' | 'cancelado' | 'error';

export interface BatchJobItemLog {
  timestamp: string;
  itemName: string;
  status: 'ok' | 'error';
  detail: string;
  durationMs: number;
}

export interface BatchJobRecord {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  jobType: 'vector_batch' | 'raster_pyramid_batch' | 'hydro_multi_scenario' | 'quality_audit_batch';
  priority: BatchJobPriority;
  status: BatchJobStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  progressPct: number;
  retries: number;
  maxRetries: number;
  elapsedMs: number;
  etaMs: number;
  throughputItemsPerSec: number;
  memorySnapshotMb: number;
  checkpointIndex: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  logs: BatchJobItemLog[];
  errorMessage?: string;
}

const yieldTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function processBatchQueueItems<T>(params: {
  items: T[];
  startIndex?: number;
  chunkSize?: number;
  shouldPauseOrCancel: () => 'run' | 'pause' | 'cancel';
  onItem: (item: T, index: number) => string;
  onProgress: (stats: {
    completedItems: number;
    failedItems: number;
    progressPct: number;
    elapsedMs: number;
    etaMs: number;
    throughputItemsPerSec: number;
    checkpointIndex: number;
    latestLog: BatchJobItemLog;
  }) => void;
}): Promise<{ finalStatus: 'completado' | 'pausado' | 'cancelado'; completedItems: number; failedItems: number; elapsedMs: number }> {
  const start = performance.now();
  const total = params.items.length;
  let idx = params.startIndex || 0;
  let completed = idx;
  let failed = 0;
  const chunk = Math.max(1, params.chunkSize || 2);

  while (idx < total) {
    const signal = params.shouldPauseOrCancel();
    if (signal === 'pause') {
      return {
        finalStatus: 'pausado',
        completedItems: completed,
        failedItems: failed,
        elapsedMs: Math.round(performance.now() - start),
      };
    }
    if (signal === 'cancel') {
      return {
        finalStatus: 'cancelado',
        completedItems: completed,
        failedItems: failed,
        elapsedMs: Math.round(performance.now() - start),
      };
    }

    const end = Math.min(total, idx + chunk);
    for (let i = idx; i < end; i++) {
      const tItem = performance.now();
      let log: BatchJobItemLog;
      try {
        const detail = params.onItem(params.items[i], i);
        completed++;
        log = {
          timestamp: new Date().toISOString().slice(11, 19),
          itemName: `Ítem #${i + 1}`,
          status: 'ok',
          detail,
          durationMs: Math.round((performance.now() - tItem) * 10) / 10,
        };
      } catch (err: any) {
        failed++;
        completed++;
        log = {
          timestamp: new Date().toISOString().slice(11, 19),
          itemName: `Ítem #${i + 1}`,
          status: 'error',
          detail: err?.message || 'Fallo en procesamiento de ítem',
          durationMs: Math.round((performance.now() - tItem) * 10) / 10,
        };
      }

      const elapsedMs = Math.max(1, Math.round(performance.now() - start));
      const processedNow = completed - (params.startIndex || 0);
      const ratePerMs = processedNow / elapsedMs;
      const remaining = total - completed;
      const etaMs = ratePerMs > 0 ? Math.round(remaining / ratePerMs) : 0;
      const throughputItemsPerSec = Math.round((ratePerMs * 1000) * 100) / 100;

      params.onProgress({
        completedItems: completed,
        failedItems: failed,
        progressPct: Math.round((completed / Math.max(total, 1)) * 1000) / 10,
        elapsedMs,
        etaMs,
        throughputItemsPerSec,
        checkpointIndex: i + 1,
        latestLog: log,
      });
    }

    idx = end;
    await yieldTick();
  }

  return {
    finalStatus: 'completado',
    completedItems: completed,
    failedItems: failed,
    elapsedMs: Math.round(performance.now() - start),
  };
}
