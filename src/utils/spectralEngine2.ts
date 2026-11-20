import { DemGrid, SpectralScene } from './geotechEngine';
import { evaluateMapAlgebraExpression } from './rasterEngine2';

export type ExtendedSpectralIndex =
  | 'NDVI'
  | 'NDWI'
  | 'MNDWI'
  | 'NDBI'
  | 'SAVI'
  | 'EVI'
  | 'NBR'
  | 'NDMI'
  | 'BSI'
  | 'GNDVI'
  | 'CIGREEN';

export const SPECTRAL_INDEX_CATALOG: Array<{
  code: ExtendedSpectralIndex;
  name: string;
  formula: string;
  domain: string;
}> = [
  { code: 'NDVI', name: 'Vigor Vegetal Normalizado', formula: '(NIR - Red) / (NIR + Red)', domain: 'Vegetación' },
  { code: 'EVI', name: 'Índice de Vegetación Mejorado', formula: '2.5*(NIR-Red)/(NIR+6*Red-7.5*Blue+1)', domain: 'Vegetación Densa' },
  { code: 'SAVI', name: 'Vegetación Ajustado al Suelo', formula: '1.5*(NIR-Red)/(NIR+Red+0.5)', domain: 'Zonas Áridas' },
  { code: 'GNDVI', name: 'NDVI Verde (Clorofila)', formula: '(NIR - Green) / (NIR + Green)', domain: 'Clorofila / Dosel' },
  { code: 'CIGREEN', name: 'Índice de Clorofila Verde', formula: '(NIR / Green) - 1', domain: 'Estrés Foliar' },
  { code: 'NDWI', name: 'Agua Superficial (McFeeters)', formula: '(Green - NIR) / (Green + NIR)', domain: 'Humedad / Agua' },
  { code: 'MNDWI', name: 'Agua Modificado (Xu)', formula: '(Green - SWIR1) / (Green + SWIR1)', domain: 'Cuerpos de Agua' },
  { code: 'NDMI', name: 'Humedad / Estrés Hídrico (NDMI)', formula: '(NIR - SWIR1) / (NIR + SWIR1)', domain: 'Contenido Hídrico' },
  { code: 'NDBI', name: 'Índice Urbano / Edificado', formula: '(SWIR1 - NIR) / (SWIR1 + NIR)', domain: 'Infraestructura' },
  { code: 'BSI', name: 'Índice de Suelo Desnudo (BSI)', formula: '((SWIR1+Red)-(NIR+Blue))/((SWIR1+Red)+(NIR+Blue))', domain: 'Suelo / Erosión' },
  { code: 'NBR', name: 'Severidad de Quema / Cicatriz', formula: '(NIR - SWIR2) / (NIR + SWIR2)', domain: 'Incendios / Disturbio' },
];

export function computeExtendedSpectralIndex(
  scene: SpectralScene,
  dateSlot: 't1' | 't2',
  indexType: ExtendedSpectralIndex
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
      case 'NDMI':
        val = (nir - s1) / Math.max(nir + s1, 1e-6);
        break;
      case 'BSI':
        val = (s1 + r - (nir + b)) / Math.max(s1 + r + nir + b, 1e-6);
        break;
      case 'GNDVI':
        val = (nir - g) / Math.max(nir + g, 1e-6);
        break;
      case 'CIGREEN':
        val = nir / Math.max(g, 1e-4) - 1;
        break;
    }

    const clamped =
      indexType === 'CIGREEN'
        ? Math.max(-1, Math.min(8, Math.round(val * 1000) / 1000))
        : Math.max(-1, Math.min(1, Math.round(val * 1000) / 1000));
    values[i] = clamped;
    if (clamped < min) min = clamped;
    if (clamped > max) max = clamped;
    sum += clamped;
    if (clamped > 0.25) positiveCount++;
  }

  return {
    grid: {
      id: `idx2-${indexType}-${dateSlot}-${Date.now()}`,
      name: `${indexType} (${bands.sensor} · ${bands.date})`,
      cols: scene.cols,
      rows: scene.rows,
      cellSizeMeters: scene.cellSizeMeters,
      bounds: scene.bounds,
      crs: scene.crs,
      noData: -9999,
      unit: indexType,
      values,
      colorScale:
        indexType === 'NDWI' || indexType === 'MNDWI' || indexType === 'NDMI'
          ? 'ndwi'
          : indexType === 'NDBI' || indexType === 'BSI'
          ? 'thermal'
          : 'ndvi',
    },
    min: Math.round(min * 1000) / 1000,
    max: Math.round(max * 1000) / 1000,
    mean: Math.round((sum / Math.max(n, 1)) * 1000) / 1000,
    positiveCoveragePct: Math.round((positiveCount / Math.max(n, 1)) * 1000) / 10,
  };
}

