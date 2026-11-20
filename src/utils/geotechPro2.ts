import * as turf from '@turf/turf';
import {
  BoreholeRecord,
  DemGrid,
  computeHydrologyD8AndTwi,
  computeSlopeGrid,
  evaluateLiquefactionScreening,
} from './geotechEngine';

export type GeotechProvenanceTag =
  | 'observacion_campo'
  | 'ensayo_spt_lab'
  | 'interpolacion_idw'
  | 'parametro_asumido'
  | 'modelo_analitico';

// =========================================================
// 1. MULTI-BOREHOLE CROSS-SECTION & SUBSURFACE SURFACES
// =========================================================

export interface CrossSectionColumn {
  boreholeId: string;
  code: string;
  name: string;
  distanceM: number;
  collarElevM: number;
  waterTableElevM: number;
  totalDepthM: number;
  strata: BoreholeRecord['strata'];
}

export function buildBoreholeCrossSection(boreholes: BoreholeRecord[]): {
  columns: CrossSectionColumn[];
  totalLengthM: number;
  minElevM: number;
  maxElevM: number;
} {
  if (boreholes.length === 0) {
    return { columns: [], totalLengthM: 0, minElevM: 0, maxElevM: 100 };
  }
  const sorted = [...boreholes].sort((a, b) => a.lng - b.lng);
  let cumDist = 0;
  let minElev = Infinity;
  let maxElev = -Infinity;

  const columns: CrossSectionColumn[] = sorted.map((bh, idx) => {
    if (idx > 0) {
      cumDist += turf.distance([sorted[idx - 1].lng, sorted[idx - 1].lat], [bh.lng, bh.lat], {
        units: 'meters',
      });
    }
    const baseElev = bh.collarElevM - bh.totalDepthM;
    if (baseElev < minElev) minElev = baseElev;
    if (bh.collarElevM > maxElev) maxElev = bh.collarElevM;
    return {
      boreholeId: bh.id,
      code: bh.code,
      name: bh.name,
      distanceM: Math.round(cumDist),
      collarElevM: bh.collarElevM,
      waterTableElevM: Math.round((bh.collarElevM - bh.waterTableDepthM) * 100) / 100,
      totalDepthM: bh.totalDepthM,
      strata: bh.strata,
    };
  });

  return {
    columns,
    totalLengthM: Math.round(cumDist),
    minElevM: Math.floor(minElev - 2),
    maxElevM: Math.ceil(maxElev + 3),
  };
}

