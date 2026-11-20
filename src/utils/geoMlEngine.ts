import { DemGrid, GeoMlSavedModel, PrecisionEnvelope, SpectralScene } from './geotechEngine';
import { buildPrecisionEnvelope } from './geoEngine3';
import { deriveDefaultTrainingRois } from './spectralEngine2';

// =========================================================
// FEATURE EXTRACTION FROM SPECTRAL SCENES
// =========================================================

export function extractSpectralFeatureVector(scene: SpectralScene, slot: 't1' | 't2', px: number): number[] {
  const b = scene[slot];
  const blue = b.blue[px];
  const green = b.green[px];
  const red = b.red[px];
  const nir = b.nir[px];
  const swir1 = b.swir1[px];
  const swir2 = b.swir2[px];
  const ndvi = (nir - red) / Math.max(nir + red, 1e-6);
  const ndwi = (green - nir) / Math.max(green + nir, 1e-6);
  const ndbi = (swir1 - nir) / Math.max(swir1 + nir, 1e-6);
  return [blue, green, red, nir, swir1, swir2, ndvi, ndwi, ndbi];
}

export const GEOML_FEATURE_NAMES = ['Blue', 'Green', 'Red', 'NIR', 'SWIR1', 'SWIR2', 'NDVI', 'NDWI', 'NDBI'];

// =========================================================
// 1. DECISION TREE (CART GINI IMPURITY)
// =========================================================

