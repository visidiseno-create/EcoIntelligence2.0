import JSZip from 'jszip';
import {
  CrsCode,
  DemGrid,
  GeoFeatureCollection,
  GeotechProject,
  PrecisionEnvelope,
  computeSlopeGrid,
  computeHydrologyD8AndTwi,
  computeSuitabilityGrid,
  computeSpectralIndex,
  computeSpectralChange,
  runVectorBuffer,
  evaluateSlopeStability,
} from './geotechEngine';
import { computeBearingCapacity } from './geotechPro2';
import { computeAdvancedHydrology } from './hydrology2';

// =========================================================
// 1. PORTABLE FIPS 180-4 SHA-256 (BROWSER + NODE SAFE)
// =========================================================

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('');
}

// =========================================================
// 2. UNCERTAINTY TRANSPARENCY GUARD (RESULTADO + CONFIANZA + LIMITACIONES)
// =========================================================

export interface ExplicitUncertaintyReport {
  resultado: string;
  confianza: string;
  limitaciones: string[];
  dataKind: PrecisionEnvelope['dataKind'];
  requiresFieldCalibration: boolean;
}

export function ensurePrecisionUncertainty(envelope: PrecisionEnvelope): ExplicitUncertaintyReport {
  const limitations = [...(envelope.warnings || [])];
  if (limitations.length === 0) {
    limitations.push('Resultado dependiente de la escala, densidad de muestreo y sistema de referencia CRS del proyecto.');
  }
  const requiresFieldCalibration =
    envelope.dataKind === 'interpolado' ||
    envelope.dataKind === 'prediccion_ml' ||
    envelope.dataKind === 'modelo_analitico';

  return {
    resultado: `${envelope.resultSummary} [${envelope.units} · ${envelope.crs}]`,
    confianza: `${envelope.estimatedAccuracy} (Tipo: ${envelope.dataKind.toUpperCase()})`,
    limitaciones: limitations,
    dataKind: envelope.dataKind,
    requiresFieldCalibration,
  };
}

// =========================================================
// 3. GEOREPRODUCIBILITY PACKAGE & DRIFT DETECTION
// =========================================================

export type ReproAlgorithmId =
  | 'slope_horn'
  | 'twi_d8'
  | 'hydrology_rational'
  | 'ahp_suitability'
  | 'ndvi_t2'
  | 'ndvi_change'
  | 'vector_buffer'
  | 'slope_stability_bishop'
  | 'bearing_terzaghi';

export interface GeoReproPackage {
  id: string;
  projectId: string;
  projectCode: string;
  title: string;
  algorithm: ReproAlgorithmId;
  engine: string;
  engineVersion: string;
  version: string;
  crs: CrsCode;
  parameters: Record<string, any>;
  datasetHash: string;
  resultHash: string;
  resultSummary: string;
  resultMetrics: Record<string, number | string>;
  uncertainty: ExplicitUncertaintyReport;
  dagWorkflow?: string[];
  createdAt: string;
  user: string;
}

export function computeProjectDatasetHash(project: GeotechProject): string {
  const fingerprint = {
    id: project.id,
    defaultCrs: project.defaultCrs,
    dem: {
      cols: project.dem.cols,
      rows: project.dem.rows,
      cellSizeMeters: project.dem.cellSizeMeters,
      bounds: project.dem.bounds,
      values: project.dem.values,
    },
    layers: project.layers.map((l) => ({
      id: l.id,
      crs: l.crs,
      kind: l.kind,
      featuresCount: l.geojson?.features.length || 0,
      sampleCoords: l.geojson?.features.slice(0, 10).map((f) => f.geometry) || [],
    })),
    boreholesCount: project.boreholes.length,
    boreholesSummary: project.boreholes.map((b) => ({
      code: b.code,
      wt: b.waterTableDepthM,
      strata: b.strata.length,
    })),
  };
  return sha256Hex(JSON.stringify(fingerprint));
}