export function interpolateSubsurfaceSurfaces(
  boreholes: BoreholeRecord[],
  dem: DemGrid
): {
  waterTableDepthGrid: DemGrid;
  bedrockDepthGrid: DemGrid;
  uncertaintyDistanceGrid: DemGrid;
  meanUncertaintyM: number;
} {
  if (boreholes.length === 0) {
    throw new Error('Se requiere al menos un sondeo SPT para interpolar horizontes del subsuelo.');
  }

  const [minLng, minLat, maxLng, maxLat] = dem.bounds;
  const dx = (maxLng - minLng) / dem.cols;
  const dy = (maxLat - minLat) / dem.rows;
  const n = dem.rows * dem.cols;

  const wtVals = new Array<number>(n);
  const rockVals = new Array<number>(n);
  const distVals = new Array<number>(n);

  const bhMetrics = boreholes.map((bh) => {
    // Identify competent rock / dense stratum (N60 >= 38 or last stratum top)
    const rockStratum =
      bh.strata.find((s) => s.sptN60 >= 38 || /roca|conglomerado|basamento|andesita|denso/i.test(s.lithology)) ||
      bh.strata[bh.strata.length - 1];
    const bedrockDepth = rockStratum ? rockStratum.fromM : bh.totalDepthM;
    return {
      lng: bh.lng,
      lat: bh.lat,
      waterTableDepthM: bh.waterTableDepthM,
      bedrockDepthM: bedrockDepth,
    };
  });

  let sumDist = 0;
  for (let r = 0; r < dem.rows; r++) {
    const lat = maxLat - (r + 0.5) * dy;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    for (let c = 0; c < dem.cols; c++) {
      const lng = minLng + (c + 0.5) * dx;
      let numWt = 0,
        numRk = 0,
        den = 0;
      let minDistM = Infinity;
      let exactWt: number | null = null;
      let exactRk: number | null = null;

      for (const b of bhMetrics) {
        const dM = Math.hypot((lng - b.lng) * 111320 * cosLat, (lat - b.lat) * 110540);
        if (dM < minDistM) minDistM = dM;
        if (dM < 5) {
          exactWt = b.waterTableDepthM;
          exactRk = b.bedrockDepthM;
        }
        const w = 1 / Math.pow(Math.max(dM, 5), 2);
        numWt += w * b.waterTableDepthM;
        numRk += w * b.bedrockDepthM;
        den += w;
      }

      const idx = r * dem.cols + c;
      wtVals[idx] = Math.round((exactWt !== null ? exactWt : numWt / den) * 100) / 100;
      rockVals[idx] = Math.round((exactRk !== null ? exactRk : numRk / den) * 100) / 100;
      distVals[idx] = Math.round(minDistM);
      sumDist += minDistM;
    }
  }

  return {
    waterTableDepthGrid: {
      ...dem,
      id: `wt-idw-${Date.now()}`,
      name: 'Profundidad Nivel Freático IDW (m)',
      unit: 'm b.s.',
      values: wtVals,
      colorScale: 'ndwi',
    },
    bedrockDepthGrid: {
      ...dem,
      id: `rock-idw-${Date.now()}`,
      name: 'Horizonte Estrato Competente / Roca IDW (m)',
      unit: 'm prof.',
      values: rockVals,
      colorScale: 'elevation',
    },
    uncertaintyDistanceGrid: {
      ...dem,
      id: `uncert-idw-${Date.now()}`,
      name: 'Incertidumbre Espacial (Distancia al Sondeo más cercano)',
      unit: 'metros',
      values: distVals,
      colorScale: 'thermal',
    },
    meanUncertaintyM: Math.round(sumDist / Math.max(n, 1)),
  };
}

// =========================================================
// 2. TERZAGHI & MEYERHOF BEARING CAPACITY
// =========================================================

export interface BearingCapacityInput {
  method: 'terzaghi' | 'meyerhof';
  footingShape: 'strip' | 'square' | 'circular' | 'rectangular';
  widthBM: number;
  lengthLM: number;
  embedmentDfM: number;
  waterTableDepthM: number;
  cohesionKpa: number;
  frictionDeg: number;
  unitWeightKnM3: number;
  safetyFactor: number;
}

export interface BearingCapacityResult {
  nc: number;
  nq: number;
  nGamma: number;
  qUltKpa: number;
  qAdmKpa: number;
  effectiveOverburdenKpa: number;
  waterCorrectionApplied: boolean;
  provenance: GeotechProvenanceTag;
  methodologyNote: string;
}