interface TreeNode {
  leafClass?: number;
  featureIdx?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

function giniImpurity(labels: number[], numClasses: number): number {
  if (labels.length === 0) return 0;
  const counts = new Array<number>(numClasses).fill(0);
  for (const l of labels) counts[l]++;
  let sumSq = 0;
  for (const c of counts) {
    const p = c / labels.length;
    sumSq += p * p;
  }
  return 1 - sumSq;
}

function majorityClass(labels: number[], numClasses: number): number {
  const counts = new Array<number>(numClasses).fill(0);
  for (const l of labels) counts[l]++;
  let best = 0;
  for (let c = 1; c < numClasses; c++) if (counts[c] > counts[best]) best = c;
  return best;
}

function buildCartTree(
  X: number[][],
  y: number[],
  numClasses: number,
  maxDepth: number,
  minSamples: number,
  featureSubset?: number[],
  depth: number = 0
): TreeNode {
  if (y.length === 0) return { leafClass: 0 };
  const first = y[0];
  if (y.every((v) => v === first) || depth >= maxDepth || y.length < minSamples) {
    return { leafClass: majorityClass(y, numClasses) };
  }

  const featCandidates = featureSubset || Array.from({ length: X[0].length }, (_, i) => i);
  let bestGain = 0;
  let bestFeat = -1;
  let bestThresh = 0;
  const parentGini = giniImpurity(y, numClasses);

  for (const fIdx of featCandidates) {
    const vals = X.map((row) => row[fIdx]).sort((a, b) => a - b);
    // Test 6 quantile thresholds for speed and generalization
    for (let q = 1; q <= 5; q++) {
      const thresh = vals[Math.floor((q / 6) * (vals.length - 1))];
      const leftY: number[] = [];
      const rightY: number[] = [];
      for (let i = 0; i < X.length; i++) {
        if (X[i][fIdx] <= thresh) leftY.push(y[i]);
        else rightY.push(y[i]);
      }
      if (leftY.length === 0 || rightY.length === 0) continue;
      const weighted = (leftY.length / y.length) * giniImpurity(leftY, numClasses) + (rightY.length / y.length) * giniImpurity(rightY, numClasses);
      const gain = parentGini - weighted;
      if (gain > bestGain) {
        bestGain = gain;
        bestFeat = fIdx;
        bestThresh = thresh;
      }
    }
  }

  if (bestFeat === -1 || bestGain <= 1e-6) {
    return { leafClass: majorityClass(y, numClasses) };
  }

  const leftX: number[][] = [];
  const leftY: number[] = [];
  const rightX: number[][] = [];
  const rightY: number[] = [];
  for (let i = 0; i < X.length; i++) {
    if (X[i][bestFeat] <= bestThresh) {
      leftX.push(X[i]);
      leftY.push(y[i]);
    } else {
      rightX.push(X[i]);
      rightY.push(y[i]);
    }
  }

  return {
    featureIdx: bestFeat,
    threshold: bestThresh,
    left: buildCartTree(leftX, leftY, numClasses, maxDepth, minSamples, featureSubset, depth + 1),
    right: buildCartTree(rightX, rightY, numClasses, maxDepth, minSamples, featureSubset, depth + 1),
  };
}

function predictTree(node: TreeNode, x: number[]): number {
  if (node.leafClass !== undefined) return node.leafClass;
  if (x[node.featureIdx!] <= node.threshold!) return predictTree(node.left!, x);
  return predictTree(node.right!, x);
}

// Deterministic PRNG for reproducible Random Forest bagging
function createPrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// =========================================================
// 2. LINEAR / RBF SVM (ONE-VS-REST GRADIENT HINGE LOSS)
// =========================================================

interface SvmModel {
  weights: number[][];
  biases: number[];
}

function trainMultiClassSvm(X: number[][], y: number[], numClasses: number, epochs: number = 60): SvmModel {
  const dim = X[0].length;
  const weights: number[][] = Array.from({ length: numClasses }, () => new Array<number>(dim).fill(0));
  const biases = new Array<number>(numClasses).fill(0);
  const lr = 0.08;
  const reg = 0.005;

  for (let c = 0; c < numClasses; c++) {
    const w = weights[c];
    let b = 0;
    for (let ep = 0; ep < epochs; ep++) {
      for (let i = 0; i < X.length; i++) {
        const yi = y[i] === c ? 1 : -1;
        let dot = b;
        for (let j = 0; j < dim; j++) dot += w[j] * X[i][j];
        if (yi * dot < 1) {
          for (let j = 0; j < dim; j++) w[j] = w[j] * (1 - lr * reg) + lr * yi * X[i][j];
          b += lr * yi;
        } else {
          for (let j = 0; j < dim; j++) w[j] = w[j] * (1 - lr * reg);
        }
      }
    }
    biases[c] = b;
  }
  return { weights, biases };
}

function predictMultiClassSvm(model: SvmModel, x: number[]): number {
  let bestC = 0;
  let bestScore = -Infinity;
  for (let c = 0; c < model.weights.length; c++) {
    let score = model.biases[c];
    const w = model.weights[c];
    for (let j = 0; j < x.length; j++) score += w[j] * x[j];
    if (score > bestScore) {
      bestScore = score;
      bestC = c;
    }
  }
  return bestC;
}

// =========================================================
// 3. CLASSIFICATION EVALUATION & WORKFLOW EXECUTION
// =========================================================

export interface GeoMlClassificationResult {
  algorithm: 'random_forest' | 'svm' | 'decision_tree';
  predictedGrid: DemGrid;
  classLabels: string[];
  metrics: {
    accuracyPct: number;
    precisionPct: number;
    recallPct: number;
    f1Pct: number;
    kappa: number;
    confusionMatrix: number[][];
  };
  sampleCount: number;
  validationSampleCount: number;
  savedModel: GeoMlSavedModel;
  precisionEnvelope: PrecisionEnvelope;
}

export function runGeoMlClassification(
  scene: SpectralScene,
  dateSlot: 't1' | 't2',
  algorithm: 'random_forest' | 'svm' | 'decision_tree',
  trainedBy: string = 'GeoML Engine 3.0'
): GeoMlClassificationResult {
  const rois = deriveDefaultTrainingRois(scene, dateSlot).filter((r) => r.pixels.length >= 2);
  const numClasses = rois.length;
  const classLabels = rois.map((r) => r.label);

  const trainX: number[][] = [];
  const trainY: number[] = [];
  const valX: number[][] = [];
  const valY: number[] = [];

  rois.forEach((roi, clsIdx) => {
    roi.pixels.forEach((px, pos) => {
      const feat = extractSpectralFeatureVector(scene, dateSlot, px);
      if (pos % 2 === 0) {
        trainX.push(feat);
        trainY.push(clsIdx);
      } else {
        valX.push(feat);
        valY.push(clsIdx);
      }
    });
  });

  if (trainX.length < 4 || valX.length < 2) {
    throw new Error('Muestras insuficientes en las clases ROI para entrenar y validar GeoML.');
  }

  let predictFn: (x: number[]) => number;
  let paramsUsed: Record<string, any> = {};

  if (algorithm === 'decision_tree') {
    const tree = buildCartTree(trainX, trainY, numClasses, 6, 3);
    predictFn = (x) => predictTree(tree, x);
    paramsUsed = { maxDepth: 6, minSamplesSplit: 3, criterion: 'gini' };
  } else if (algorithm === 'random_forest') {
    const rand = createPrng(20261118);
    const treesCount = 11;
    const forest: TreeNode[] = [];
    for (let t = 0; t < treesCount; t++) {
      const bagX: number[][] = [];
      const bagY: number[] = [];
      for (let i = 0; i < trainX.length; i++) {
        const idx = Math.floor(rand() * trainX.length);
        bagX.push(trainX[idx]);
        bagY.push(trainY[idx]);
      }
      const featSubset = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(() => rand() > 0.35);
      forest.push(buildCartTree(bagX, bagY, numClasses, 5, 2, featSubset.length >= 3 ? featSubset : [3, 6, 7, 8]));
    }
    predictFn = (x) => {
      const votes = new Array<number>(numClasses).fill(0);
      for (const tr of forest) votes[predictTree(tr, x)]++;
      let best = 0;
      for (let c = 1; c < numClasses; c++) if (votes[c] > votes[best]) best = c;
      return best;
    };
    paramsUsed = { nEstimators: treesCount, maxDepth: 5, bootstrap: true };
  } else {
    const svm = trainMultiClassSvm(trainX, trainY, numClasses, 65);
    predictFn = (x) => predictMultiClassSvm(svm, x);
    paramsUsed = { kernel: 'linear_ovr', epochs: 65, regularization: 0.005 };
  }

  // Evaluate holdout validation set
  const cm: number[][] = Array.from({ length: numClasses }, () => new Array<number>(numClasses).fill(0));
  let correct = 0;
  for (let i = 0; i < valX.length; i++) {
    const pred = predictFn(valX[i]);
    const ref = valY[i];
    cm[ref][pred]++;
    if (pred === ref) correct++;
  }

  const accuracyPct = Math.round((correct / valX.length) * 1000) / 10;

  let macroPrecision = 0;
  let macroRecall = 0;
  let expectedRandom = 0;
  for (let c = 0; c < numClasses; c++) {
    const tp = cm[c][c];
    const rowSum = cm[c].reduce((s, v) => s + v, 0);
    let colSum = 0;
    for (let r = 0; r < numClasses; r++) colSum += cm[r][c];
    macroRecall += rowSum > 0 ? tp / rowSum : 0;
    macroPrecision += colSum > 0 ? tp / colSum : 0;
    expectedRandom += (rowSum * colSum) / (valX.length * valX.length);
  }
  const precisionPct = Math.round((macroPrecision / numClasses) * 1000) / 10;
  const recallPct = Math.round((macroRecall / numClasses) * 1000) / 10;
  const pDec = precisionPct / 100;
  const rDec = recallPct / 100;
  const f1Pct = pDec + rDec > 0 ? Math.round(((2 * pDec * rDec) / (pDec + rDec)) * 1000) / 10 : 0;
  const accDec = correct / valX.length;
  const kappa = expectedRandom < 1 ? Math.round(((accDec - expectedRandom) / (1 - expectedRandom)) * 1000) / 1000 : 1;

  // Predict full grid
  const n = scene.rows * scene.cols;
  const gridVals = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    gridVals[i] = predictFn(extractSpectralFeatureVector(scene, dateSlot, i));
  }

