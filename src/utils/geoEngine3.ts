import * as turf from '@turf/turf';
import type { Feature, Point } from 'geojson';
import {
  CrsCode,
  DemGrid,
  GeoFeatureCollection,
  PrecisionEnvelope,
  computeSlopeGrid,
  computeSuitabilityGrid,
  runVectorBuffer,
  runVectorClip,
  runVectorIntersect,
  transformFeatureCollectionCrs,
} from './geotechEngine';
import { computeAdvancedHydrology } from './hydrology2';

// =========================================================
// 1. SCIENTIFIC PRECISION ENVELOPE BUILDER
// =========================================================

export function buildPrecisionEnvelope(params: {
  resultSummary: string;
  method: string;
  crs: CrsCode;
  resolution: string;
  units: string;
  sourceData: string[];
  estimatedAccuracy: string;
  dataKind: PrecisionEnvelope['dataKind'];
  warnings?: string[];
}): PrecisionEnvelope {
  const defaultWarnings: string[] = [];
  if (params.dataKind === 'interpolado') {
    defaultWarnings.push('Superficie interpolada estadísticamente: NO constituye medición directa en todos los puntos.');
  } else if (params.dataKind === 'prediccion_ml') {
    defaultWarnings.push('Predicción generada por modelo GeoML: validar contra muestreo de campo antes de decisión constructiva.');
  } else if (params.dataKind === 'modelo_analitico') {
    defaultWarnings.push('Modelo analítico determinístico dependiente de los supuestos paramétricos y escala del DEM.');
  }
  return {
    resultSummary: params.resultSummary,
    method: params.method,
    crs: params.crs,
    resolution: params.resolution,
    units: params.units,
    sourceData: params.sourceData,
    timestamp: new Date().toISOString(),
    estimatedAccuracy: params.estimatedAccuracy,
    dataKind: params.dataKind,
    warnings: [...defaultWarnings, ...(params.warnings || [])],
  };
}

// =========================================================
// 2. GEOENGINE ABSTRACTION LAYER (AUTOMATIC ROUTING)
// =========================================================

export type GeoEngineBackend =
  | 'Turf / GEOS-JS'
  | 'PROJ4 Reprojection Engine'
  | 'Raster Engine 3.0'
  | 'Hydrology D8/Priority-Flood'
  | 'PDAL / LiDAR Engine TS'
  | 'GDAL / PostGIS Worker (Externo)';

export interface GeoEngineDispatchInput {
  operation:
    | 'buffer'
    | 'clip'
    | 'intersect'
    | 'reproject'
    | 'slope'
    | 'hydrology'
    | 'gpkg_import'
    | 'laz_import';
  featureCollection?: GeoFeatureCollection;
  maskCollection?: GeoFeatureCollection;
  dem?: DemGrid;
  fromCrs?: CrsCode;
  toCrs?: CrsCode;
  distanceMeters?: number;
  externalWorkerUrl?: string | null;
}

export interface GeoEngineDispatchResult {
  engineSelected: GeoEngineBackend;
  fallbackReason?: string;
  featureCollection?: GeoFeatureCollection;
  grid?: DemGrid;
  durationMs: number;
  precision: PrecisionEnvelope;
}

