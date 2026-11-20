import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import {
  CrsCode,
  DemGrid,
  GeoFeatureCollection,
  projectCoordinate,
} from './geotechEngine';

// =========================================================
// 1. SAFE RECURSIVE-DESCENT MAP ALGEBRA EXPRESSION PARSER
// =========================================================

type Token =
  | { type: 'num'; value: number }
  | { type: 'id'; value: string }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma' };

function tokenizeFormula(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        numStr += expr[i++];
      }
      const val = Number(numStr);
      if (!Number.isFinite(val)) throw new Error(`Número inválido en expresión: "${numStr}"`);
      tokens.push({ type: 'num', value: val });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let id = '';
      while (i < expr.length && /[A-Za-z0-9_]/.test(expr[i])) {
        id += expr[i++];
      }
      tokens.push({ type: 'id', value: id });
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }
    const twoChar = expr.slice(i, i + 2);
    if (['>=', '<=', '==', '!='].includes(twoChar)) {
      tokens.push({ type: 'op', value: twoChar });
      i += 2;
      continue;
    }
    if ('+-*/^><'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    throw new Error(`Carácter no permitido en Álgebra de Mapas: "${ch}"`);
  }
  return tokens;
}

export function evaluateMapAlgebraExpression(
  expression: string,
  variables: Record<string, number>
): number {
  const tokens = tokenizeFormula(expression);
  if (tokens.length === 0) throw new Error('La expresión de Álgebra de Mapas está vacía.');
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const consume = (): Token => tokens[pos++];

  function parseComparison(): number {
    let left = parseAddSub();
    while (peek()?.type === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes((peek() as any).value)) {
      const op = (consume() as any).value;
      const right = parseAddSub();
      if (op === '>') left = left > right ? 1 : 0;
      else if (op === '<') left = left < right ? 1 : 0;
      else if (op === '>=') left = left >= right ? 1 : 0;
      else if (op === '<=') left = left <= right ? 1 : 0;
      else if (op === '==') left = Math.abs(left - right) < 1e-9 ? 1 : 0;
      else if (op === '!=') left = Math.abs(left - right) >= 1e-9 ? 1 : 0;
    }
    return left;
  }

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (peek()?.type === 'op' && ['+', '-'].includes((peek() as any).value)) {
      const op = (consume() as any).value;
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv(): number {
    let left = parsePow();
    while (peek()?.type === 'op' && ['*', '/'].includes((peek() as any).value)) {
      const op = (consume() as any).value;
      const right = parsePow();
      if (op === '/') left = Math.abs(right) < 1e-9 ? 0 : left / right;
      else left = left * right;
    }
    return left;
  }

  function parsePow(): number {
    const base = parseUnary();
    if (peek()?.type === 'op' && (peek() as any).value === '^') {
      consume();
      const exp = parsePow();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    if (peek()?.type === 'op' && ((peek() as any).value === '-' || (peek() as any).value === '+')) {
      const op = (consume() as any).value;
      const v = parseUnary();
      return op === '-' ? -v : v;
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const tok = peek();
    if (!tok) throw new Error('Expresión incompleta al final de la fórmula.');

    if (tok.type === 'num') {
      consume();
      return tok.value;
    }

    if (tok.type === 'paren' && tok.value === '(') {
      consume();
      const val = parseComparison();
      const closing = consume();
      if (!closing || closing.type !== 'paren' || closing.value !== ')') {
        throw new Error('Falta paréntesis de cierre ")".');
      }
      return val;
    }

    if (tok.type === 'id') {
      consume();
      const next = peek();
      if (next?.type === 'paren' && next.value === '(') {
        consume(); // '('
        const args: number[] = [];
        if (!(peek()?.type === 'paren' && (peek() as any).value === ')')) {
          args.push(parseComparison());
          while (peek()?.type === 'comma') {
            consume();
            args.push(parseComparison());
          }
        }
        const closing = consume();
        if (!closing || closing.type !== 'paren' || closing.value !== ')') {
          throw new Error(`Paréntesis de cierre esperado en función "${tok.value}".`);
        }
        const fn = tok.value.toLowerCase();
        if (fn === 'abs') return Math.abs(args[0] ?? 0);
        if (fn === 'sqrt') return Math.sqrt(Math.max(0, args[0] ?? 0));
        if (fn === 'log') return Math.log(Math.max(1e-9, args[0] ?? 1));
        if (fn === 'min') return Math.min(...args);
        if (fn === 'max') return Math.max(...args);
        if (fn === 'pow') return Math.pow(args[0] ?? 0, args[1] ?? 1);
        throw new Error(`Función no soportada en Álgebra de Mapas: "${tok.value}"`);
      }

      const keyLower = tok.value.toLowerCase();
      if (tok.value in variables) return variables[tok.value];
      if (keyLower in variables) return variables[keyLower];
      throw new Error(`Variable o banda ráster desconocida: "${tok.value}"`);
    }

    throw new Error('Token inesperado en expresión.');
  }

  const result = parseComparison();
  if (pos < tokens.length) {
    throw new Error('Sobran símbolos o paréntesis sin emparejar en la fórmula.');
  }
  return Number.isFinite(result) ? result : 0;
}

export function applyMapAlgebra(
  expression: string,
  baseDem: DemGrid,
  namedRasters: Record<string, DemGrid>
): {
  grid: DemGrid;
  min: number;
  max: number;
  mean: number;
  activeCellsPct: number;
} {
  // Validate expression syntax once upfront before running over grid
  const n = baseDem.rows * baseDem.cols;
  const values = new Array<number>(n);
  const rasterEntries = Object.entries(namedRasters);

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let activeCount = 0;

  for (let i = 0; i < n; i++) {
    const vars: Record<string, number> = {
      dem: baseDem.values[i] ?? 0,
      z: baseDem.values[i] ?? 0,
    };
    for (const [key, grid] of rasterEntries) {
      vars[key] = grid.values[i] ?? 0;
    }
    const raw = evaluateMapAlgebraExpression(expression, vars);
    const val = Math.round(raw * 1000) / 1000;
    values[i] = val;
    if (val < min) min = val;
    if (val > max) max = val;
    sum += val;
    if (val > 0) activeCount++;
  }

  return {
    grid: {
      ...baseDem,
      id: `alg-${Date.now()}`,
      name: `Álgebra de Mapas (${expression.slice(0, 36)})`,
      unit: 'índice',
      values,
      colorScale: 'suitability',
    },
    min: Math.round(min * 1000) / 1000,
    max: Math.round(max * 1000) / 1000,
    mean: Math.round((sum / Math.max(n, 1)) * 1000) / 1000,
    activeCellsPct: Math.round((activeCount / Math.max(n, 1)) * 1000) / 10,
  };
}

// =========================================================
// 2. TILE / BLOCK PROCESSING WITH HALO & OVERVIEW PYRAMIDS
// =========================================================

export interface BlockProcessingResult {
  grid: DemGrid;
  blockSize: number;
  blocksProcessed: number;
  haloCellsRead: number;
  elapsedMs: number;
  peakTileBytes: number;
}

export function processRasterByBlocks(
  grid: DemGrid,
  blockSize: number = 8,
  operation: 'smooth' | 'slope' | 'relief' | 'normalize'
): BlockProcessingResult {
  const t0 = performance.now();
  const bs = Math.max(4, Math.min(32, Math.floor(blockSize)));
  const out = new Array<number>(grid.rows * grid.cols);

  const readHaloCell = (r: number, c: number) => {
    const cr = Math.max(0, Math.min(grid.rows - 1, r));
    const cc = Math.max(0, Math.min(grid.cols - 1, c));
    return grid.values[cr * grid.cols + cc];
  };

  let minVal = Infinity;
  let maxVal = -Infinity;
  if (operation === 'normalize') {
    for (const v of grid.values) {
      if (v !== grid.noData) {
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }
  }
  const span = Math.max(maxVal - minVal, 1e-6);

  let blocksProcessed = 0;
  let haloCellsRead = 0;
  const tileHaloDim = bs + 2;
  const peakTileBytes = tileHaloDim * tileHaloDim * 8; // Float64 tile buffer

  for (let br = 0; br < grid.rows; br += bs) {
    const rEnd = Math.min(grid.rows, br + bs);
    for (let bc = 0; bc < grid.cols; bc += bs) {
      const cEnd = Math.min(grid.cols, bc + bs);
      blocksProcessed++;

      // Load tile + 1-cell halo
      const haloH = rEnd - br + 2;
      const haloW = cEnd - bc + 2;
      const tile = new Float64Array(haloH * haloW);
      for (let hr = 0; hr < haloH; hr++) {
        for (let hc = 0; hc < haloW; hc++) {
          tile[hr * haloW + hc] = readHaloCell(br + hr - 1, bc + hc - 1);
          haloCellsRead++;
        }
      }

      const getTile = (tr: number, tc: number) => tile[(tr + 1) * haloW + (tc + 1)];

      for (let r = br; r < rEnd; r++) {
        const tr = r - br;
        for (let c = bc; c < cEnd; c++) {
          const tc = c - bc;
          const idx = r * grid.cols + c;

          if (operation === 'smooth') {
            let sum = 0;
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                sum += getTile(tr + dr, tc + dc);
              }
            }
            out[idx] = Math.round((sum / 9) * 100) / 100;
          } else if (operation === 'slope') {
            const a = getTile(tr - 1, tc - 1);
            const b = getTile(tr - 1, tc);
            const d = getTile(tr - 1, tc + 1);
            const e = getTile(tr, tc - 1);
            const f = getTile(tr, tc + 1);
            const g = getTile(tr + 1, tc - 1);
            const h = getTile(tr + 1, tc);
            const i = getTile(tr + 1, tc + 1);
            const dzdx = (d + 2 * f + i - (a + 2 * e + g)) / (8 * grid.cellSizeMeters);
            const dzdy = (g + 2 * h + i - (a + 2 * b + d)) / (8 * grid.cellSizeMeters);
            const deg = (Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180) / Math.PI;
            out[idx] = Math.round(deg * 100) / 100;
          } else if (operation === 'relief') {
            let lMin = Infinity;
            let lMax = -Infinity;
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const v = getTile(tr + dr, tc + dc);
                if (v < lMin) lMin = v;
                if (v > lMax) lMax = v;
              }
            }
            out[idx] = Math.round((lMax - lMin) * 100) / 100;
          } else {
            const val = getTile(tr, tc);
            out[idx] = Math.round(((val - minVal) / span) * 1000) / 10; // 0..100%
          }
        }
      }
    }
  }

  const labelByOp: Record<string, string> = {
    smooth: 'Filtro Suavizado por Bloques',
    slope: 'Pendiente por Bloques (Halo 1px)',
    relief: 'Relieve Local 3×3 por Bloques',
    normalize: 'Normalización 0–100% por Bloques',
  };

  return {
    grid: {
      ...grid,
      id: `blk-${operation}-${Date.now()}`,
      name: `${labelByOp[operation]} — ${grid.name}`,
      unit: operation === 'slope' ? 'grados' : operation === 'normalize' ? '%' : grid.unit,
      values: out,
      colorScale: operation === 'slope' || operation === 'relief' ? 'slope' : grid.colorScale,
    },
    blockSize: bs,
    blocksProcessed,
    haloCellsRead,
    elapsedMs: Math.max(1, Math.round((performance.now() - t0) * 100) / 100),
    peakTileBytes,
  };
}

