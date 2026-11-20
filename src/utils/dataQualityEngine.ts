import * as turf from '@turf/turf';
import {
  DemGrid,
  GeoFeatureCollection,
  GeotechLidarPoint,
  PrecisionEnvelope,
} from './geotechEngine';
import { buildPrecisionEnvelope } from './geoEngine3';

export type QualitySeverity = 'critico' | 'advertencia' | 'info';

export interface DataQualityIssue {
  code: string;
  severity: QualitySeverity;
  category: 'vector' | 'raster' | 'lidar';
  message: string;
  count: number;
}

export interface VectorQualityReport {
  score: number; // 0..100
  grade: 'A' | 'B' | 'C' | 'D';
  featureCount: number;
  selfIntersections: number;
  emptyOrDegenerate: number;
  duplicateGeometries: number;
  overlapsCount: number;
  gapsSuspected: number;
  multipartCount: number;
  incompleteAttributesCount: number;
  crsOutOfBoundsCount: number;
  issues: DataQualityIssue[];
  precisionEnvelope: PrecisionEnvelope;
}

export interface RasterQualityReport {
  score: number; // 0..100
  grade: 'A' | 'B' | 'C' | 'D';
  totalCells: number;
  noDataCount: number;
  noDataPct: number;
  nanOrInfCount: number;
  outOfRangeCount: number;
  flatConstantRatioPct: number;
  resolutionMismatch: boolean;
  crsMismatch: boolean;
  issues: DataQualityIssue[];
  precisionEnvelope: PrecisionEnvelope;
}

export interface LidarQualityReport {
  score: number; // 0..100
  grade: 'A' | 'B' | 'C' | 'D';
  pointCount: number;
  duplicatePoints: number;
  meanDensityPtsM2: number;
  irregularDensityCvPct: number;
  invalidClassifications: number;
  extremeOutliers: number;
  spatialGapsPct: number;
  issues: DataQualityIssue[];
  precisionEnvelope: PrecisionEnvelope;
}

export interface ConsolidatedGisQualityScore {
  overallScore: number; // 0..100 weighted GIS DATA QUALITY SCORE
  grade: 'A — Excelente' | 'B — Aceptable' | 'C — Requiere Saneamiento' | 'D — Crítico';
  vectorReport?: VectorQualityReport;
  rasterReport?: RasterQualityReport;
  lidarReport?: LidarQualityReport;
  recommendations: string[];
}

function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 55) return 'C';
  return 'D';
}

// =========================================================
// 1. VECTOR DATA QUALITY VALIDATOR
// =========================================================