export function computeBearingCapacity(input: BearingCapacityInput): BearingCapacityResult {
  const B = Math.max(0.4, input.widthBM);
  const L = input.footingShape === 'square' || input.footingShape === 'circular' ? B : Math.max(B, input.lengthLM);
  const Df = Math.max(0.2, input.embedmentDfM);
  const phiDeg = Math.max(0, Math.min(48, input.frictionDeg));
  const phi = (phiDeg * Math.PI) / 180;
  const gamma = Math.max(10, input.unitWeightKnM3);
  const c = Math.max(0, input.cohesionKpa);
  const fs = Math.max(1.5, input.safetyFactor);

  // Overburden pressure at foundation base with water table adjustment
  const gammaW = 9.81;
  const gammaSub = Math.max(4, gamma - gammaW);
  const waterInDepth = input.waterTableDepthM <= Df;
  const waterInInfluence = input.waterTableDepthM < Df + B;

  const q = waterInDepth
    ? input.waterTableDepthM * gamma + (Df - input.waterTableDepthM) * gammaSub
    : Df * gamma;

  // Effective unit weight below base
  let gammaEff = gamma;
  if (waterInDepth) {
    gammaEff = gammaSub;
  } else if (waterInInfluence) {
    const dw = Math.max(0, input.waterTableDepthM - Df);
    gammaEff = gammaSub + (dw / B) * (gamma - gammaSub);
  }

  let nc: number;
  let nq: number;
  let nGamma: number;

  if (phiDeg === 0) {
    nc = input.method === 'terzaghi' ? 5.7 : 5.14;
    nq = 1.0;
    nGamma = 0;
  } else if (input.method === 'terzaghi') {
    const a = Math.exp((0.75 * Math.PI - phi / 2) * Math.tan(phi));
    nq = (a * a) / (2 * Math.pow(Math.cos(Math.PI / 4 + phi / 2), 2));
    nc = (nq - 1) / Math.tan(phi);
    nGamma = 2 * (nq + 1) * Math.tan(phi); // Vesic/Terzaghi smooth approximation
  } else {
    // Meyerhof (1963)
    nq = Math.exp(Math.PI * Math.tan(phi)) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2);
    nc = (nq - 1) / Math.tan(phi);
    nGamma = (nq - 1) * Math.tan(1.4 * phi);
  }

  let sc = 1;
  let sq = 1;
  let sGamma = 1;
  if (input.footingShape === 'square') {
    sc = input.method === 'terzaghi' ? 1.3 : 1 + 0.2 * (B / L);
    sq = input.method === 'terzaghi' ? 1.0 : 1 + 0.1 * (B / L);
    sGamma = input.method === 'terzaghi' ? 0.8 : 1 - 0.2 * (B / L);
  } else if (input.footingShape === 'circular') {
    sc = input.method === 'terzaghi' ? 1.3 : 1.2;
    sq = 1.0;
    sGamma = 0.6;
  } else if (input.footingShape === 'rectangular') {
    sc = 1 + 0.2 * (B / L);
    sq = 1 + 0.1 * (B / L);
    sGamma = 1 - 0.2 * (B / L);
  }

  const qUlt = c * nc * sc + q * nq * sq + 0.5 * gammaEff * B * nGamma * sGamma;
  const qAdm = qUlt / fs;

  return {
    nc: Math.round(nc * 100) / 100,
    nq: Math.round(nq * 100) / 100,
    nGamma: Math.round(nGamma * 100) / 100,
    qUltKpa: Math.round(qUlt * 10) / 10,
    qAdmKpa: Math.round(qAdm * 10) / 10,
    effectiveOverburdenKpa: Math.round(q * 10) / 10,
    waterCorrectionApplied: waterInDepth || waterInInfluence,
    provenance: 'modelo_analitico',
    methodologyNote:
      input.method === 'terzaghi'
        ? 'Capacidad Portante Analítica Terzaghi (1943) para falla general por corte. Preliminar: validar con ensayos triaxiales / placa de carga.'
        : 'Capacidad Portante Analítica Meyerhof (1963) con factores de forma y nivel freático. Preliminar: requiere memoria de cálculo estructural.',
  };
}

// =========================================================
// 3. 1D ELASTIC + CONSOLIDATION SETTLEMENT
// =========================================================

export interface SettlementInput {
  appliedPressureKpa: number;
  footingWidthBM: number;
  soilElasticModulusKpa: number;
  poissonRatio: number;
  compressibleLayerHm: number;
  compressionIndexCc: number;
  initialVoidRatioE0: number;
  initialEffectiveStressKpa: number;
}

export interface SettlementResult {
  elasticImmediateMm: number;
  consolidationPrimaryMm: number;
  totalSettlementMm: number;
  acceptable25mm: boolean;
  provenance: GeotechProvenanceTag;
}

export function computeSettlement1D(input: SettlementInput): SettlementResult {
  const q = Math.max(5, input.appliedPressureKpa);
  const B = Math.max(0.5, input.footingWidthBM);
  const Es = Math.max(1000, input.soilElasticModulusKpa);
  const nu = Math.max(0.1, Math.min(0.49, input.poissonRatio));
  const Iw = 0.88; // flexible center-average influence factor

  const seM = (q * B * (1 - nu * nu) * Iw) / Es;

  const H = Math.max(0.5, input.compressibleLayerHm);
  const Cc = Math.max(0, input.compressionIndexCc);
  const e0 = Math.max(0.2, input.initialVoidRatioE0);
  const sigma0 = Math.max(10, input.initialEffectiveStressKpa);
  // Boussinesq mid-layer stress increment approximation (2:1 spread)
  const zMid = H / 2;
  const deltaSigma = q * Math.pow(B / (B + zMid), 2);
  const scM = ((Cc * H) / (1 + e0)) * Math.log10((sigma0 + deltaSigma) / sigma0);

  const seMm = Math.round(seM * 1000 * 10) / 10;
  const scMm = Math.round(scM * 1000 * 10) / 10;
  const totalMm = Math.round((seMm + scMm) * 10) / 10;

  return {
    elasticImmediateMm: seMm,
    consolidationPrimaryMm: scMm,
    totalSettlementMm: totalMm,
    acceptable25mm: totalMm <= 25,
    provenance: 'modelo_analitico',
  };
}