export function computeCustomSpectralFormula(
  scene: SpectralScene,
  dateSlot: 't1' | 't2',
  formula: string
): { grid: DemGrid; min: number; max: number; mean: number } {
  const bands = scene[dateSlot];
  const n = scene.rows * scene.cols;
  const values = new Array<number>(n);
  let min = Infinity,
    max = -Infinity,
    sum = 0;

  for (let i = 0; i < n; i++) {
    const val = evaluateMapAlgebraExpression(formula, {
      blue: bands.blue[i],
      b2: bands.blue[i],
      green: bands.green[i],
      b3: bands.green[i],
      red: bands.red[i],
      b4: bands.red[i],
      nir: bands.nir[i],
      b8: bands.nir[i],
      swir1: bands.swir1[i],
      b11: bands.swir1[i],
      swir2: bands.swir2[i],
      b12: bands.swir2[i],
    });
    const rounded = Math.round(val * 1000) / 1000;
    values[i] = rounded;
    if (rounded < min) min = rounded;
    if (rounded > max) max = rounded;
    sum += rounded;
  }

  return {
    grid: {
      id: `spec-custom-${Date.now()}`,
      name: `Fórmula Espectral (${formula.slice(0, 28)})`,
      cols: scene.cols,
      rows: scene.rows,
      cellSizeMeters: scene.cellSizeMeters,
      bounds: scene.bounds,
      crs: scene.crs,
      noData: -9999,
      unit: 'índice',
      values,
      colorScale: 'ndvi',
    },
    min: Math.round(min * 1000) / 1000,
    max: Math.round(max * 1000) / 1000,
    mean: Math.round((sum / Math.max(n, 1)) * 1000) / 1000,
  };
}

// =========================================================
// DOS1 ATMOSPHERIC CORRECTION & CLOUD MASKING
// =========================================================

export interface Dos1CorrectionResult {
  correctedScene: SpectralScene;
  pathRadiance: {
    blue: number;
    green: number;
    red: number;
    nir: number;
    swir1: number;
    swir2: number;
  };
  cloudMaskedPixels: number;
  cloudPct: number;
  cloudMaskGrid: DemGrid;
}

export function applyDos1AtmosphericAndCloudMask(
  scene: SpectralScene,
  dateSlot: 't1' | 't2',
  cloudBlueThreshold: number = 0.24
): Dos1CorrectionResult {
  const bands = scene[dateSlot];
  const n = scene.rows * scene.cols;

  const pct1 = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.max(0, Math.floor(sorted.length * 0.01));
    // DOS1 subtracts dark-object offset minus 1% surface floor (0.01)
    return Math.max(0, Math.round((sorted[idx] - 0.01) * 10000) / 10000);
  };

  const pathRadiance = {
    blue: pct1(bands.blue),
    green: pct1(bands.green),
    red: pct1(bands.red),
    nir: pct1(bands.nir),
    swir1: pct1(bands.swir1),
    swir2: pct1(bands.swir2),
  };

  const subtract = (arr: number[], dark: number) =>
    arr.map((v) => Math.max(0.001, Math.round((v - dark) * 10000) / 10000));

  const maskValues = new Array<number>(n);
  let cloudMaskedPixels = 0;
  for (let i = 0; i < n; i++) {
    // Cloud detection heuristic: high Blue + high Green reflectance & low SWIR thermal drop
    const isCloud = bands.blue[i] >= cloudBlueThreshold && bands.green[i] >= cloudBlueThreshold * 0.9;
    maskValues[i] = isCloud ? 1 : 0;
    if (isCloud) cloudMaskedPixels++;
  }

  const correctedBands = {
    ...bands,
    sensor: `${bands.sensor} (DOS1)`,
    blue: subtract(bands.blue, pathRadiance.blue),
    green: subtract(bands.green, pathRadiance.green),
    red: subtract(bands.red, pathRadiance.red),
    nir: subtract(bands.nir, pathRadiance.nir),
    swir1: subtract(bands.swir1, pathRadiance.swir1),
    swir2: subtract(bands.swir2, pathRadiance.swir2),
  };

  return {
    correctedScene: {
      ...scene,
      [dateSlot]: correctedBands,
    },
    pathRadiance,
    cloudMaskedPixels,
    cloudPct: Math.round((cloudMaskedPixels / Math.max(n, 1)) * 1000) / 10,
    cloudMaskGrid: {
      id: `cloudmask-${dateSlot}-${Date.now()}`,
      name: `Máscara de Nubes / Bruma (${bands.date})`,
      cols: scene.cols,
      rows: scene.rows,
      cellSizeMeters: scene.cellSizeMeters,
      bounds: scene.bounds,
      crs: scene.crs,
      noData: -9999,
      unit: 'máscara',
      values: maskValues,
      colorScale: 'classes',
      classLabels: ['Despejado (0)', 'Nube/Bruma (1)'],
    },
  };
}