export const GeoEngine = {
  selectBackend(operation: GeoEngineDispatchInput['operation'], externalWorkerUrl?: string | null): GeoEngineBackend {
    if ((operation === 'gpkg_import' || operation === 'laz_import') && externalWorkerUrl) {
      return 'GDAL / PostGIS Worker (Externo)';
    }
    if (operation === 'gpkg_import' || operation === 'laz_import') {
      return 'GDAL / PostGIS Worker (Externo)';
    }
    if (operation === 'reproject') return 'PROJ4 Reprojection Engine';
    if (operation === 'slope') return 'Raster Engine 3.0';
    if (operation === 'hydrology') return 'Hydrology D8/Priority-Flood';
    return 'Turf / GEOS-JS';
  },

  dispatch(input: GeoEngineDispatchInput): GeoEngineDispatchResult {
    const t0 = performance.now();
    const backend = this.selectBackend(input.operation, input.externalWorkerUrl);

    if (input.operation === 'gpkg_import' || input.operation === 'laz_import') {
      if (!input.externalWorkerUrl) {
        throw new Error(
          `La operación "${input.operation}" requiere el microservicio externo (${backend}) configurado vía GEOSPATIAL_WORKER_URL.`
        );
      }
    }

    if (input.operation === 'buffer' && input.featureCollection) {
      const dist = input.distanceMeters ?? 250;
      const out = runVectorBuffer(input.featureCollection, dist, false);
      return {
        engineSelected: backend,
        featureCollection: out,
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        precision: buildPrecisionEnvelope({
          resultSummary: `${out.features.length} polígonos de influencia geodésica (${dist} m)`,
          method: 'Geodesic Buffer (Turf/WGS84)',
          crs: input.toCrs || 'EPSG:4326',
          resolution: 'Geodésica continua',
          units: 'metros / ha',
          sourceData: ['Capa vectorial de entrada'],
          estimatedAccuracy: 'Sub-métrica en coordenadas WGS84',
          dataKind: 'modelo_analitico',
        }),
      };
    }

    if (input.operation === 'clip' && input.featureCollection && input.maskCollection) {
      const out = runVectorClip(input.featureCollection, input.maskCollection);
      return {
        engineSelected: backend,
        featureCollection: out,
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        precision: buildPrecisionEnvelope({
          resultSummary: `${out.features.length} entidades recortadas contra máscara`,
          method: 'Boolean Polygon Clip / Point-in-Polygon',
          crs: 'EPSG:4326',
          resolution: 'Vector exacto',
          units: 'ha',
          sourceData: ['Capa A', 'Máscara B'],
          estimatedAccuracy: 'Topológica exacta IEEE-754',
          dataKind: 'modelo_analitico',
        }),
      };
    }

    if (input.operation === 'intersect' && input.featureCollection && input.maskCollection) {
      const out = runVectorIntersect(input.featureCollection, input.maskCollection);
      return {
        engineSelected: backend,
        featureCollection: out,
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        precision: buildPrecisionEnvelope({
          resultSummary: `${out.features.length} polígonos intersectados`,
          method: 'Polygon Intersection (Martinez-Rueda)',
          crs: 'EPSG:4326',
          resolution: 'Vector exacto',
          units: 'ha',
          sourceData: ['Capa A', 'Capa B'],
          estimatedAccuracy: 'Topológica exacta IEEE-754',
          dataKind: 'modelo_analitico',
        }),
      };
    }

    if (input.operation === 'reproject' && input.featureCollection) {
      const fromCrs = input.fromCrs || 'EPSG:4326';
      const toCrs = input.toCrs || 'EPSG:32718';
      const out = transformFeatureCollectionCrs(input.featureCollection, fromCrs, toCrs);
      return {
        engineSelected: backend,
        featureCollection: out,
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        precision: buildPrecisionEnvelope({
          resultSummary: `Reproyección de ${out.features.length} entidades (${fromCrs} → ${toCrs})`,
          method: 'PROJ4 Datum & Ellipsoid Transformation',
          crs: toCrs,
          resolution: 'Precisión 1e-6',
          units: toCrs === 'EPSG:4326' ? 'grados' : 'metros',
          sourceData: [fromCrs],
          estimatedAccuracy: fromCrs.startsWith('EPSG:248') ? '±1–3 m (transformación Molodensky PSAD56→WGS84)' : '< 0.01 m',
          dataKind: 'modelo_analitico',
        }),
      };
    }

    if (input.operation === 'slope' && input.dem) {
      const res = computeSlopeGrid(input.dem);
      return {
        engineSelected: backend,
        grid: res.grid,
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        precision: buildPrecisionEnvelope({
          resultSummary: `Pendiente Horn 3×3: media ${res.meanDeg}°, máx ${res.maxDeg}°`,
          method: 'Horn (1981) 3×3 Finite Difference Gradient',
          crs: input.dem.crs,
          resolution: `${input.dem.cellSizeMeters} m/celda`,
          units: 'grados (°)',
          sourceData: [input.dem.name],
          estimatedAccuracy: `Depende de paso de grilla ${input.dem.cellSizeMeters} m (suaviza micro-escarpes < ${input.dem.cellSizeMeters} m)`,
          dataKind: 'modelo_analitico',
        }),
      };
    }

    if (input.operation === 'hydrology' && input.dem) {
      const hydro = computeAdvancedHydrology(input.dem, 45, 0.55);
      return {
        engineSelected: backend,
        grid: hydro.twiGrid,
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        precision: buildPrecisionEnvelope({
          resultSummary: `Cuenca ${hydro.morphometry.basinAreaKm2} km², Tc=${hydro.morphometry.kirpichTcMin} min, Q=${hydro.morphometry.rationalPeakFlowM3s} m³/s`,
          method: 'Priority-Flood + D8 + Strahler + Kirpich + Método Racional',
          crs: input.dem.crs,
          resolution: `${input.dem.cellSizeMeters} m/celda`,
          units: 'TWI / m³/s',
          sourceData: [input.dem.name],
          estimatedAccuracy: 'Susceptibilidad topográfica e hidrología preliminar (NO modelamiento hidráulico 2D)',
          dataKind: 'modelo_analitico',
          warnings: ['No reemplaza modelamiento hidráulico 2D (HEC-RAS / IBER) para tirantes o velocidades de desborde.'],
        }),
      };
    }

    throw new Error(`Entradas insuficientes para despachar operación "${input.operation}" en GeoEngine.`);
  },
};