export function validateVectorDataQuality(
  fc: GeoFeatureCollection,
  layerName: string = 'Capa Vectorial'
): VectorQualityReport {
  const issues: DataQualityIssue[] = [];
  const features = fc.features || [];
  let selfIntersections = 0;
  let emptyOrDegenerate = 0;
  let duplicateGeometries = 0;
  let overlapsCount = 0;
  let gapsSuspected = 0;
  let multipartCount = 0;
  let incompleteAttributesCount = 0;
  let crsOutOfBoundsCount = 0;

  const seenGeoms = new Set<string>();
  const polygons: any[] = [];

  for (const f of features) {
    if (!f || !f.geometry) {
      emptyOrDegenerate++;
      continue;
    }

    const g = f.geometry;
    if (g.type.startsWith('Multi')) multipartCount++;

    // Empty / degenerate checks
    if (g.type === 'Polygon') {
      const ring = g.coordinates[0] || [];
      if (ring.length < 4 || turf.area(f as any) <= 0.01) {
        emptyOrDegenerate++;
      } else {
        polygons.push(f);
      }
      try {
        const kinks = turf.kinks(f as any);
        if (kinks.features.length > 0) selfIntersections += kinks.features.length;
      } catch {
        emptyOrDegenerate++;
      }
    } else if (g.type === 'MultiPolygon') {
      if (!g.coordinates.length || turf.area(f as any) <= 0.01) emptyOrDegenerate++;
      try {
        const kinks = turf.kinks(f as any);
        if (kinks.features.length > 0) selfIntersections += kinks.features.length;
      } catch {
        emptyOrDegenerate++;
      }
    } else if (g.type === 'LineString' && g.coordinates.length < 2) {
      emptyOrDegenerate++;
    }

    // Coordinate range sanity for WGS84 (detects projected coords falsely tagged as 4326)
    const coords = turf.coordAll(f as any);
    const outOfLonLat = coords.some(([x, y]) => Math.abs(x) > 180 || Math.abs(y) > 90 || !Number.isFinite(x) || !Number.isFinite(y));
    if (outOfLonLat) crsOutOfBoundsCount++;

    // Exact duplicate geometry signature
    const sig = `${g.type}:${'coordinates' in g ? JSON.stringify(g.coordinates) : JSON.stringify(g)}`;
    if (seenGeoms.has(sig)) duplicateGeometries++;
    else seenGeoms.add(sig);

    // Incomplete attributes
    const props = f.properties || {};
    const keys = Object.keys(props);
    if (keys.length === 0 || keys.some((k) => props[k] === null || props[k] === undefined || props[k] === '')) {
      incompleteAttributesCount++;
    }
  }

  // Pairwise overlap / gap check (bounded to first 60 polygons for O(N^2) safety)
  const polySample = polygons.slice(0, 60);
  for (let i = 0; i < polySample.length; i++) {
    for (let j = i + 1; j < polySample.length; j++) {
      try {
        if (!turf.booleanDisjoint(polySample[i], polySample[j])) {
          const inter = turf.intersect(turf.featureCollection([polySample[i], polySample[j]]));
          if (inter && turf.area(inter) > 1) overlapsCount++;
        } else {
          // Check small sliver gap between nearly adjacent polygons
          const b1 = turf.bbox(polySample[i]);
          const b2 = turf.bbox(polySample[j]);
          const dx = Math.max(0, Math.max(b1[0] - b2[2], b2[0] - b1[2]));
          const dy = Math.max(0, Math.max(b1[1] - b2[3], b2[1] - b1[3]));
          const approxGapM = Math.hypot(dx, dy) * 111000;
          if (approxGapM > 0.5 && approxGapM < 15) gapsSuspected++;
        }
      } catch {
        // ignore invalid pair
      }
    }
  }

  if (features.length === 0) {
    issues.push({ code: 'VEC-EMPTY', severity: 'critico', category: 'vector', message: 'La capa no contiene entidades.', count: 0 });
  }
  if (selfIntersections > 0) {
    issues.push({ code: 'VEC-KINK', severity: 'critico', category: 'vector', message: 'Auto-intersecciones topológicas detectadas.', count: selfIntersections });
  }
  if (emptyOrDegenerate > 0) {
    issues.push({ code: 'VEC-DEGEN', severity: 'critico', category: 'vector', message: 'Geometrías vacías o polígonos degenerados (área ~0).', count: emptyOrDegenerate });
  }
  if (crsOutOfBoundsCount > 0) {
    issues.push({ code: 'VEC-CRS', severity: 'critico', category: 'vector', message: 'Coordenadas fuera de rango geográfico WGS84 (posible CRS proyectado sin declarar).', count: crsOutOfBoundsCount });
  }
  if (duplicateGeometries > 0) {
    issues.push({ code: 'VEC-DUP', severity: 'advertencia', category: 'vector', message: 'Geometrías exactamente duplicadas.', count: duplicateGeometries });
  }
  if (overlapsCount > 0) {
    issues.push({ code: 'VEC-OVERLAP', severity: 'advertencia', category: 'vector', message: 'Superposición espacial entre polígonos.', count: overlapsCount });
  }
  if (gapsSuspected > 0) {
    issues.push({ code: 'VEC-GAP', severity: 'info', category: 'vector', message: 'Posibles brechas estrechas (< 15 m) entre polígonos adyacentes.', count: gapsSuspected });
  }
  if (incompleteAttributesCount > 0) {
    issues.push({ code: 'VEC-ATTR', severity: 'advertencia', category: 'vector', message: 'Entidades con atributos vacíos o nulos.', count: incompleteAttributesCount });
  }
  if (multipartCount > 0) {
    issues.push({ code: 'VEC-MULTI', severity: 'info', category: 'vector', message: 'Presencia de geometrías Multi* (evaluar si requieren explode).', count: multipartCount });
  }

  let penalty = 0;
  if (features.length === 0) penalty += 70;
  penalty += Math.min(35, selfIntersections * 15);
  penalty += Math.min(30, emptyOrDegenerate * 15);
  penalty += Math.min(35, crsOutOfBoundsCount * 20);
  penalty += Math.min(18, duplicateGeometries * 8);
  penalty += Math.min(15, overlapsCount * 6);
  penalty += Math.min(12, Math.round((incompleteAttributesCount / Math.max(features.length, 1)) * 12));
  penalty += Math.min(6, gapsSuspected * 2);

  const score = Math.max(0, Math.min(100, Math.round((100 - penalty) * 10) / 10));

  return {
    score,
    grade: scoreToGrade(score),
    featureCount: features.length,
    selfIntersections,
    emptyOrDegenerate,
    duplicateGeometries,
    overlapsCount,
    gapsSuspected,
    multipartCount,
    incompleteAttributesCount,
    crsOutOfBoundsCount,
    issues,
    precisionEnvelope: buildPrecisionEnvelope({
      resultSummary: `Calidad Vectorial ${score}/100 (Grado ${scoreToGrade(score)}) sobre ${features.length} entidades`,
      method: 'Motor de Auditoría Topológica & Atributos Vectoriales 3.0',
      crs: 'EPSG:4326',
      resolution: 'Entidad individual',
      units: 'puntaje 0–100',
      sourceData: [layerName],
      estimatedAccuracy: 'Verificación geométrica determinística OGC Simple Features',
      dataKind: 'observado',
    }),
  };
}