export interface RasterPyramidLevel {
  level: number;
  factor: number;
  cols: number;
  rows: number;
  cellCount: number;
  grid: DemGrid;
}

export function buildRasterPyramids(grid: DemGrid): RasterPyramidLevel[] {
  const levels: RasterPyramidLevel[] = [
    {
      level: 0,
      factor: 1,
      cols: grid.cols,
      rows: grid.rows,
      cellCount: grid.cols * grid.rows,
      grid,
    },
  ];

  let prev = grid;
  for (let lvl = 1; lvl <= 2; lvl++) {
    const newCols = Math.max(4, Math.floor(prev.cols / 2));
    const newRows = Math.max(4, Math.floor(prev.rows / 2));
    const vals = new Array<number>(newCols * newRows);
    for (let r = 0; r < newRows; r++) {
      for (let c = 0; c < newCols; c++) {
        const sr = Math.min(prev.rows - 1, r * 2);
        const sc = Math.min(prev.cols - 1, c * 2);
        const samples = [
          prev.values[sr * prev.cols + sc],
          prev.values[sr * prev.cols + Math.min(prev.cols - 1, sc + 1)],
          prev.values[Math.min(prev.rows - 1, sr + 1) * prev.cols + sc],
          prev.values[Math.min(prev.rows - 1, sr + 1) * prev.cols + Math.min(prev.cols - 1, sc + 1)],
        ].filter((v) => v !== prev.noData && Number.isFinite(v));
        vals[r * newCols + c] =
          samples.length > 0
            ? Math.round((samples.reduce((s, x) => s + x, 0) / samples.length) * 100) / 100
            : prev.noData;
      }
    }
    const factor = Math.pow(2, lvl);
    const levelGrid: DemGrid = {
      ...prev,
      id: `${grid.id}-ovr-${factor}x`,
      name: `${grid.name} (Overview 1/${factor})`,
      cols: newCols,
      rows: newRows,
      cellSizeMeters: prev.cellSizeMeters * 2,
      values: vals,
    };
    levels.push({
      level: lvl,
      factor,
      cols: newCols,
      rows: newRows,
      cellCount: newCols * newRows,
      grid: levelGrid,
    });
    prev = levelGrid;
  }

  return levels;
}