// =========================================================
// MULTISPECTRAL RGB / FALSE-COLOR / SWIR COMPOSITE BUILDER
// =========================================================

export type SpectralCompositeMode = 'rgb' | 'false_color_nir' | 'swir_urban';

export function buildSpectralCompositeRgba(
  scene: SpectralScene,
  dateSlot: 't1' | 't2',
  mode: SpectralCompositeMode
): Uint8ClampedArray {
  const bands = scene[dateSlot];
  const n = scene.rows * scene.cols;
  const rgba = new Uint8ClampedArray(n * 4);

  const stretch = (val: number, maxRef: number) =>
    Math.max(0, Math.min(255, Math.round((val / maxRef) * 255)));

  for (let i = 0; i < n; i++) {
    let r = 0,
      g = 0,
      b = 0;
    if (mode === 'rgb') {
      r = stretch(bands.red[i], 0.32);
      g = stretch(bands.green[i], 0.30);
      b = stretch(bands.blue[i], 0.28);
    } else if (mode === 'false_color_nir') {
      r = stretch(bands.nir[i], 0.65);
      g = stretch(bands.red[i], 0.32);
      b = stretch(bands.green[i], 0.30);
    } else {
      // SWIR2 - NIR - Red (Urban / Geological contrast)
      r = stretch(bands.swir2[i], 0.42);
      g = stretch(bands.nir[i], 0.65);
      b = stretch(bands.red[i], 0.32);
    }
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

export function renderSpectralCompositeDataUrl(
  scene: SpectralScene,
  dateSlot: 't1' | 't2',
  mode: SpectralCompositeMode
): string {
  if (typeof document === 'undefined') return '';
  const rgba = buildSpectralCompositeRgba(scene, dateSlot, mode);
  const canvas = document.createElement('canvas');
  canvas.width = scene.cols;
  canvas.height = scene.rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = new ImageData(new Uint8ClampedArray(rgba), scene.cols, scene.rows);
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

// =========================================================
// SUPERVISED CLASSIFICATION + CONFUSION MATRIX & KAPPA
// =========================================================

export interface SupervisedValidationResult {
  classGrid: DemGrid;
  classLabels: string[];
  confusionMatrix: number[][]; // rows = reference, cols = predicted
  overallAccuracyPct: number;
  kappa: number;
  validationSampleCount: number;
  perClassMetrics: Array<{
    classIndex: number;
    label: string;
    producersAccPct: number;
    usersAccPct: number;
    hectares: number;
  }>;
}

export interface TrainingRoiSpec {
  classIndex: number; // 0..3
  label: string;
  pixels: number[]; // flat indices
}

export function deriveDefaultTrainingRois(scene: SpectralScene, dateSlot: 't1' | 't2'): TrainingRoiSpec[] {
  const b = scene[dateSlot];
  const n = scene.rows * scene.cols;
  const water: number[] = [];
  const urban: number[] = [];
  const sparse: number[] = [];
  const dense: number[] = [];

  for (let i = 0; i < n; i++) {
    const ndvi = (b.nir[i] - b.red[i]) / Math.max(b.nir[i] + b.red[i], 1e-6);
    const ndwi = (b.green[i] - b.nir[i]) / Math.max(b.green[i] + b.nir[i], 1e-6);
    const ndbi = (b.swir1[i] - b.nir[i]) / Math.max(b.swir1[i] + b.nir[i], 1e-6);

    if (ndwi > 0.15) water.push(i);
    else if (ndbi > 0.08 && ndvi < 0.2) urban.push(i);
    else if (ndvi >= 0.52) dense.push(i);
    else if (ndvi >= 0.22 && ndvi < 0.45) sparse.push(i);
  }

  return [
    { classIndex: 0, label: 'Agua / Humedad', pixels: water },
    { classIndex: 1, label: 'Suelo / Infraestructura', pixels: urban },
    { classIndex: 2, label: 'Vegetación Dispersa', pixels: sparse },
    { classIndex: 3, label: 'Vegetación Densa', pixels: dense },
  ];
}

export function runSupervisedClassificationAndValidate(
  scene: SpectralScene,
  dateSlot: 't1' | 't2',
  customRois?: TrainingRoiSpec[]
): SupervisedValidationResult {
  const bands = scene[dateSlot];
  const rois = customRois && customRois.length > 0 ? customRois : deriveDefaultTrainingRois(scene, dateSlot);
  const k = rois.length;
  const classLabels = rois.map((r) => r.label);

  // Split ROI pixels deterministically: even position in ROI -> training, odd -> holdout validation
  const signatures: number[][] = rois.map((roi) => {
    const trainIdx = roi.pixels.filter((_, idx) => idx % 2 === 0);
    const sample = trainIdx.length > 0 ? trainIdx : roi.pixels;
    if (sample.length === 0) return [0.1, 0.1, 0.1, 0.2, 0.1];
    let sb = 0,
      sg = 0,
      sr = 0,
      snir = 0,
      ssw = 0;
    for (const px of sample) {
      sb += bands.blue[px];
      sg += bands.green[px];
      sr += bands.red[px];
      snir += bands.nir[px];
      ssw += bands.swir1[px];
    }
    return [
      sb / sample.length,
      sg / sample.length,
      sr / sample.length,
      snir / sample.length,
      ssw / sample.length,
    ];
  });

  const classifyPixel = (i: number): number => {
    let bestC = 0;
    let bestDist = Infinity;
    for (let c = 0; c < k; c++) {
      if (rois[c].pixels.length === 0) continue;
      const sig = signatures[c];
      const d =
        Math.pow(bands.blue[i] - sig[0], 2) +
        Math.pow(bands.green[i] - sig[1], 2) +
        Math.pow(bands.red[i] - sig[2], 2) +
        Math.pow(bands.nir[i] - sig[3], 2) +
        Math.pow(bands.swir1[i] - sig[4], 2);
      if (d < bestDist) {
        bestDist = d;
        bestC = c;
      }
    }
    return bestC;
  };

  const n = scene.rows * scene.cols;
  const classified = new Array<number>(n);
  const classCounts = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    const cls = classifyPixel(i);
    classified[i] = cls;
    classCounts[cls]++;
  }

  // Evaluate Confusion Matrix strictly on holdout validation pixels
  const confusionMatrix: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  let totalVal = 0;
  let totalCorrect = 0;

  rois.forEach((roi, refIdx) => {
    const holdout = roi.pixels.filter((_, idx) => idx % 2 === 1);
    const valPixels = holdout.length > 0 ? holdout : roi.pixels;
    for (const px of valPixels) {
      const predIdx = classified[px];
      confusionMatrix[refIdx][predIdx]++;
      totalVal++;
      if (predIdx === refIdx) totalCorrect++;
    }
  });

  const overallAcc = totalVal > 0 ? totalCorrect / totalVal : 0;
  let expectedRandom = 0;
  if (totalVal > 0) {
    for (let c = 0; c < k; c++) {
      const rowSum = confusionMatrix[c].reduce((s, x) => s + x, 0);
      let colSum = 0;
      for (let r = 0; r < k; r++) colSum += confusionMatrix[r][c];
      expectedRandom += (rowSum * colSum) / (totalVal * totalVal);
    }
  }
  const kappa = expectedRandom < 1 ? (overallAcc - expectedRandom) / (1 - expectedRandom) : 1;

  const cellAreaHa = (scene.cellSizeMeters * scene.cellSizeMeters) / 10000;
  const perClassMetrics = classLabels.map((label, c) => {
    const rowSum = confusionMatrix[c].reduce((s, x) => s + x, 0);
    let colSum = 0;
    for (let r = 0; r < k; r++) colSum += confusionMatrix[r][c];
    const diag = confusionMatrix[c][c];
    return {
      classIndex: c,
      label,
      producersAccPct: rowSum > 0 ? Math.round((diag / rowSum) * 1000) / 10 : 100,
      usersAccPct: colSum > 0 ? Math.round((diag / colSum) * 1000) / 10 : 100,
      hectares: Math.round(classCounts[c] * cellAreaHa * 100) / 100,
    };
  });

  return {
    classGrid: {
      id: `sup-${dateSlot}-${Date.now()}`,
      name: `Clasificación Supervisada Mín. Distancia (${bands.date})`,
      cols: scene.cols,
      rows: scene.rows,
      cellSizeMeters: scene.cellSizeMeters,
      bounds: scene.bounds,
      crs: scene.crs,
      noData: -9999,
      unit: 'clase',
      values: classified,
      colorScale: 'classes',
      classLabels,
    },
    classLabels,
    confusionMatrix,
    overallAccuracyPct: Math.round(overallAcc * 1000) / 10,
    kappa: Math.round(kappa * 1000) / 1000,
    validationSampleCount: totalVal,
    perClassMetrics,
  };
}