// =========================================================
// 4. SEISMIC PSEUDO-STATIC SLOPE STABILITY & MULTI-STRATUM LPI
// =========================================================

export function evaluateSeismicSlopeStability(input: {
  method: 'infinite_slope' | 'simplified_bishop';
  slopeAngleDeg: number;
  slopeHeightM: number;
  failureDepthM: number;
  unitWeightKnM3: number;
  cohesionKpa: number;
  frictionDeg: number;
  porePressureRatioRu: number;
  seismicKh: number; // e.g., 0.12g..0.25g pseudo-static horizontal coefficient
}): {
  staticFs: number;
  seismicFs: number;
  stabilityClass: string;
  provenance: GeotechProvenanceTag;
} {
  const beta = (Math.max(1, Math.min(85, input.slopeAngleDeg)) * Math.PI) / 180;
  const phi = (Math.max(0, Math.min(60, input.frictionDeg)) * Math.PI) / 180;
  const ru = Math.max(0, Math.min(0.6, input.porePressureRatioRu));
  const gamma = Math.max(10, input.unitWeightKnM3);
  const c = Math.max(0, input.cohesionKpa);
  const z = Math.max(0.5, input.failureDepthM);
  const kh = Math.max(0, Math.min(0.5, input.seismicKh));

  const solveForKh = (k: number): number => {
    if (input.method === 'infinite_slope') {
      const cosB = Math.cos(beta);
      const sinB = Math.sin(beta);
      const driving = gamma * z * (sinB * cosB + k * cosB * cosB);
      const normal = Math.max(0, gamma * z * (cosB * cosB * (1 - ru) - k * sinB * cosB));
      const resisting = c + normal * Math.tan(phi);
      return driving > 0 ? resisting / driving : 10;
    }

    const H = Math.max(2, input.slopeHeightM);
    const slices = 10;
    const width = H / Math.tan(beta) / slices;
    const tanPhi = Math.tan(phi);
    let fs = 1.25;
    for (let iter = 0; iter < 15; iter++) {
      let num = 0;
      let den = 0;
      for (let s = 0; s < slices; s++) {
        const frac = (s + 0.5) / slices;
        const sliceH = H * Math.sin(Math.PI * frac) * 0.55;
        const alpha = (frac - 0.3) * beta * 1.15;
        const W = gamma * sliceH * width;
        const u = ru * gamma * sliceH;
        const mAlpha = Math.cos(alpha) + (Math.sin(alpha) * tanPhi) / Math.max(fs, 0.2);
        num += (c * width + (W - u * width) * tanPhi) / Math.max(mAlpha, 0.25);
        den += W * Math.sin(alpha) + k * W * Math.cos(alpha) * 0.65;
      }
      const nextFs = num / Math.max(den, 1e-3);
      if (Math.abs(nextFs - fs) < 0.001) {
        fs = nextFs;
        break;
      }
      fs = nextFs;
    }
    return fs;
  };

  const staticFs = Math.round(Math.max(0.1, Math.min(9.99, solveForKh(0))) * 100) / 100;
  const seismicFs = Math.round(Math.max(0.1, Math.min(9.99, solveForKh(kh))) * 100) / 100;
  const stabilityClass =
    seismicFs >= 1.15
      ? 'Estable bajo sismo pseudo-estático (FS_s >= 1.15)'
      : seismicFs >= 1.0
      ? 'Marginal bajo sismo (1.00 <= FS_s < 1.15)'
      : 'Inestable bajo sismo (FS_s < 1.00)';

  return { staticFs, seismicFs, stabilityClass, provenance: 'modelo_analitico' };
}

