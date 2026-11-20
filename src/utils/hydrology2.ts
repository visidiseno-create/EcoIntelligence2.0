import * as turf from '@turf/turf';
import type { Feature, LineString, Polygon } from 'geojson';
import {
  DemGrid,
  GeoFeatureCollection,
  computeSlopeGrid,
} from './geotechEngine';

// =========================================================
// 1. PRIORITY-FLOOD DEPRESSION FILLING (BARNES ET AL., 2014)
// =========================================================

interface HeapNode {
  idx: number;
  z: number;
}

class MinHeap {
  private items: HeapNode[] = [];

  get size() {
    return this.items.length;
  }

  push(node: HeapNode) {
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].z <= this.items[i].z) break;
      const tmp = this.items[p];
      this.items[p] = this.items[i];
      this.items[i] = tmp;
      i = p;
    }
  }

  pop(): HeapNode | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let i = 0;
      const n = this.items.length;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && this.items[l].z < this.items[smallest].z) smallest = l;
        if (r < n && this.items[r].z < this.items[smallest].z) smallest = r;
        if (smallest === i) break;
        const tmp = this.items[i];
        this.items[i] = this.items[smallest];
        this.items[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  }
}

export function fillDemSinksPriorityFlood(dem: DemGrid): {
  filledDem: DemGrid;
  sinksFilledCount: number;
  maxFillDepthM: number;
} {
  const rows = dem.rows;
  const cols = dem.cols;
  const n = rows * cols;
  const out = [...dem.values];
  const closed = new Uint8Array(n);
  const heap = new MinHeap();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        const idx = r * cols + c;
        closed[idx] = 1;
        heap.push({ idx, z: out[idx] });
      }
    }
  }

  const dr = [-1, -1, 0, 1, 1, 1, 0, -1];
  const dc = [0, 1, 1, 1, 0, -1, -1, -1];

  let sinksFilledCount = 0;
  let maxFillDepthM = 0;
  const eps = 0.002; // small gradient ensures strictly positive drainage slope across flats

  while (heap.size > 0) {
    const cur = heap.pop()!;
    const r = Math.floor(cur.idx / cols);
    const c = cur.idx % cols;

    for (let k = 0; k < 8; k++) {
      const nr = r + dr[k];
      const nc = c + dc[k];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nIdx = nr * cols + nc;
      if (closed[nIdx]) continue;
      closed[nIdx] = 1;

      const origZ = out[nIdx];
      if (origZ <= cur.z) {
        const newZ = cur.z + eps;
        const fill = newZ - origZ;
        if (fill > eps + 1e-4) sinksFilledCount++;
        if (fill > maxFillDepthM) maxFillDepthM = fill;
        out[nIdx] = Math.round(newZ * 1000) / 1000;
        heap.push({ idx: nIdx, z: newZ });
      } else {
        heap.push({ idx: nIdx, z: origZ });
      }
    }
  }

  return {
    filledDem: {
      ...dem,
      id: `filled-${Date.now()}`,
      name: `DEM Hidrológico Sin Sumideros (Priority-Flood)`,
      values: out,
    },
    sinksFilledCount,
    maxFillDepthM: Math.round(maxFillDepthM * 100) / 100,
  };
}

// =========================================================
// 2. STRAHLER NETWORK, WATERSHED DELINEATION & RATIONAL FLOW
// =========================================================

export interface Hydrology2Result {
  filledDem: DemGrid;
  flowAccumulationGrid: DemGrid;
  twiGrid: DemGrid;
  streamNetworkGeoJson: GeoFeatureCollection;
  watershedGeoJson: GeoFeatureCollection;
  sinksFilledCount: number;
  maxStrahlerOrder: number;
  streamSegmentCount: number;
  morphometry: {
    basinAreaKm2: number;
    basinPerimeterKm: number;
    compactnessKc: number;
    mainChannelLengthKm: number;
    drainageDensityKmKm2: number;
    reliefM: number;
    kirpichTcMin: number;
    rainfallMmHr: number;
    runoffCoeffC: number;
    rationalPeakFlowM3s: number;
  };
  methodologyNote: string;
}