export function executeReproAlgorithm(
  project: GeotechProject,
  algorithm: ReproAlgorithmId,
  parameters: Record<string, any> = {}
): { summary: string; metrics: Record<string, number | string>; engine: string } {
  if (algorithm === 'slope_horn') {
    const res = computeSlopeGrid(project.dem);
    return {
      engine: 'ECOINTELLIGENCE Raster Horn 3×3 (TS)',
      summary: `Pendiente media ${res.meanDeg}°, máx ${res.maxDeg}°`,
      metrics: { minDeg: res.minDeg, meanDeg: res.meanDeg, maxDeg: res.maxDeg, steepPct: res.steepPct },
    };
  }
  if (algorithm === 'twi_d8') {
    const res = computeHydrologyD8AndTwi(project.dem);
    return {
      engine: 'ECOINTELLIGENCE D8/TWI Engine (TS)',
      summary: `TWI medio ${res.meanTwi}, flujo máx ${res.maxFlowAccumulation} celdas`,
      metrics: { meanTwi: res.meanTwi, maxFlowAccumulation: res.maxFlowAccumulation, floodPronePct: res.floodPronePct },
    };
  }
  if (algorithm === 'hydrology_rational') {
    const rain = Number(parameters.rainfallMmHr ?? 45);
    const c = Number(parameters.runoffCoeffC ?? 0.55);
    const res = computeAdvancedHydrology(project.dem, rain, c);
    return {
      engine: 'Priority-Flood + Strahler + Racional (TS)',
      summary: `Q_pico=${res.morphometry.rationalPeakFlowM3s} m³/s, Tc=${res.morphometry.kirpichTcMin} min`,
      metrics: {
        basinAreaKm2: res.morphometry.basinAreaKm2,
        kirpichTcMin: res.morphometry.kirpichTcMin,
        rationalPeakFlowM3s: res.morphometry.rationalPeakFlowM3s,
        maxStrahlerOrder: res.maxStrahlerOrder,
      },
    };
  }
  if (algorithm === 'ahp_suitability') {
    const maxSlope = Number(parameters.maxSlopeDeg ?? 35);
    const weights = {
      slope: Number(parameters.wSlope ?? 0.4),
      hydrology: Number(parameters.wHydro ?? 0.25),
      elevation: Number(parameters.wElev ?? 0.2),
      accessibility: Number(parameters.wAccess ?? 0.15),
    };
    const res = computeSuitabilityGrid(project.dem, weights, maxSlope);
    return {
      engine: 'Saaty AHP Territorial Engine (TS)',
      summary: `Aptitud Alta ${res.highHa} ha, Media ${res.mediumHa} ha`,
      metrics: { highHa: res.highHa, mediumHa: res.mediumHa, lowHa: res.lowHa, excludedHa: res.excludedHa },
    };
  }
  if (algorithm === 'ndvi_t2' && project.spectralScene) {
    const res = computeSpectralIndex(project.spectralScene, 't2', 'NDVI');
    return {
      engine: 'Remote Sensing Spectral Engine (TS)',
      summary: `NDVI(T2) medio ${res.mean}, cobertura >0.25: ${res.positiveCoveragePct}%`,
      metrics: { min: res.min, max: res.max, mean: res.mean, positiveCoveragePct: res.positiveCoveragePct },
    };
  }
  if (algorithm === 'ndvi_change' && project.spectralScene) {
    const res = computeSpectralChange(project.spectralScene, 'NDVI');
    return {
      engine: 'Multitemporal Change Engine (TS)',
      summary: `ΔNDVI medio ${res.meanDelta}, pérdida ${res.significantLossPct}%`,
      metrics: { meanDelta: res.meanDelta, significantLossPct: res.significantLossPct, significantGainPct: res.significantGainPct },
    };
  }
  if (algorithm === 'vector_buffer') {
    const vec = project.layers.find((l) => l.kind === 'vector' && l.geojson && l.geojson.features.length > 0)?.geojson;
    if (!vec) throw new Error('El proyecto no contiene capas vectoriales para Buffer.');
    const dist = Number(parameters.distanceMeters ?? 300);
    const out = runVectorBuffer(vec, dist, false);
    const totalHa = out.features.reduce((s, f) => s + Number(f.properties?.area_ha || 0), 0);
    return {
      engine: 'Turf/GEOS-JS Vector Engine',
      summary: `Buffer ${dist} m: ${out.features.length} entidades, área ${Math.round(totalHa * 100) / 100} ha`,
      metrics: { count: out.features.length, distanceMeters: dist, totalAreaHa: Math.round(totalHa * 100) / 100 },
    };
  }
  if (algorithm === 'bearing_terzaghi') {
    const res = computeBearingCapacity({
      method: 'terzaghi',
      footingShape: 'square',
      widthBM: Number(parameters.widthBM ?? 2.5),
      lengthLM: Number(parameters.widthBM ?? 2.5),
      embedmentDfM: Number(parameters.embedmentDfM ?? 1.5),
      waterTableDepthM: Number(parameters.waterTableDepthM ?? 4.0),
      cohesionKpa: Number(parameters.cohesionKpa ?? 18),
      frictionDeg: Number(parameters.frictionDeg ?? 30),
      unitWeightKnM3: Number(parameters.unitWeightKnM3 ?? 18.5),
      safetyFactor: Number(parameters.safetyFactor ?? 3.0),
    });
    return {
      engine: 'Geotech Analytical Terzaghi (TS)',
      summary: `q_ult=${res.qUltKpa} kPa, q_adm=${res.qAdmKpa} kPa`,
      metrics: { qUltKpa: res.qUltKpa, qAdmKpa: res.qAdmKpa, nc: res.nc, nq: res.nq },
    };
  }

  // Fallback / default slope stability
  const stab = evaluateSlopeStability({
    method: 'simplified_bishop',
    slopeAngleDeg: Number(parameters.slopeAngleDeg ?? 32),
    slopeHeightM: Number(parameters.slopeHeightM ?? 12),
    failureDepthM: Number(parameters.failureDepthM ?? 4),
    unitWeightKnM3: Number(parameters.unitWeightKnM3 ?? 19),
    cohesionKpa: Number(parameters.cohesionKpa ?? 14),
    frictionDeg: Number(parameters.frictionDeg ?? 28),
    porePressureRatioRu: Number(parameters.porePressureRatioRu ?? 0.25),
  });
  return {
    engine: 'Bishop Limit Equilibrium (TS)',
    summary: `FS=${stab.safetyFactor} (${stab.stabilityClass})`,
    metrics: { safetyFactor: stab.safetyFactor, driving: stab.drivingForceOrMoment, resisting: stab.resistingForceOrMoment },
  };
}