  const algoTitle =
    algorithm === 'random_forest' ? 'Random Forest (11 árboles)' : algorithm === 'svm' ? 'SVM Multi-Clase (OVR)' : 'Decision Tree (CART Gini)';

  const savedModel: GeoMlSavedModel = {
    id: `gml-${algorithm}-${Date.now()}`,
    name: `${algoTitle} — Cobertura ${scene[dateSlot].date}`,
    algorithm,
    targetTask: 'Clasificación de Cobertura Terrestre (Predicción ML)',
    createdAt: new Date().toISOString(),
    trainedBy,
    sampleCount: trainX.length + valX.length,
    featureNames: GEOML_FEATURE_NAMES,
    metrics: { accuracyPct, precisionPct, recallPct, f1Pct, kappa, confusionMatrix: cm },
    classLabels,
    params: paramsUsed,
    isPredictionWarning: 'PREDICCIÓN ML: Modelo entrenado sobre ROI espectrales; no equivale a verificación de campo 100%.',
  };

  return {
    algorithm,
    predictedGrid: {
      id: `gml-grid-${algorithm}-${Date.now()}`,
      name: `Predicción ML (${algoTitle}) — ${scene[dateSlot].date}`,
      cols: scene.cols,
      rows: scene.rows,
      cellSizeMeters: scene.cellSizeMeters,
      bounds: scene.bounds,
      crs: scene.crs,
      noData: -9999,
      unit: 'clase ML',
      values: gridVals,
      colorScale: 'classes',
      classLabels,
    },
    classLabels,
    metrics: { accuracyPct, precisionPct, recallPct, f1Pct, kappa, confusionMatrix: cm },
    sampleCount: trainX.length,
    validationSampleCount: valX.length,
    savedModel,
    precisionEnvelope: buildPrecisionEnvelope({
      resultSummary: `${algoTitle}: Accuracy ${accuracyPct}%, F1 ${f1Pct}%, Kappa ${kappa}`,
      method: `GeoML ${algoTitle} (Holdout Validation 50/50)`,
      crs: scene.crs,
      resolution: `${scene.cellSizeMeters} m`,
      units: 'clase espectral (0..k)',
      sourceData: [scene.name, `${scene[dateSlot].sensor} (${scene[dateSlot].date})`],
      estimatedAccuracy: `Accuracy ${accuracyPct}%, Precision ${precisionPct}%, Recall ${recallPct}%, F1 ${f1Pct}%`,
      dataKind: 'prediccion_ml',
    }),
  };
}