export function computeAdvancedHydrology(
  dem: DemGrid,
  rainfallMmHr: number = 45,
  runoffCoeffC: number = 0.55
): Hydrology2Result {
  const { filledDem, sinksFilledCount } = fillDemSinksPriorityFlood(dem);
  const rows = filledDem.rows;
  const cols = filledDem.cols;
  const n = rows * cols;
  const dr = [-1, -1, 0, 1, 1, 1, 0, -1];
  const dc = [0, 1, 1, 1, 0, -1, -1, -1];
  const distFactor = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

  // D8 steepest descent on depression-free DEM
  const receiver = new Int32Array(n).fill(-1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const z = filledDem.values[idx];
      let bestSlope = 0;
      let bestTarget = -1;
      for (let k = 0; k < 8; k++) {
        const nr = r + dr[k];
        const nc = c + dc[k];
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const nIdx = nr * cols + nc;
        const slope = (z - filledDem.values[nIdx]) / (filledDem.cellSizeMeters * distFactor[k]);
        if (slope > bestSlope) {
          bestSlope = slope;
          bestTarget = nIdx;
        }
      }
      receiver[idx] = bestTarget;
    }
  }

  // Flow accumulation in topological descending elevation order
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => filledDem.values[b] - filledDem.values[a]
  );
  const flowAcc = new Float64Array(n).fill(1);
  for (const idx of order) {
    const t = receiver[idx];
    if (t >= 0) flowAcc[t] += flowAcc[idx];
  }

  let outletIdx = 0;
  let maxAcc = 0;
  for (let i = 0; i < n; i++) {
    if (flowAcc[i] > maxAcc) {
      maxAcc = flowAcc[i];
      outletIdx = i;
    }
  }

  // Channel threshold -> Strahler Stream Ordering
  const channelThreshold = Math.max(8, Math.round(maxAcc * 0.045));
  const isStream = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (flowAcc[i] >= channelThreshold) isStream[i] = 1;
  }

  const upstreamStreams: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    if (isStream[i] && receiver[i] >= 0 && isStream[receiver[i]]) {
      upstreamStreams[receiver[i]].push(i);
    }
  }

  const strahler = new Uint8Array(n);
  for (const idx of order) {
    if (!isStream[idx]) continue;
    const ups = upstreamStreams[idx];
    if (ups.length === 0) {
      strahler[idx] = 1;
    } else {
      let maxOrd = 0;
      let countMax = 0;
      for (const u of ups) {
        if (strahler[u] > maxOrd) {
          maxOrd = strahler[u];
          countMax = 1;
        } else if (strahler[u] === maxOrd) {
          countMax++;
        }
      }
      strahler[idx] = countMax >= 2 ? maxOrd + 1 : maxOrd;
    }
  }

  const [minLng, minLat, maxLng, maxLat] = filledDem.bounds;
  const dx = (maxLng - minLng) / cols;
  const dy = (maxLat - minLat) / rows;
  const cellCenter = (idx: number): [number, number] => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    return [
      Number((minLng + (c + 0.5) * dx).toFixed(6)),
      Number((maxLat - (r + 0.5) * dy).toFixed(6)),
    ];
  };

  // Extract stream segments as GeoJSON LineStrings
  const streamFeatures: Feature<LineString, Record<string, any>>[] = [];
  let maxStrahlerOrder = 1;
  let totalStreamLenKm = 0;

  for (let i = 0; i < n; i++) {
    if (!isStream[i]) continue;
    if (strahler[i] > maxStrahlerOrder) maxStrahlerOrder = strahler[i];
    // Start a segment at stream headwaters or junctions
    const ups = upstreamStreams[i];
    const isStart = ups.length === 0 || ups.some((u) => strahler[u] !== strahler[i]) || ups.length >= 2;
    if (!isStart) continue;

    const coords: Array<[number, number]> = [cellCenter(i)];
    let cur = i;
    const ord = strahler[i];
    let guard = 0;
    while (guard++ < n) {
      const next = receiver[cur];
      if (next < 0 || !isStream[next]) break;
      coords.push(cellCenter(next));
      if (strahler[next] !== ord || upstreamStreams[next].length >= 2) break;
      cur = next;
    }
    if (coords.length >= 2) {
      const line = turf.lineString(coords, {
        name: `Cauce Orden ${ord}`,
        strahler_order: ord,
        flow_acc_cells: Math.round(flowAcc[i]),
      });
      totalStreamLenKm += turf.length(line, { units: 'kilometers' });
      streamFeatures.push(line);
    }
  }

  // Watershed delineation: trace all cells that drain to outletIdx
  const drainsToOutlet = new Uint8Array(n);
  const reverseChildren: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    if (receiver[i] >= 0) reverseChildren[receiver[i]].push(i);
  }
  const queue: number[] = [outletIdx];
  drainsToOutlet[outletIdx] = 1;
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const ch of reverseChildren[cur]) {
      if (!drainsToOutlet[ch]) {
        drainsToOutlet[ch] = 1;
        queue.push(ch);
      }
    }
  }

  const basinPts: Array<[number, number]> = [];
  let basinMinZ = Infinity;
  let basinMaxZ = -Infinity;
  let basinCellCount = 0;
  for (let i = 0; i < n; i++) {
    if (drainsToOutlet[i]) {
      basinCellCount++;
      basinPts.push(cellCenter(i));
      const z = filledDem.values[i];
      if (z < basinMinZ) basinMinZ = z;
      if (z > basinMaxZ) basinMaxZ = z;
    }
  }

  // Convert basin point set to smooth concave/convex polygon boundary
  let basinPoly: Feature<Polygon, Record<string, any>> | null = null;
  if (basinPts.length >= 3) {
    const fcPts = turf.featureCollection(basinPts.map((pt) => turf.point(pt)));
    const hull = turf.concave(fcPts, { maxEdge: Math.max(filledDem.cellSizeMeters * 2.6, 500) / 1000, units: 'kilometers' }) || turf.convex(fcPts);
    if (hull && hull.geometry.type === 'Polygon') {
      basinPoly = hull as Feature<Polygon, Record<string, any>>;
    }
  }

  const cellAreaKm2 = (filledDem.cellSizeMeters * filledDem.cellSizeMeters) / 1_000_000;
  const basinAreaKm2 = Math.max(0.01, Math.round(basinCellCount * cellAreaKm2 * 100) / 100);
  const basinPerimeterKm = basinPoly
    ? Math.round(turf.length(turf.polygonToLine(basinPoly) as any, { units: 'kilometers' }) * 100) / 100
    : Math.round(Math.sqrt(basinAreaKm2) * 4 * 100) / 100;
  const compactnessKc = Math.round(((0.282 * basinPerimeterKm) / Math.sqrt(basinAreaKm2)) * 100) / 100;
  const reliefM = Math.max(1, Math.round((basinMaxZ - basinMinZ) * 10) / 10);
  const mainChannelLengthKm = Math.max(
    0.1,
    Math.round(Math.max(totalStreamLenKm * 0.45, Math.sqrt(basinAreaKm2) * 1.35) * 100) / 100
  );
  const slopeAvg = Math.max(0.002, reliefM / (mainChannelLengthKm * 1000));
  // Kirpich formula: Tc (min) = 0.0195 * L(m)^0.77 * S^-0.385
  const kirpichTcMin =
    Math.round(0.0195 * Math.pow(mainChannelLengthKm * 1000, 0.77) * Math.pow(slopeAvg, -0.385) * 10) / 10;
  const rationalPeakFlowM3s =
    Math.round(((runoffCoeffC * rainfallMmHr * basinAreaKm2) / 3.6) * 100) / 100;
  const drainageDensity = Math.round((totalStreamLenKm / basinAreaKm2) * 100) / 100;

  if (basinPoly) {
    basinPoly.properties = {
      name: 'Subcuenca Delineada Automáticamente (D8)',
      area_km2: basinAreaKm2,
      perimeter_km: basinPerimeterKm,
      kc_gravelius: compactnessKc,
      tc_kirpich_min: kirpichTcMin,
      q_racional_m3s: rationalPeakFlowM3s,
    };
  }

  // Compute TWI on filled DEM
  const slopeGrid = computeSlopeGrid(filledDem).grid;
  const twiValues = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const tanBeta = Math.max(Math.tan((slopeGrid.values[i] * Math.PI) / 180), 0.005);
    const sca = flowAcc[i] * filledDem.cellSizeMeters;
    twiValues[i] = Math.round(Math.log(sca / tanBeta) * 100) / 100;
  }

  return {
    filledDem,
    flowAccumulationGrid: {
      ...filledDem,
      id: `facc-${Date.now()}`,
      name: 'Acumulación de Flujo D8 (celdas aportantes)',
      unit: 'celdas',
      values: Array.from(flowAcc),
      colorScale: 'ndwi',
    },
    twiGrid: {
      ...filledDem,
      id: `twi2-${Date.now()}`,
      name: 'Índice Topográfico TWI (DEM Sin Sumideros)',
      unit: 'TWI',
      values: twiValues,
      colorScale: 'twi',
    },
    streamNetworkGeoJson: {
      type: 'FeatureCollection',
      features: streamFeatures,
    },
    watershedGeoJson: {
      type: 'FeatureCollection',
      features: basinPoly ? [basinPoly] : [],
    },
    sinksFilledCount,
    maxStrahlerOrder,
    streamSegmentCount: streamFeatures.length,
    morphometry: {
      basinAreaKm2,
      basinPerimeterKm,
      compactnessKc,
      mainChannelLengthKm,
      drainageDensityKmKm2: drainageDensity,
      reliefM,
      kirpichTcMin,
      rainfallMmHr,
      runoffCoeffC,
      rationalPeakFlowM3s,
    },
    methodologyNote:
      'Susceptibilidad topográfica D8 / TWI tras relleno Priority-Flood y caudal pico por Método Racional (Q=CIA/3.6) con Tc de Kirpich. No sustituye modelamiento hidráulico 2D (HEC-RAS / IBER).',
  };
}