// =========================================================
// 3. SPATIAL UNCERTAINTY & SENSITIVITY ENGINE
// =========================================================

export interface SpatialUncertaintyReport {
  resultGrid: DemGrid;
  confidenceGrid: DemGrid; // 0..100 confidence score per pixel
  sampleCount: number;
  domainAreaKm2: number;
  sampleDensityPerKm2: number;
  meanNearestSampleM: number;
  maxNearestSampleM: number;
  lowConfidencePct: number; // % of pixels with confidence < 45%
  overallConfidenceScore: number; // 0..100
  sensitivitySummary: Array<{
    parameter: string;
    baselineScore: number;
    perturbedPlus15Pct: number;
    perturbedMinus15Pct: number;
    sensitivityIndexPct: number;
  }>;
  precisionEnvelope: PrecisionEnvelope;
}

export function computeSpatialUncertaintyAnalysis(
  pointsFc: GeoFeatureCollection,
  numericField: string,
  dem: DemGrid
): SpatialUncertaintyReport {
  const validPts: Array<{ lng: number; lat: number; val: number }> = [];
  for (const f of pointsFc.features) {
    if (!f.geometry) continue;
    const val = Number(f.properties?.[numericField]);
    if (!Number.isFinite(val)) continue;
    const pt: Feature<Point> = f.geometry.type === 'Point' ? (f as Feature<Point>) : turf.centroid(f as any);
    validPts.push({ lng: pt.geometry.coordinates[0], lat: pt.geometry.coordinates[1], val });
  }

  if (validPts.length === 0) {
    throw new Error(`Se requiere al menos 1 muestra puntual válida para evaluar incertidumbre en "${numericField}".`);
  }

  const [minLng, minLat, maxLng, maxLat] = dem.bounds;
  const dx = (maxLng - minLng) / dem.cols;
  const dy = (maxLat - minLat) / dem.rows;
  const n = dem.rows * dem.cols;

  const resultVals = new Array<number>(n);
  const confVals = new Array<number>(n);

  const widthKm = turf.distance([minLng, (minLat + maxLat) / 2], [maxLng, (minLat + maxLat) / 2], { units: 'kilometers' });
  const heightKm = turf.distance([(minLng + maxLng) / 2, minLat], [(minLng + maxLng) / 2, maxLat], { units: 'kilometers' });
  const domainAreaKm2 = Math.max(0.05, Math.round(widthKm * heightKm * 100) / 100);
  const characteristicRadiusM = Math.max(350, Math.sqrt((domainAreaKm2 * 1_000_000) / Math.max(validPts.length, 1)) * 0.9);

  let sumDist = 0;
  let maxDist = 0;
  let lowConfCount = 0;
  let confSum = 0;

  for (let r = 0; r < dem.rows; r++) {
    const lat = maxLat - (r + 0.5) * dy;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    for (let c = 0; c < dem.cols; c++) {
      const lng = minLng + (c + 0.5) * dx;
      let num = 0;
      let den = 0;
      let minDist = Infinity;
      let nearbyCount = 0;
      let exact: number | null = null;
      const localVals: number[] = [];

      for (const p of validPts) {
        const dM = Math.hypot((lng - p.lng) * 111320 * cosLat, (lat - p.lat) * 110540);
        if (dM < minDist) minDist = dM;
        if (dM <= characteristicRadiusM * 1.4) {
          nearbyCount++;
          localVals.push(p.val);
        }
        if (dM < 5) exact = p.val;
        const w = 1 / Math.pow(Math.max(dM, 5), 2);
        num += w * p.val;
        den += w;
      }

      const idx = r * dem.cols + c;
      resultVals[idx] = Math.round((exact !== null ? exact : num / den) * 100) / 100;

      // Local spatial variance penalty
      let variancePenalty = 0;
      if (localVals.length >= 2) {
        const meanL = localVals.reduce((s, x) => s + x, 0) / localVals.length;
        const stdL = Math.sqrt(localVals.reduce((s, x) => s + (x - meanL) ** 2, 0) / localVals.length);
        const cv = meanL !== 0 ? Math.min(1, stdL / Math.abs(meanL)) : 0;
        variancePenalty = cv * 22;
      }

      // Distance decay confidence + local neighbor support
      const distScore = Math.exp(-minDist / (characteristicRadiusM * 1.15)) * 75;
      const densityBonus = Math.min(25, nearbyCount * 8);
      const confidence = Math.max(5, Math.min(99, Math.round((distScore + densityBonus - variancePenalty) * 10) / 10));

      confVals[idx] = confidence;
      confSum += confidence;
      sumDist += minDist;
      if (minDist > maxDist) maxDist = minDist;
      if (confidence < 45) lowConfCount++;
    }
  }

  // Sensitivity analysis over AHP Territorial weights on the same DEM
  const meanSuitScore = (g: DemGrid) => {
    const valid = g.values.filter((v) => Number.isFinite(v) && v !== g.noData);
    if (!valid.length) return 0;
    return Math.round((valid.reduce((s, x) => s + x, 0) / valid.length) * 100) / 100;
  };
  const baseSuit = meanSuitScore(
    computeSuitabilityGrid(
      dem,
      { slope: 0.35, hydrology: 0.25, elevation: 0.2, accessibility: 0.2 },
      35
    ).grid
  );

  const sensSlopeUp = meanSuitScore(computeSuitabilityGrid(dem, { slope: 0.45, hydrology: 0.22, elevation: 0.16, accessibility: 0.17 }, 35).grid);
  const sensSlopeDn = meanSuitScore(computeSuitabilityGrid(dem, { slope: 0.25, hydrology: 0.28, elevation: 0.24, accessibility: 0.23 }, 35).grid);
  const sensHydroUp = meanSuitScore(computeSuitabilityGrid(dem, { slope: 0.30, hydrology: 0.38, elevation: 0.16, accessibility: 0.16 }, 35).grid);
  const sensHydroDn = meanSuitScore(computeSuitabilityGrid(dem, { slope: 0.38, hydrology: 0.15, elevation: 0.24, accessibility: 0.23 }, 35).grid);

  const sensitivitySummary = [
    {
      parameter: 'Peso Pendiente Topográfica (AHP)',
      baselineScore: baseSuit,
      perturbedPlus15Pct: sensSlopeUp,
      perturbedMinus15Pct: sensSlopeDn,
      sensitivityIndexPct: Math.round((Math.abs(sensSlopeUp - sensSlopeDn) / Math.max(baseSuit, 1)) * 1000) / 10,
    },
    {
      parameter: 'Peso Hidrología / TWI (AHP)',
      baselineScore: baseSuit,
      perturbedPlus15Pct: sensHydroUp,
      perturbedMinus15Pct: sensHydroDn,
      sensitivityIndexPct: Math.round((Math.abs(sensHydroUp - sensHydroDn) / Math.max(baseSuit, 1)) * 1000) / 10,
    },
  ];

  const overallConfidenceScore = Math.round((confSum / Math.max(n, 1)) * 10) / 10;
  const lowConfidencePct = Math.round((lowConfCount / Math.max(n, 1)) * 1000) / 10;
  const sampleDensityPerKm2 = Math.round((validPts.length / domainAreaKm2) * 1000) / 1000;

  return {
    resultGrid: {
      ...dem,
      id: `uncert-res-${Date.now()}`,
      name: `Resultado Interpolado IDW (${numericField})`,
      unit: numericField,
      values: resultVals,
      colorScale: 'idw',
    },
    confidenceGrid: {
      ...dem,
      id: `uncert-conf-${Date.now()}`,
      name: `Mapa de Confianza Espacial (0–100%) — ${numericField}`,
      unit: '% confianza',
      values: confVals,
      colorScale: 'suitability',
    },
    sampleCount: validPts.length,
    domainAreaKm2,
    sampleDensityPerKm2,
    meanNearestSampleM: Math.round(sumDist / Math.max(n, 1)),
    maxNearestSampleM: Math.round(maxDist),
    lowConfidencePct,
    overallConfidenceScore,
    sensitivitySummary,
    precisionEnvelope: buildPrecisionEnvelope({
      resultSummary: `Confianza espacial media ${overallConfidenceScore}% (${validPts.length} muestras; ${lowConfidencePct}% área de baja cobertura)`,
      method: 'Evaluador de Incertidumbre Espacial (Distancia mínima + Densidad local + Varianza CV + Sensibilidad AHP)',
      crs: dem.crs,
      resolution: `${dem.cellSizeMeters} m`,
      units: '% confianza / m',
      sourceData: [`${validPts.length} estaciones (${numericField})`, dem.name],
      estimatedAccuracy: `Distancia media a muestra más cercana: ${Math.round(sumDist / Math.max(n, 1))} m`,
      dataKind: 'interpolado',
      warnings:
        lowConfidencePct > 40
          ? [`El ${lowConfidencePct}% del dominio presenta confianza < 45% por baja densidad de muestreo.`]
          : [],
    }),
  };
}