export function createGeoReproPackage(params: {
  project: GeotechProject;
  title: string;
  algorithm: ReproAlgorithmId;
  parameters?: Record<string, any>;
  user: string;
  dagWorkflow?: string[];
}): GeoReproPackage {
  const datasetHash = computeProjectDatasetHash(params.project);
  const exec = executeReproAlgorithm(params.project, params.algorithm, params.parameters || {});
  const resultHash = sha256Hex(JSON.stringify({ algorithm: params.algorithm, parameters: params.parameters || {}, metrics: exec.metrics }));

  return {
    id: `repro-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    projectId: params.project.id,
    projectCode: params.project.code,
    title: params.title,
    algorithm: params.algorithm,
    engine: exec.engine,
    engineVersion: '4.0.0',
    version: `v${(params.project.versions?.length || 0) + 1}.0`,
    crs: params.project.defaultCrs,
    parameters: params.parameters || {},
    datasetHash,
    resultHash,
    resultSummary: exec.summary,
    resultMetrics: exec.metrics,
    uncertainty: {
      resultado: exec.summary,
      confianza: 'Determinismo numérico IEEE-754 verificable por hash SHA-256',
      limitaciones: ['Validez sujeta a la resolución del DEM/capas base registradas y parámetros declarados.'],
      dataKind: 'modelo_analitico',
      requiresFieldCalibration: true,
    },
    dagWorkflow: params.dagWorkflow,
    createdAt: new Date().toISOString(),
    user: params.user,
  };
}

export interface ReproComparisonResult {
  packageId: string;
  status: 'REPRODUCIBLE_EXACTO' | 'DERIVA_DATOS' | 'DERIVA_ALGORITMO';
  originalDatasetHash: string;
  currentDatasetHash: string;
  originalResultHash: string;
  currentResultHash: string;
  datasetMatch: boolean;
  resultMatch: boolean;
  metricDeltas: Array<{ metric: string; original: number | string; current: number | string; changed: boolean }>;
  diagnostic: string;
}

export function reexecuteAndVerifyReproPackage(
  pkg: GeoReproPackage,
  project: GeotechProject
): ReproComparisonResult {
  const currentDatasetHash = computeProjectDatasetHash(project);
  const exec = executeReproAlgorithm(project, pkg.algorithm, pkg.parameters);
  const currentResultHash = sha256Hex(JSON.stringify({ algorithm: pkg.algorithm, parameters: pkg.parameters, metrics: exec.metrics }));

  const datasetMatch = currentDatasetHash === pkg.datasetHash;
  const resultMatch = currentResultHash === pkg.resultHash;

  const status: ReproComparisonResult['status'] =
    datasetMatch && resultMatch
      ? 'REPRODUCIBLE_EXACTO'
      : !datasetMatch
      ? 'DERIVA_DATOS'
      : 'DERIVA_ALGORITMO';

  const keys = Array.from(new Set([...Object.keys(pkg.resultMetrics), ...Object.keys(exec.metrics)]));
  const metricDeltas = keys.map((k) => ({
    metric: k,
    original: pkg.resultMetrics[k] ?? '—',
    current: exec.metrics[k] ?? '—',
    changed: pkg.resultMetrics[k] !== exec.metrics[k],
  }));

  return {
    packageId: pkg.id,
    status,
    originalDatasetHash: pkg.datasetHash,
    currentDatasetHash,
    originalResultHash: pkg.resultHash,
    currentResultHash,
    datasetMatch,
    resultMatch,
    metricDeltas,
    diagnostic:
      status === 'REPRODUCIBLE_EXACTO'
        ? 'Re-ejecución 100% reproducible: hashes de entrada y de resultado coinciden bit a bit.'
        : status === 'DERIVA_DATOS'
        ? 'Deriva detectada en los datos de entrada (DEM/capas/sondeos modificados tras generar el paquete).'
        : 'Deriva detectada en el resultado computado aunque los datos base permanecen sin cambios.',
  };
}

// =========================================================
// 4. DATASET INTEGRITY SHA-256 AUDITOR
// =========================================================

export interface DatasetIntegrityItem {
  assetId: string;
  title: string;
  kind: 'dem' | 'vector' | 'spectral' | 'lidar';
  crs: string;
  source: string;
  capturedDate: string;
  version: string;
  owner: string;
  license: string;
  byteSize: number;
  currentSha256: string;
  baselineSha256: string;
  integrityStatus: 'INTACTO' | 'MODIFICADO' | 'METADATOS_INCOMPLETOS';
}

export function auditProjectDatasetIntegrity(
  project: GeotechProject,
  baselineHashes?: Record<string, string>
): DatasetIntegrityItem[] {
  const items: DatasetIntegrityItem[] = [];

  const demPayload = JSON.stringify({ id: project.dem.id, values: project.dem.values, crs: project.dem.crs });
  const demHash = sha256Hex(demPayload);
  const demBase = baselineHashes?.[project.dem.id] || demHash;
  items.push({
    assetId: project.dem.id,
    title: project.dem.name,
    kind: 'dem',
    crs: project.dem.crs,
    source: 'Modelo Digital de Elevación Proyecto',
    capturedDate: project.createdAt.slice(0, 10),
    version: `v${(project.versions?.length || 0) + 1}`,
    owner: project.organizationId,
    license: 'Corporativo Interno',
    byteSize: demPayload.length,
    currentSha256: demHash,
    baselineSha256: demBase,
    integrityStatus: demHash === demBase ? 'INTACTO' : 'MODIFICADO',
  });

  for (const l of project.layers) {
    const raw = JSON.stringify({ id: l.id, crs: l.crs, geojson: l.geojson || null });
    const h = sha256Hex(raw);
    const base = baselineHashes?.[l.id] || h;
    const missingMeta = !l.source || !l.capturedDate || !l.crs;
    items.push({
      assetId: l.id,
      title: l.name,
      kind: 'vector',
      crs: l.crs || 'SIN_CRS',
      source: l.source || 'Sin origen declarado',
      capturedDate: l.capturedDate || 'Sin fecha',
      version: 'v1.0',
      owner: project.organizationId,
      license: l.license || 'Sin licencia declarada',
      byteSize: raw.length,
      currentSha256: h,
      baselineSha256: base,
      integrityStatus: h !== base ? 'MODIFICADO' : missingMeta ? 'METADATOS_INCOMPLETOS' : 'INTACTO',
    });
  }

  return items;
}

// =========================================================
// 5. FILE SECURITY SCANNER (MAGIC BYTES, ZIP BOMB, TRAVERSAL)
// =========================================================

export interface FileSecurityReport {
  safe: boolean;
  fileName: string;
  extension: string;
  detectedFormat: string;
  byteSize: number;
  sha256: string;
  checks: Array<{ check: string; passed: boolean; detail: string }>;
  blockedReason?: string;
}

const ALLOWED_GIS_EXTENSIONS = new Set([
  '.geojson', '.json', '.kml', '.kmz', '.csv', '.txt', '.asc',
  '.tif', '.tiff', '.zip', '.dxf', '.gml', '.las', '.gpkg', '.laz',
]);

export async function scanGeospatialFileSecurity(params: {
  fileName: string;
  bytes: Uint8Array;
  maxSizeBytes?: number;
}): Promise<FileSecurityReport> {
  const maxBytes = params.maxSizeBytes ?? 150 * 1024 * 1024;
  const rawName = params.fileName || 'unknown';
  const dotIdx = rawName.lastIndexOf('.');
  const ext = dotIdx >= 0 ? rawName.slice(dotIdx).toLowerCase() : '';
  const sha256 = sha256Hex(params.bytes);
  const checks: FileSecurityReport['checks'] = [];

  // 1. Path traversal / unsafe filename
  const traversalBad = rawName.includes('..') || rawName.includes('/') || rawName.includes('\\') || rawName.includes('\0');
  checks.push({
    check: 'Sanitización de ruta y nombre',
    passed: !traversalBad,
    detail: traversalBad ? 'Contiene secuencias de traversal (../ o barras).' : 'Nombre de archivo seguro.',
  });

  // 2. Extension allowlist
  const extAllowed = ALLOWED_GIS_EXTENSIONS.has(ext);
  checks.push({
    check: 'Extensión geoespacial permitida',
    passed: extAllowed,
    detail: extAllowed ? `Extensión ${ext} autorizada.` : `Extensión "${ext || '(vacía)'}" no autorizada.`,
  });

  // 3. Size check
  const sizeOk = params.bytes.byteLength > 0 && params.bytes.byteLength <= maxBytes;
  checks.push({
    check: 'Límite de tamaño máximo',
    passed: sizeOk,
    detail: `${params.bytes.byteLength.toLocaleString()} bytes (límite ${maxBytes.toLocaleString()}).`,
  });

  // 4. Magic bytes & fake-extension verification
  const b = params.bytes;
  let detectedFormat = 'Desconocido';
  let magicOk = true;
  const isTextExt = new Set(['.geojson', '.json', '.kml', '.gml', '.csv', '.txt', '.asc', '.dxf']).has(ext);
  const looksLikeBinaryExecutableOrMedia =
    b.length >= 4 && (
      (b[0] === 0x4d && b[1] === 0x5a) || // MZ (.exe/.dll)
      (b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) || // ELF
      (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || // PNG
      (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || // JPEG
      (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) || // %PDF
      (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) // PK ZIP
    );

  if (isTextExt && looksLikeBinaryExecutableOrMedia) {
    magicOk = false;
    detectedFormat = `Extensión falsa detectada: contenido binario camuflado como ${ext}`;
  } else if (b.length >= 4) {
    const ascii4 = String.fromCharCode(b[0], b[1], b[2], b[3]);
    if (ext === '.zip' || ext === '.kmz') {
      magicOk = b[0] === 0x50 && b[1] === 0x4b; // PK
      detectedFormat = magicOk ? 'ZIP / KMZ / Shapefile Archive (PK)' : 'Firma PK ausente';
    } else if (ext === '.tif' || ext === '.tiff') {
      magicOk = (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a);
      detectedFormat = magicOk ? 'TIFF / GeoTIFF válido' : 'Cabecera TIFF corrupta';
    } else if (ext === '.las') {
      magicOk = ascii4 === 'LASF';
      detectedFormat = magicOk ? 'ASPRS LAS (LASF)' : 'Firma LASF ausente';
    } else if (ext === '.gpkg') {
      const head16 = String.fromCharCode(...b.slice(0, Math.min(16, b.length)));
      magicOk = head16.startsWith('SQLite format 3');
      detectedFormat = magicOk ? 'OGC GeoPackage (SQLite3)' : 'Cabecera SQLite3 ausente';
    } else if (ext === '.geojson' || ext === '.json') {
      const trimmed = new TextDecoder().decode(b.slice(0, 64)).trimStart();
      magicOk = trimmed.startsWith('{') || trimmed.startsWith('[');
      detectedFormat = magicOk ? 'JSON / GeoJSON' : 'Contenido no es JSON';
    } else if (ext === '.kml' || ext === '.gml') {
      const trimmed = new TextDecoder().decode(b.slice(0, 128)).trimStart();
      magicOk = trimmed.startsWith('<');
      detectedFormat = magicOk ? 'XML (KML / GML)' : 'Etiqueta XML inicial ausente';
    } else if (ext === '.dxf') {
      const head = new TextDecoder().decode(b.slice(0, 256)).toUpperCase();
      magicOk = head.includes('SECTION') || head.includes('ENTITIES') || head.includes('HEADER');
      detectedFormat = magicOk ? 'CAD DXF ASCII' : 'Cabecera SECTION de DXF ausente';
    } else {
      const hasNul = b.slice(0, Math.min(256, b.length)).some((v) => v === 0);
      magicOk = !hasNul;
      detectedFormat = magicOk ? `Texto/ASCII (${ext})` : 'Bytes binarios NUL inesperados en archivo ASCII';
    }
  }
  checks.push({
    check: 'Validación de firma binaria (Magic Bytes)',
    passed: magicOk,
    detail: detectedFormat,
  });

  // 5. ZIP Bomb & internal path traversal inspection
  if ((ext === '.zip' || ext === '.kmz') && magicOk) {
    let zipOk = true;
    let zipDetail = 'Archivo comprimido limpio';
    try {
      const zip = await JSZip.loadAsync(params.bytes);
      const entries = Object.values(zip.files);
      if (entries.length > 500) {
        zipOk = false;
        zipDetail = `Demasiadas entradas en ZIP (${entries.length} > 500).`;
      } else {
        let totalUncompressed = 0;
        for (const ent of entries) {
          if (ent.name.includes('..') || ent.name.startsWith('/')) {
            zipOk = false;
            zipDetail = `Entrada peligrosa detectada en ZIP: ${ent.name}`;
            break;
          }
          if (!ent.dir) {
            const buf = await ent.async('uint8array');
            totalUncompressed += buf.byteLength;
          }
        }
        const ratio = totalUncompressed / Math.max(params.bytes.byteLength, 1);
        if (zipOk && (totalUncompressed > 250 * 1024 * 1024 || ratio > 100)) {
          zipOk = false;
          zipDetail = `Posible ZIP Bomb detectada (ratio ${ratio.toFixed(1)}x, descomprimido ${totalUncompressed} bytes).`;
        } else if (zipOk) {
          zipDetail = `${entries.length} entradas verificadas (${totalUncompressed.toLocaleString()} bytes, ratio ${ratio.toFixed(1)}x).`;
        }
      }
    } catch (err: any) {
      zipOk = false;
      zipDetail = `Archivo ZIP corrupto o malformado: ${err?.message || 'error'}`;
    }
    checks.push({
      check: 'Anti-ZIP-Bomb y rutas internas',
      passed: zipOk,
      detail: zipDetail,
    });
  }

  const failedCheck = checks.find((c) => !c.passed);
  return {
    safe: !failedCheck,
    fileName: rawName,
    extension: ext,
    detectedFormat,
    byteSize: params.bytes.byteLength,
    sha256,
    checks,
    blockedReason: failedCheck ? `${failedCheck.check}: ${failedCheck.detail}` : undefined,
  };
}

// =========================================================
// 6. MULTI-LEVEL GEOSPATIAL CACHE (TILES, STATS, RASTERS, META)
// =========================================================

export type CacheNamespace = 'tiles' | 'geometries' | 'stats' | 'rasters' | 'metadata';

interface CacheEntry<T> {
  projectId: string;
  value: T;
  createdAt: number;
}

export class GeospatialCache4 {
  private stores: Record<CacheNamespace, Map<string, CacheEntry<any>>> = {
    tiles: new Map(),
    geometries: new Map(),
    stats: new Map(),
    rasters: new Map(),
    metadata: new Map(),
  };
  private hits = 0;
  private misses = 0;
  private invalidations = 0;
  private maxPerNamespace = 120;

  get<T>(ns: CacheNamespace, key: string): T | null {
    const map = this.stores[ns];
    const entry = map.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    // LRU touch
    map.delete(key);
    map.set(key, entry);
    this.hits++;
    return entry.value as T;
  }

  set<T>(ns: CacheNamespace, key: string, projectId: string, value: T): void {
    const map = this.stores[ns];
    if (map.has(key)) map.delete(key);
    else if (map.size >= this.maxPerNamespace) {
      const oldest = map.keys().next().value;
      if (oldest) map.delete(oldest);
    }
    map.set(key, { projectId, value, createdAt: Date.now() });
  }

  invalidateProject(projectId: string): number {
    let removed = 0;
    (Object.keys(this.stores) as CacheNamespace[]).forEach((ns) => {
      const map = this.stores[ns];
      for (const [k, entry] of map.entries()) {
        if (entry.projectId === projectId) {
          map.delete(k);
          removed++;
        }
      }
    });
    if (removed > 0) this.invalidations++;
    return removed;
  }

  getStats() {
    const byNamespace: Record<CacheNamespace, number> = {
      tiles: this.stores.tiles.size,
      geometries: this.stores.geometries.size,
      stats: this.stores.stats.size,
      rasters: this.stores.rasters.size,
      metadata: this.stores.metadata.size,
    };
    const total = this.hits + this.misses;
    return {
      totalEntries: Object.values(byNamespace).reduce((s, v) => s + v, 0),
      byNamespace,
      hits: this.hits,
      misses: this.misses,
      invalidations: this.invalidations,
      hitRatePct: total > 0 ? Math.round((this.hits / total) * 1000) / 10 : 0,
    };
  }
}

export const globalGeoCache4 = new GeospatialCache4();