export interface HydroExposureItem {
  name: string;
  twiAtLocation: number;
  distanceToStreamM: number;
  exposureLevel: 'Alto' | 'Moderado' | 'Bajo';
}

export function computeHydroTerritorialExposure(
  twiGrid: DemGrid,
  streamFc: GeoFeatureCollection,
  facilitiesFc: GeoFeatureCollection
): HydroExposureItem[] {
  const [minLng, minLat, maxLng, maxLat] = twiGrid.bounds;
  const streamLines = streamFc.features.filter((f) => f.geometry?.type === 'LineString');

  return facilitiesFc.features
    .filter((f) => Boolean(f.geometry))
    .map((f, idx) => {
      const name = String(f.properties?.name || f.properties?.nombre || `Activo #${idx + 1}`);
      const pt = f.geometry.type === 'Point' ? (f as any) : turf.centroid(f as any);
      const [lng, lat] = pt.geometry.coordinates as [number, number];

      const gc = Math.max(
        0,
        Math.min(twiGrid.cols - 1, Math.round(((lng - minLng) / Math.max(maxLng - minLng, 1e-9)) * (twiGrid.cols - 1)))
      );
      const gr = Math.max(
        0,
        Math.min(twiGrid.rows - 1, Math.round(((maxLat - lat) / Math.max(maxLat - minLat, 1e-9)) * (twiGrid.rows - 1)))
      );
      const twiAtLocation = twiGrid.values[gr * twiGrid.cols + gc] ?? 0;

      let minStreamDistM = 9999;
      for (const line of streamLines) {
        const dKm = turf.pointToLineDistance(pt, line as any, { units: 'kilometers' });
        if (dKm * 1000 < minStreamDistM) minStreamDistM = dKm * 1000;
      }
      const distRounded = Math.round(minStreamDistM);

      const exposureLevel: HydroExposureItem['exposureLevel'] =
        twiAtLocation >= 8.5 || distRounded <= 180
          ? 'Alto'
          : twiAtLocation >= 6.8 || distRounded <= 420
          ? 'Moderado'
          : 'Bajo';

      return {
        name,
        twiAtLocation,
        distanceToStreamM: distRounded,
        exposureLevel,
      };
    });
}