// =========================================================
// 4. SPATIAL REGRESSION & ANOMALY DETECTION & SEGMENTATION
// =========================================================

export interface SpatialRegressionResult {
  predictedGrid: DemGrid;
  slopeCoeff: number;
  intercept: number;
  rmse: number;
  mae: number;
  r2: number;
  savedModel: GeoMlSavedModel;
  precisionEnvelope: PrecisionEnvelope;
}

export function runDemVsNdviSpatialRegression(
  dem: DemGrid,
  scene: SpectralScene,
  dateSlot: 't1' | 't2',
  trainedBy: string = 'GeoML Engine 3.0'
): SpatialRegressionResult {
  const b = scene[dateSlot];
  const n = Math.min(dem.values.length, b.nir.length);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const elev = dem.values[i];
    const ndvi = (b.nir[i] - b.red[i]) / Math.max(b.nir[i] + b.red[i], 1e-6);
    if (Number.isFinite(elev) && Number.isFinite(ndvi)) {
      xs.push(elev);
      ys.push(ndvi);
    }
  }

  const meanX = xs.reduce((s, v) => s + v, 0) / Math.max(xs.length, 1);
  const meanY = ys.reduce((s, v) => s + v, 0) / Math.max(ys.length, 1);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slopeCoeff = den > 1e-9 ? num / den : 0;
  const intercept = meanY - slopeCoeff * meanX;

  let sse = 0;
  let sae = 0;
  let sst = 0;
  const predVals = new Array<number>(dem.values.length);
  for (let i = 0; i < n; i++) {
    const pred = intercept + slopeCoeff * xs[i];
    predVals[i] = Math.round(pred * 1000) / 1000;
    const err = ys[i] - pred;
    sse += err * err;
    sae += Math.abs(err);
    sst += (ys[i] - meanY) ** 2;
  }

  const rmse = Math.round(Math.sqrt(sse / Math.max(n, 1)) * 1000) / 1000;
  const mae = Math.round((sae / Math.max(n, 1)) * 1000) / 1000;
  const r2 = sst > 1e-9 ? Math.max(0, Math.round((1 - sse / sst) * 1000) / 1000) : 0;

  const savedModel: GeoMlSavedModel = {
    id: `gml-reg-${Date.now()}`,
    name: `Regresión Espacial Elevación → NDVI (${b.date})`,
    algorithm: 'linear_regression',
    targetTask: 'Predicción de Vigor Vegetal según Gradiente Altitudinal',
    createdAt: new Date().toISOString(),
    trainedBy,
    sampleCount: n,
    featureNames: ['Elevación DEM (msnm)'],
    metrics: { rmse, mae, r2 },
    params: { slopeCoeff: Math.round(slopeCoeff * 100000) / 100000, intercept: Math.round(intercept * 10000) / 10000 },
    isPredictionWarning: 'PREDICCIÓN ML (Regresión OLS): correlación estadística, no relación causal absoluta.',
  };

  return {
    predictedGrid: {
      ...dem,
      id: `reg-ndvi-${Date.now()}`,
      name: `Predicción ML NDVI(Elevación) R²=${r2}`,
      unit: 'NDVI predicho',
      values: predVals,
      colorScale: 'ndvi',
    },
    slopeCoeff: savedModel.params.slopeCoeff,
    intercept: savedModel.params.intercept,
    rmse,
    mae,
    r2,
    savedModel,
    precisionEnvelope: buildPrecisionEnvelope({
      resultSummary: `Regresión OLS DEM→NDVI: RMSE=${rmse}, MAE=${mae}, R²=${r2}`,
      method: 'Ordinary Least Squares Spatial Regression',
      crs: dem.crs,
      resolution: `${dem.cellSizeMeters} m`,
      units: 'NDVI predicho',
      sourceData: [dem.name, scene.name],
      estimatedAccuracy: `RMSE=${rmse}, MAE=${mae}, R²=${r2}`,
      dataKind: 'prediccion_ml',
    }),
  };
}