// =========================================================
// 2. RASTER DATA QUALITY VALIDATOR
// =========================================================

export function validateRasterDataQuality(
  grid: DemGrid,
  referenceDem?: DemGrid,
  validRange: [number, number] = [-500, 9000]
): RasterQualityReport {
  const issues: DataQualityIssue[] = [];
  const totalCells = grid.values.length;
  let noDataCount = 0;
  let nanOrInfCount = 0;
  let outOfRangeCount = 0;

  let firstValid: number | null = null;
  let sameAsFirst = 0;

  for (let i = 0; i < totalCells; i++) {
    const v = grid.values[i];
    if (!Number.isFinite(v)) {
      nanOrInfCount++;
      continue;
    }
    if (v === grid.noData) {
      noDataCount++;
      continue;
    }
    if (v < validRange[0] || v > validRange[1]) {
      outOfRangeCount++;
    }
    if (firstValid === null) firstValid = v;
    if (Math.abs(v - firstValid) < 1e-6) sameAsFirst++;
  }

  const noDataPct = Math.round((noDataCount / Math.max(totalCells, 1)) * 1000) / 10;
  const flatConstantRatioPct = Math.round((sameAsFirst / Math.max(totalCells, 1)) * 1000) / 10;
  const resolutionMismatch = Boolean(referenceDem && Math.abs(grid.cellSizeMeters - referenceDem.cellSizeMeters) > 1);
  const crsMismatch = Boolean(referenceDem && grid.crs !== referenceDem.crs);

  if (nanOrInfCount > 0) {
    issues.push({ code: 'RAS-NAN', severity: 'critico', category: 'raster', message: 'Píxeles corruptos (NaN/Infinity) presentes en la matriz.', count: nanOrInfCount });
  }
  if (noDataPct > 10) {
    issues.push({ code: 'RAS-NODATA', severity: 'advertencia', category: 'raster', message: `Proporción elevada de celdas NoData (${noDataPct}%).`, count: noDataCount });
  }
  if (outOfRangeCount > 0) {
    issues.push({ code: 'RAS-RANGE', severity: 'advertencia', category: 'raster', message: `Valores fuera del rango físico esperado [${validRange[0]}, ${validRange[1]}].`, count: outOfRangeCount });
  }
  if (flatConstantRatioPct > 95 && totalCells > 16) {
    issues.push({ code: 'RAS-FLAT', severity: 'advertencia', category: 'raster', message: 'Superficie prácticamente constante sin varianza espacial.', count: sameAsFirst });
  }
  if (resolutionMismatch) {
    issues.push({ code: 'RAS-RES', severity: 'info', category: 'raster', message: `Resolución (${grid.cellSizeMeters}m) difiere del DEM base (${referenceDem?.cellSizeMeters}m).`, count: 1 });
  }
  if (crsMismatch) {
    issues.push({ code: 'RAS-CRS', severity: 'critico', category: 'raster', message: `CRS del ráster (${grid.crs}) no coincide con el proyecto (${referenceDem?.crs}).`, count: 1 });
  }

  let penalty = 0;
  if (totalCells === 0) penalty += 80;
  penalty += Math.min(45, Math.ceil((nanOrInfCount / Math.max(totalCells, 1)) * 200));
  penalty += Math.min(25, noDataPct * 0.5);
  penalty += Math.min(20, Math.ceil((outOfRangeCount / Math.max(totalCells, 1)) * 100));
  if (crsMismatch) penalty += 15;
  if (resolutionMismatch) penalty += 5;
  if (flatConstantRatioPct > 95 && totalCells > 16) penalty += 10;

  const score = Math.max(0, Math.min(100, Math.round((100 - penalty) * 10) / 10));

  return {
    score,
    grade: scoreToGrade(score),
    totalCells,
    noDataCount,
    noDataPct,
    nanOrInfCount,
    outOfRangeCount,
    flatConstantRatioPct,
    resolutionMismatch,
    crsMismatch,
    issues,
    precisionEnvelope: buildPrecisionEnvelope({
      resultSummary: `Calidad Ráster ${score}/100 (Grado ${scoreToGrade(score)}) · ${grid.cols}×${grid.rows}`,
      method: 'Auditoría Numérica de Matriz Ráster 3.0',
      crs: grid.crs,
      resolution: `${grid.cellSizeMeters} m`,
      units: grid.unit,
      sourceData: [grid.name],
      estimatedAccuracy: 'Inspección exacta celda a celda',
      dataKind: 'observado',
    }),
  };
}