export function computeBoreholeLpi(
  borehole: BoreholeRecord,
  pgaG: number = borehole.pgaG ?? 0.35
): {
  lpi: number;
  riskCategory: 'Bajo (LPI < 5)' | 'Alto (5 <= LPI <= 15)' | 'Muy Alto (LPI > 15)';
  strataEvaluated: Array<{
    fromM: number;
    toM: number;
    uscs: string;
    sptN60: number;
    fsLiq: number;
    lpiContribution: number;
  }>;
} {
  let lpi = 0;
  const strataEvaluated: Array<{
    fromM: number;
    toM: number;
    uscs: string;
    sptN60: number;
    fsLiq: number;
    lpiContribution: number;
  }> = [];

  for (const st of borehole.strata) {
    const zTop = Math.max(borehole.waterTableDepthM, Math.min(20, st.fromM));
    const zBot = Math.min(20, st.toM);
    if (zBot <= zTop) continue;
    const zMid = (zTop + zBot) / 2;
    const thickness = zBot - zTop;
    const screen = evaluateLiquefactionScreening(
      st.sptN60,
      zMid,
      borehole.waterTableDepthM,
      pgaG,
      st.unitWeightKnM3
    );
    const fz = screen.fsLiq < 1.0 ? 1 - screen.fsLiq : 0;
    const wz = 10 - 0.5 * zMid;
    const contrib = Math.max(0, fz * wz * thickness);
    lpi += contrib;
    strataEvaluated.push({
      fromM: st.fromM,
      toM: st.toM,
      uscs: st.uscs,
      sptN60: st.sptN60,
      fsLiq: screen.fsLiq,
      lpiContribution: Math.round(contrib * 100) / 100,
    });
  }

  const roundedLpi = Math.round(lpi * 100) / 100;
  const riskCategory =
    roundedLpi > 15
      ? 'Muy Alto (LPI > 15)'
      : roundedLpi >= 5
      ? 'Alto (5 <= LPI <= 15)'
      : 'Bajo (LPI < 5)';

  return { lpi: roundedLpi, riskCategory, strataEvaluated };
}

export function computeGeotechZoningMap(
  dem: DemGrid,
  boreholes: BoreholeRecord[]
): {
  zoningGrid: DemGrid;
  countsByClass: { favorablePct: number; moderadoPct: number; restringidoPct: number; criticoPct: number };
} {
  const slope = computeSlopeGrid(dem).grid;
  const twi = computeHydrologyD8AndTwi(dem).twiGrid;
  const subsurface = boreholes.length > 0 ? interpolateSubsurfaceSurfaces(boreholes, dem) : null;

  const n = dem.values.length;
  const out = new Array<number>(n);
  const c = [0, 0, 0, 0];

  for (let i = 0; i < n; i++) {
    const slp = slope.values[i];
    const t = twi.values[i];
    const wt = subsurface ? subsurface.waterTableDepthGrid.values[i] : 6;

    let cls = 0; // 0: Favorable, 1: Moderado, 2: Restringido, 3: Crítico
    if (slp >= 30 || (wt < 2.2 && t > 8.5)) cls = 3;
    else if (slp >= 20 || wt < 3.5 || t > 8.2) cls = 2;
    else if (slp >= 10 || wt < 5.5) cls = 1;
    out[i] = cls;
    c[cls]++;
  }

  return {
    zoningGrid: {
      ...dem,
      id: `geozoning-${Date.now()}`,
      name: 'Zonificación Geotécnica Integrada (Pendiente + Freático + TWI)',
      unit: 'zona',
      values: out,
      colorScale: 'classes',
      classLabels: ['Favorable (I)', 'Moderado (II)', 'Restringido (III)', 'Crítico (IV)'],
    },
    countsByClass: {
      favorablePct: Math.round((c[0] / Math.max(n, 1)) * 1000) / 10,
      moderadoPct: Math.round((c[1] / Math.max(n, 1)) * 1000) / 10,
      restringidoPct: Math.round((c[2] / Math.max(n, 1)) * 1000) / 10,
      criticoPct: Math.round((c[3] / Math.max(n, 1)) * 1000) / 10,
    },
  };
}