export function detectRasterAnomalies(grid: DemGrid, zThreshold: number = 2.0): {
  anomalyGrid: DemGrid;
  anomalyCount: number;
  anomalyPct: number;
  mean: number;
  stdDev: number;
  precisionEnvelope: PrecisionEnvelope;
} {
  const valid = grid.values.filter((v) => Number.isFinite(v) && v !== grid.noData);
  const mean = valid.reduce((s, v) => s + v, 0) / Math.max(valid.length, 1);
  const stdDev = Math.sqrt(valid.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(valid.length, 1));
  let anomalyCount = 0;

  const vals = grid.values.map((v) => {
    if (!Number.isFinite(v) || v === grid.noData || stdDev <= 1e-9) return 0;
    const z = Math.abs(v - mean) / stdDev;
    if (z >= zThreshold) {
      anomalyCount++;
      return 1;
    }
    return 0;
  });

  const anomalyPct = Math.round((anomalyCount / Math.max(grid.values.length, 1)) * 1000) / 10;

  return {
    anomalyGrid: {
      ...grid,
      id: `anom-${Date.now()}`,
      name: `Detección de Anomalías (|Z| >= ${zThreshold}) — ${grid.name}`,
      unit: 'anomalía',
      values: vals,
      colorScale: 'classes',
      classLabels: ['Normal (0)', `Anomalía |Z|>=${zThreshold} (1)`],
    },
    anomalyCount,
    anomalyPct,
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    precisionEnvelope: buildPrecisionEnvelope({
      resultSummary: `${anomalyCount} celdas anómalas (${anomalyPct}% del dominio) con |Z| >= ${zThreshold}`,
      method: 'Detección de Anomalías Estadísticas Z-Score Espacial',
      crs: grid.crs,
      resolution: `${grid.cellSizeMeters} m`,
      units: 'clase binaria (0/1)',
      sourceData: [grid.name],
      estimatedAccuracy: `μ=${Math.round(mean * 100) / 100}, σ=${Math.round(stdDev * 100) / 100}`,
      dataKind: 'prediccion_ml',
    }),
  };
}

// =========================================================
// 5. REGION-GROWING SEGMENTATION & THEMATIC WORKFLOWS
// =========================================================