// =========================================================
// 3. LIDAR POINT CLOUD QUALITY VALIDATOR
// =========================================================

export function validateLidarDataQuality(
  points: GeotechLidarPoint[],
  bounds: [number, number, number, number]
): LidarQualityReport {
  const issues: DataQualityIssue[] = [];
  const count = points.length;
  const seen = new Set<string>();
  let duplicatePoints = 0;
  let invalidClassifications = 0;
  let extremeOutliers = 0;

  const zVals = points.map((p) => p.z).filter((z) => Number.isFinite(z));
  const meanZ = zVals.reduce((s, z) => s + z, 0) / Math.max(zVals.length, 1);
  const stdZ = Math.sqrt(zVals.reduce((s, z) => s + (z - meanZ) ** 2, 0) / Math.max(zVals.length, 1));

  // 10x10 density grid for gap & CV inspection
  const cells = new Array<number>(100).fill(0);
  const [minLng, minLat, maxLng, maxLat] = bounds;

  for (const p of points) {
    const key = `${p.lng.toFixed(6)}_${p.lat.toFixed(6)}_${p.z.toFixed(2)}`;
    if (seen.has(key)) duplicatePoints++;
    else seen.add(key);

    if (![1, 2, 3, 4, 5, 6, 7].includes(p.classification)) invalidClassifications++;
    if (stdZ > 0 && Math.abs(p.z - meanZ) > stdZ * 4.5) extremeOutliers++;

    const c = Math.max(0, Math.min(9, Math.floor(((p.lng - minLng) / Math.max(maxLng - minLng, 1e-9)) * 10)));
    const r = Math.max(0, Math.min(9, Math.floor(((maxLat - p.lat) / Math.max(maxLat - minLat, 1e-9)) * 10)));
    cells[r * 10 + c]++;
  }

  const widthM = turf.distance([minLng, (minLat + maxLat) / 2], [maxLng, (minLat + maxLat) / 2], { units: 'meters' });
  const heightM = turf.distance([(minLng + maxLng) / 2, minLat], [(minLng + maxLng) / 2, maxLat], { units: 'meters' });
  const areaM2 = Math.max(100, widthM * heightM);
  const meanDensityPtsM2 = Math.round((count / areaM2) * 10000) / 10000;

  const emptyCells = cells.filter((c) => c === 0).length;
  const spatialGapsPct = count > 0 ? Math.round((emptyCells / 100) * 1000) / 10 : 100;
  const meanCell = count / 100;
  const cellStd = Math.sqrt(cells.reduce((s, c) => s + (c - meanCell) ** 2, 0) / 100);
  const irregularDensityCvPct = meanCell > 0 ? Math.round((cellStd / meanCell) * 1000) / 10 : 100;

  if (count === 0) issues.push({ code: 'LID-EMPTY', severity: 'critico', category: 'lidar', message: 'Nube de puntos vacía.', count: 0 });
  if (duplicatePoints > 0) issues.push({ code: 'LID-DUP', severity: 'advertencia', category: 'lidar', message: 'Puntos duplicados en coordenadas XYZ.', count: duplicatePoints });
  if (invalidClassifications > 0) issues.push({ code: 'LID-CLS', severity: 'advertencia', category: 'lidar', message: 'Clasificaciones fuera de catálogo ASPRS (1–7).', count: invalidClassifications });
  if (extremeOutliers > 0) issues.push({ code: 'LID-OUT', severity: 'advertencia', category: 'lidar', message: 'Outliers altimétricos (> 4.5σ) detectados.', count: extremeOutliers });
  if (spatialGapsPct > 20) issues.push({ code: 'LID-GAP', severity: 'advertencia', category: 'lidar', message: `Huecos espaciales sin retorno en ${spatialGapsPct}% de celdas.`, count: emptyCells });

  let penalty = 0;
  if (count === 0) penalty += 75;
  penalty += Math.min(20, Math.round((duplicatePoints / Math.max(count, 1)) * 100));
  penalty += Math.min(20, invalidClassifications * 2);
  penalty += Math.min(18, extremeOutliers * 3);
  penalty += Math.min(20, spatialGapsPct * 0.4);
  if (irregularDensityCvPct > 85) penalty += 8;

  const score = Math.max(0, Math.min(100, Math.round((100 - penalty) * 10) / 10));

  return {
    score,
    grade: scoreToGrade(score),
    pointCount: count,
    duplicatePoints,
    meanDensityPtsM2,
    irregularDensityCvPct,
    invalidClassifications,
    extremeOutliers,
    spatialGapsPct,
    issues,
    precisionEnvelope: buildPrecisionEnvelope({
      resultSummary: `Calidad LiDAR ${score}/100 (Grado ${scoreToGrade(score)}) · ${count.toLocaleString()} pts`,
      method: 'Auditoría ASPRS / Densidad Espacial & Outliers LiDAR 3.0',
      crs: 'EPSG:4326',
      resolution: `${meanDensityPtsM2} pts/m²`,
      units: 'puntaje 0–100',
      sourceData: [`Nube LiDAR (${count} puntos)`],
      estimatedAccuracy: `CV densidad ${irregularDensityCvPct}%, huecos ${spatialGapsPct}%`,
      dataKind: 'observado',
    }),
  };
}