// =========================================================
// 3. REPROJECTION, RESAMPLING, MOSAIC & ZONAL STATISTICS
// =========================================================

export function resampleAndReprojectRaster(
  grid: DemGrid,
  targetCols: number,
  targetRows: number,
  targetCrs: CrsCode,
  method: 'nearest' | 'bilinear' = 'bilinear'
): {
  grid: DemGrid;
  projectedCenter: [number, number];
} {
  const cols = Math.max(8, Math.min(96, targetCols));
  const rows = Math.max(8, Math.min(96, targetRows));
  const [minLng, minLat, maxLng, maxLat] = grid.bounds;
  const out = new Array<number>(cols * rows);

  for (let r = 0; r < rows; r++) {
    const ny = (r + 0.5) / rows;
    const srcR = ny * (grid.rows - 1);
    const r0 = Math.floor(srcR);
    const r1 = Math.min(grid.rows - 1, r0 + 1);
    const ty = srcR - r0;

    for (let c = 0; c < cols; c++) {
      const nx = (c + 0.5) / cols;
      const srcC = nx * (grid.cols - 1);
      if (method === 'nearest') {
        const nr = Math.round(srcR);
        const nc = Math.round(srcC);
        out[r * cols + c] = grid.values[nr * grid.cols + nc];
      } else {
        const c0 = Math.floor(srcC);
        const c1 = Math.min(grid.cols - 1, c0 + 1);
        const tx = srcC - c0;
        const v00 = grid.values[r0 * grid.cols + c0];
        const v10 = grid.values[r0 * grid.cols + c1];
        const v01 = grid.values[r1 * grid.cols + c0];
        const v11 = grid.values[r1 * grid.cols + c1];
        const v0 = v00 * (1 - tx) + v10 * tx;
        const v1 = v01 * (1 - tx) + v11 * tx;
        out[r * cols + c] = Math.round((v0 * (1 - ty) + v1 * ty) * 100) / 100;
      }
    }
  }

  const center4326: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  const projectedCenter = projectCoordinate(center4326, 'EPSG:4326', targetCrs);
  const widthM = turf.distance([minLng, center4326[1]], [maxLng, center4326[1]], { units: 'meters' });

  return {
    grid: {
      ...grid,
      id: `resamp-${Date.now()}`,
      name: `${grid.name} (${cols}×${rows} · ${method} · ${targetCrs})`,
      cols,
      rows,
      cellSizeMeters: Math.max(5, Math.round(widthM / cols)),
      crs: 'EPSG:4326', // Web canvas & Leaflet map bounds always remain WGS84 for display; targetCrs recorded in metadata/center
      values: out,
    },
    projectedCenter,
  };
}