export type ThematicRemoteSensingWorkflow =
  | 'deforestation'
  | 'wildfire'
  | 'agriculture'
  | 'water_bodies'
  | 'urbanization'
  | 'soil_moisture';

export function runImageSegmentation(
  scene: SpectralScene,
  slot: 't1' | 't2',
  similarityThreshold: number = 0.085
): {
  segmentGrid: DemGrid;
  segmentCount: number;
  meanSegmentSizeCells: number;
  precisionEnvelope: PrecisionEnvelope;
} {
  const rows = scene.rows;
  const cols = scene.cols;
  const n = rows * cols;
  const b = scene[slot];
  const labels = new Int32Array(n).fill(-1);
  let currentId = 0;
  const dr = [-1, 1, 0, 0];
  const dc = [0, 0, -1, 1];

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1) continue;
    const queue = [i];
    labels[i] = currentId;
    const seedR = b.red[i];
    const seedG = b.green[i];
    const seedN = b.nir[i];

    while (queue.length > 0) {
      const cur = queue.pop()!;
      const r = Math.floor(cur / cols);
      const c = cur % cols;
      for (let k = 0; k < 4; k++) {
        const nr = r + dr[k];
        const nc = c + dc[k];
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const ni = nr * cols + nc;
        if (labels[ni] !== -1) continue;
        const dist = Math.hypot(b.red[ni] - seedR, b.green[ni] - seedG, b.nir[ni] - seedN);
        if (dist <= similarityThreshold) {
          labels[ni] = currentId;
          queue.push(ni);
        }
      }
    }
    currentId++;
  }

  return {
    segmentGrid: {
      id: `seg-${slot}-${Date.now()}`,
      name: `Segmentación de Objetos Espectrales (${currentId} objetos · ${b.date})`,
      cols,
      rows,
      cellSizeMeters: scene.cellSizeMeters,
      bounds: scene.bounds,
      crs: scene.crs,
      noData: -9999,
      unit: 'objeto_id',
      values: Array.from(labels),
      colorScale: 'classes',
    },
    segmentCount: currentId,
    meanSegmentSizeCells: Math.round((n / Math.max(currentId, 1)) * 10) / 10,
    precisionEnvelope: buildPrecisionEnvelope({
      resultSummary: `${currentId} segmentos homogéneos extraídos (umbral espectral ${similarityThreshold})`,
      method: 'Region-Growing Object Segmentation (4-conectividad espectral)',
      crs: scene.crs,
      resolution: `${scene.cellSizeMeters} m`,
      units: 'ID de objeto',
      sourceData: [scene.name],
      estimatedAccuracy: 'Segmentación espectral sin suavizado morfológico externo',
      dataKind: 'modelo_analitico',
    }),
  };
}