// =========================================================
// 4. CONSOLIDATED GIS DATA QUALITY SCORE
// =========================================================

export function computeConsolidatedQualityScore(params: {
  vectorLayer?: { name: string; geojson: GeoFeatureCollection };
  rasterGrid?: DemGrid;
  referenceDem?: DemGrid;
  lidarPoints?: GeotechLidarPoint[];
}): ConsolidatedGisQualityScore {
  const vectorReport = params.vectorLayer
    ? validateVectorDataQuality(params.vectorLayer.geojson, params.vectorLayer.name)
    : undefined;
  const rasterReport = params.rasterGrid
    ? validateRasterDataQuality(params.rasterGrid, params.referenceDem)
    : undefined;
  const lidarReport =
    params.lidarPoints && params.rasterGrid
      ? validateLidarDataQuality(params.lidarPoints, params.rasterGrid.bounds)
      : undefined;

  const parts: number[] = [];
  if (vectorReport) parts.push(vectorReport.score);
  if (rasterReport) parts.push(rasterReport.score);
  if (lidarReport) parts.push(lidarReport.score);

  const overallScore = parts.length
    ? Math.round((parts.reduce((s, x) => s + x, 0) / parts.length) * 10) / 10
    : 0;

  const grade: ConsolidatedGisQualityScore['grade'] =
    overallScore >= 90
      ? 'A — Excelente'
      : overallScore >= 75
      ? 'B — Aceptable'
      : overallScore >= 55
      ? 'C — Requiere Saneamiento'
      : 'D — Crítico';

  const recommendations: string[] = [];
  if (vectorReport && vectorReport.selfIntersections > 0) {
    recommendations.push('Ejecutar limpieza geométrica (buffer 0 / saneamiento topológico) sobre polígonos con auto-intersección.');
  }
  if (vectorReport && vectorReport.duplicateGeometries > 0) {
    recommendations.push('Eliminar entidades geométricas duplicadas antes de cálculos de área o Spatial Join.');
  }
  if (rasterReport && rasterReport.nanOrInfCount > 0) {
    recommendations.push('Reemplazar píxeles NaN/Inf mediante interpolación de vecindad antes de cálculo hidrológico D8.');
  }
  if (lidarReport && lidarReport.extremeOutliers > 0) {
    recommendations.push('Aplicar filtro estadístico SOR (Statistical Outlier Removal) en Laboratorio LiDAR 3D.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Integridad geométrica y radiométrica verificada: datos aptos para modelamiento técnico.');
  }

  return {
    overallScore,
    grade,
    vectorReport,
    rasterReport,
    lidarReport,
    recommendations,
  };
}