export function mosaicRasters(
  grids: DemGrid[],
  blend: 'mean' | 'max' | 'first' = 'mean'
): DemGrid {
  if (grids.length === 0) throw new Error('Se requiere al menos un ráster para generar mosaico.');
  if (grids.length === 1) return grids[0];

  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const g of grids) {
    minLng = Math.min(minLng, g.bounds[0]);
    minLat = Math.min(minLat, g.bounds[1]);
    maxLng = Math.max(maxLng, g.bounds[2]);
    maxLat = Math.max(maxLat, g.bounds[3]);
  }

  const cols = grids[0].cols;
  const rows = grids[0].rows;
  const out = new Array<number>(cols * rows);

  for (let r = 0; r < rows; r++) {
    const lat = maxLat - ((r + 0.5) / rows) * (maxLat - minLat);
    for (let c = 0; c < cols; c++) {
      const lng = minLng + ((c + 0.5) / cols) * (maxLng - minLng);
      const hits: number[] = [];
      for (const g of grids) {
        const [gx0, gy0, gx1, gy1] = g.bounds;
        if (lng >= gx0 && lng <= gx1 && lat >= gy0 && lat <= gy1) {
          const gc = Math.min(g.cols - 1, Math.max(0, Math.floor(((lng - gx0) / Math.max(gx1 - gx0, 1e-9)) * g.cols)));
          const gr = Math.min(g.rows - 1, Math.max(0, Math.floor(((gy1 - lat) / Math.max(gy1 - gy0, 1e-9)) * g.rows)));
          const v = g.values[gr * g.cols + gc];
          if (v !== g.noData && Number.isFinite(v)) hits.push(v);
        }
      }
      if (hits.length === 0) {
        out[r * cols + c] = grids[0].noData;
      } else if (blend === 'first') {
        out[r * cols + c] = hits[0];
      } else if (blend === 'max') {
        out[r * cols + c] = Math.max(...hits);
      } else {
        out[r * cols + c] = Math.round((hits.reduce((s, x) => s + x, 0) / hits.length) * 100) / 100;
      }
    }
  }

  const centerLat = (minLat + maxLat) / 2;
  const widthM = turf.distance([minLng, centerLat], [maxLng, centerLat], { units: 'meters' });
  return {
    id: `mosaic-${Date.now()}`,
    name: `Mosaico Ráster (${grids.length} escenas · ${blend})`,
    cols,
    rows,
    cellSizeMeters: Math.max(5, Math.round(widthM / cols)),
    bounds: [minLng, minLat, maxLng, maxLat],
    crs: 'EPSG:4326',
    noData: grids[0].noData,
    unit: grids[0].unit,
    values: out,
    colorScale: grids[0].colorScale || 'elevation',
  };
}