export function runThematicRemoteSensingWorkflow(
  scene: SpectralScene,
  workflow: ThematicRemoteSensingWorkflow
): {
  title: string;
  resultGrid: DemGrid;
  affectedHa: number;
  affectedPct: number;
  findingSummary: string;
  precisionEnvelope: PrecisionEnvelope;
} {
  const n = scene.rows * scene.cols;
  const cellHa = (scene.cellSizeMeters * scene.cellSizeMeters) / 10000;
  const out = new Array<number>(n);
  let positive = 0;

  let title = '';
  let labels: [string, string] = ['Sin cambio / Normal', 'Detectado'];
  let method = '';

  for (let i = 0; i < n; i++) {
    const ndvi1 = (scene.t1.nir[i] - scene.t1.red[i]) / Math.max(scene.t1.nir[i] + scene.t1.red[i], 1e-6);
    const ndvi2 = (scene.t2.nir[i] - scene.t2.red[i]) / Math.max(scene.t2.nir[i] + scene.t2.red[i], 1e-6);
    const nbr1 = (scene.t1.nir[i] - scene.t1.swir2[i]) / Math.max(scene.t1.nir[i] + scene.t1.swir2[i], 1e-6);
    const nbr2 = (scene.t2.nir[i] - scene.t2.swir2[i]) / Math.max(scene.t2.nir[i] + scene.t2.swir2[i], 1e-6);
    const ndwi2 = (scene.t2.green[i] - scene.t2.nir[i]) / Math.max(scene.t2.green[i] + scene.t2.nir[i], 1e-6);
    const ndbi1 = (scene.t1.swir1[i] - scene.t1.nir[i]) / Math.max(scene.t1.swir1[i] + scene.t1.nir[i], 1e-6);
    const ndbi2 = (scene.t2.swir1[i] - scene.t2.nir[i]) / Math.max(scene.t2.swir1[i] + scene.t2.nir[i], 1e-6);
    const ndmi2 = (scene.t2.nir[i] - scene.t2.swir1[i]) / Math.max(scene.t2.nir[i] + scene.t2.swir1[i], 1e-6);

    let flag = 0;
    if (workflow === 'deforestation') {
      title = 'Detección de Deforestación / Pérdida Vegetal (ΔNDVI)';
      labels = ['Cobertura Estable', 'Pérdida de Cobertura Vegetal'];
      method = 'Multi-temporal ΔNDVI (T2 - T1 <= -0.22)';
      if (ndvi1 >= 0.45 && ndvi2 - ndvi1 <= -0.22) flag = 1;
    } else if (workflow === 'wildfire') {
      title = 'Severidad de Incendios (dNBR)';
      labels = ['No Quemado', 'Cicatríz / Severidad Térmica'];
      method = 'Normalized Burn Ratio Differential (dNBR = NBR_t1 - NBR_t2 >= 0.25)';
      if (nbr1 - nbr2 >= 0.25) flag = 1;
    } else if (workflow === 'agriculture') {
      title = 'Zonificación de Vigor Agrícola & Vegetación Activa';
      labels = ['No Vegetal / Suelo', 'Cultivo / Vigor Activo'];
      method = 'Umbral NDVI >= 0.35 en T2';
      if (ndvi2 >= 0.35) flag = 1;
    } else if (workflow === 'water_bodies') {
      title = 'Delimitación de Cuerpos de Agua Superficial (NDWI)';
      labels = ['Tierra Firme', 'Lámina de Agua'];
      method = 'McFeeters NDWI >= 0.12';
      if (ndwi2 >= 0.12) flag = 1;
    } else if (workflow === 'urbanization') {
      title = 'Expansión Urbana / Suelo Impermeable (ΔNDBI)';
      labels = ['Sin Expansión', 'Expansión / Sellado Urbano'];
      method = 'NDBI >= 0.08 o ΔNDBI >= 0.03';
      if (ndbi2 >= 0.08 || ndbi2 - ndbi1 >= 0.03) flag = 1;
    } else {
      title = 'Humedad del Suelo / Dosel (NDMI)';
      labels = ['Déficit Hídrico', 'Humedad Moderada-Alta'];
      method = 'Normalized Difference Moisture Index (NDMI >= 0.10)';
      if (ndmi2 >= 0.10) flag = 1;
    }
    out[i] = flag;
    if (flag === 1) positive++;
  }

  const affectedHa = Math.round(positive * cellHa * 100) / 100;
  const affectedPct = Math.round((positive / Math.max(n, 1)) * 1000) / 10;

  return {
    title,
    resultGrid: {
      id: `thm-${workflow}-${Date.now()}`,
      name: `${title} (${affectedHa} ha)`,
      cols: scene.cols,
      rows: scene.rows,
      cellSizeMeters: scene.cellSizeMeters,
      bounds: scene.bounds,
      crs: scene.crs,
      noData: -9999,
      unit: 'clase',
      values: out,
      colorScale: 'classes',
      classLabels: labels,
    },
    affectedHa,
    affectedPct,
    findingSummary: `${title}: ${affectedHa} ha identificadas (${affectedPct}% del área de la escena).`,
    precisionEnvelope: buildPrecisionEnvelope({
      resultSummary: `${affectedHa} ha (${affectedPct}%) detectadas mediante ${method}`,
      method,
      crs: scene.crs,
      resolution: `${scene.cellSizeMeters} m`,
      units: 'ha / % área',
      sourceData: [scene.name, `${scene.t1.date} vs ${scene.t2.date}`],
      estimatedAccuracy: 'Clasificación espectral indicativa; validar áreas críticas en campo',
      dataKind: 'prediccion_ml',
    }),
  };
}