export interface ZonalStatRow {
  zoneName: string;
  cellCount: number;
  areaHa: number;
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  sum: number;
}

export function computeZonalStats(
  grid: DemGrid,
  polygonsFc: GeoFeatureCollection
): ZonalStatRow[] {
  const polys = polygonsFc.features.filter(
    (f): f is Feature<Polygon | MultiPolygon, Record<string, any>> =>
      f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
  );
  if (polys.length === 0) {
    throw new Error('Las Estadísticas Zonales requieren una capa vectorial con polígonos.');
  }

  const [minLng, minLat, maxLng, maxLat] = grid.bounds;
  const dx = (maxLng - minLng) / grid.cols;
  const dy = (maxLat - minLat) / grid.rows;
  const cellAreaHa = (grid.cellSizeMeters * grid.cellSizeMeters) / 10000;

  return polys.map((poly, idx) => {
    const zoneName = String(poly.properties?.name || poly.properties?.nombre || `Zona ${idx + 1}`);
    const samples: number[] = [];

    for (let r = 0; r < grid.rows; r++) {
      const lat = maxLat - (r + 0.5) * dy;
      for (let c = 0; c < grid.cols; c++) {
        const lng = minLng + (c + 0.5) * dx;
        if (turf.booleanPointInPolygon([lng, lat], poly)) {
          const val = grid.values[r * grid.cols + c];
          if (val !== grid.noData && Number.isFinite(val)) {
            samples.push(val);
          }
        }
      }
    }

    if (samples.length === 0) {
      return { zoneName, cellCount: 0, areaHa: 0, min: 0, max: 0, mean: 0, stdDev: 0, sum: 0 };
    }

    const sum = samples.reduce((s, x) => s + x, 0);
    const mean = sum / samples.length;
    const variance = samples.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / samples.length;
    return {
      zoneName,
      cellCount: samples.length,
      areaHa: Math.round(samples.length * cellAreaHa * 100) / 100,
      min: Math.round(Math.min(...samples) * 100) / 100,
      max: Math.round(Math.max(...samples) * 100) / 100,
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
      sum: Math.round(sum * 100) / 100,
    };
  });
}

// =========================================================
// 4. RASTER LRU CACHE & CHECKPOINTED TASK QUEUE
// =========================================================

export class RasterLruCache {
  private maxEntries: number;
  private store = new Map<string, DemGrid>();
  private hits = 0;
  private misses = 0;

  constructor(maxEntries: number = 12) {
    this.maxEntries = Math.max(2, maxEntries);
  }

  get(key: string): DemGrid | undefined {
    const item = this.store.get(key);
    if (!item) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    // refresh recency
    this.store.delete(key);
    this.store.set(key, item);
    return item;
  }

  set(key: string, grid: DemGrid): void {
    if (this.store.has(key)) this.store.delete(key);
    else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, grid);
  }

  clear(): void {
    this.store.clear();
  }

  getStats() {
    let estimatedBytes = 0;
    this.store.forEach((g) => {
      estimatedBytes += g.values.length * 8;
    });
    return {
      entries: this.store.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRatePct:
        this.hits + this.misses > 0
          ? Math.round((this.hits / (this.hits + this.misses)) * 1000) / 10
          : 0,
      estimatedKb: Math.round((estimatedBytes / 1024) * 10) / 10,
    };
  }
}

export interface QueuedRasterTask {
  id: string;
  label: string;
  operation: 'smooth' | 'slope' | 'relief' | 'normalize';
  status: 'pendiente' | 'en_progreso' | 'pausada_checkpoint' | 'completada';
  progressPct: number;
  checkpointBlock: number;
  totalBlocks: number;
}

export const globalRasterLruCache = new RasterLruCache(16);
