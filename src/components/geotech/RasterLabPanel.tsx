import React, { useMemo, useState } from 'react';
import {
  Grid3X3,
  Layers,
  Calculator,
  Play,
  Pause,
  RotateCcw,
  BarChart3,
  HardDrive,
} from 'lucide-react';
import {
  CrsCode,
  DemGrid,
  GisLayer,
  SUPPORTED_CRS,
  computeSlopeGrid,
  computeHydrologyD8AndTwi,
} from '../../utils/geotechEngine';
import {
  applyMapAlgebra,
  buildRasterPyramids,
  computeZonalStats,
  globalRasterLruCache,
  mosaicRasters,
  processRasterByBlocks,
  QueuedRasterTask,
  resampleAndReprojectRaster,
  ZonalStatRow,
} from '../../utils/rasterEngine2';
import { renderGridToDataUrl } from './GisMap2DCanvas';

interface RasterLabPanelProps {
  dem: DemGrid;
  layers: GisLayer[];
  generatedRasters: DemGrid[];
  onPublishRaster: (grid: DemGrid, summary: string, toolName: string) => void;
}

export const RasterLabPanel: React.FC<RasterLabPanelProps> = ({
  dem,
  layers,
  generatedRasters,
  onPublishRaster,
}) => {
  const [blockSize, setBlockSize] = useState<number>(8);
  const [blockOp, setBlockOp] = useState<'slope' | 'smooth' | 'relief' | 'normalize'>('slope');
  const [activePreview, setActivePreview] = useState<DemGrid | null>(null);
  const [blockMetrics, setBlockMetrics] = useState<string>('');

  // Map Algebra
  const [algebraExpr, setAlgebraExpr] = useState<string>('(dem * 0.05) + (slope * 1.2) + twi');
  const [algebraError, setAlgebraError] = useState<string>('');
  const [algebraMetrics, setAlgebraMetrics] = useState<string>('');

  // Reproject / Resample
  const [targetCols, setTargetCols] = useState<number>(48);
  const [targetCrs, setTargetCrs] = useState<CrsCode>('EPSG:32718');
  const [resampleMethod, setResampleMethod] = useState<'bilinear' | 'nearest'>('bilinear');

  // Zonal stats
  const polygonLayers = useMemo(
    () =>
      layers.filter(
        (l) =>
          l.geojson &&
          l.geojson.features.some(
            (f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
          )
      ),
    [layers]
  );
  const [zonalLayerId, setZonalLayerId] = useState<string>(polygonLayers[0]?.id || '');
  const [zonalRows, setZonalRows] = useState<ZonalStatRow[]>([]);

  // Checkpointed task queue
  const [queueTasks, setQueueTasks] = useState<QueuedRasterTask[]>([
    {
      id: 'tsk-1',
      label: 'Bloques 8×8 Pendiente + Halo',
      operation: 'slope',
      status: 'pendiente',
      progressPct: 0,
      checkpointBlock: 0,
      totalBlocks: Math.ceil(dem.rows / 8) * Math.ceil(dem.cols / 8),
    },
    {
      id: 'tsk-2',
      label: 'Suavizado Ráster Gauss-Mean',
      operation: 'smooth',
      status: 'pendiente',
      progressPct: 0,
      checkpointBlock: 0,
      totalBlocks: Math.ceil(dem.rows / 8) * Math.ceil(dem.cols / 8),
    },
  ]);

  const pyramids = useMemo(() => buildRasterPyramids(activePreview || dem), [activePreview, dem]);
  const [selectedPyrLevel, setSelectedPyrLevel] = useState<number>(0);

  const displayGrid = pyramids[selectedPyrLevel]?.grid || activePreview || dem;
  const previewUrl = useMemo(() => renderGridToDataUrl(displayGrid), [displayGrid]);
  const cacheStats = globalRasterLruCache.getStats();

  const handleRunBlockProcess = () => {
    const cacheKey = `${dem.id}:${blockOp}:${blockSize}`;
    const cached = globalRasterLruCache.get(cacheKey);
    if (cached) {
      setActivePreview(cached);
      setBlockMetrics(`Recuperado instantáneamente desde caché LRU (${cached.cols}×${cached.rows}).`);
      return;
    }

    const res = processRasterByBlocks(dem, blockSize, blockOp);
    globalRasterLruCache.set(cacheKey, res.grid);
    setActivePreview(res.grid);
    setBlockMetrics(
      `${res.blocksProcessed} bloques de ${res.blockSize}×${res.blockSize} (${res.haloCellsRead} celdas c/halo) · ${res.elapsedMs} ms · Buffer pico ${Math.round(res.peakTileBytes / 1024 * 10) / 10} KB.`
    );
    onPublishRaster(res.grid, `Procesamiento por bloques ${blockOp}: ${res.blocksProcessed} tiles.`, 'Motor Ráster Bloques 2.0');
  };

  const handleRunMapAlgebra = () => {
    setAlgebraError('');
    try {
      const slope = computeSlopeGrid(dem).grid;
      const twi = computeHydrologyD8AndTwi(dem).twiGrid;
      const res = applyMapAlgebra(algebraExpr, dem, { slope, twi });
      setActivePreview(res.grid);
      setAlgebraMetrics(
        `Mín: ${res.min} | Media: ${res.mean} | Máx: ${res.max} | Celdas > 0: ${res.activeCellsPct}%`
      );
      onPublishRaster(
        res.grid,
        `Álgebra de Mapas "${algebraExpr}": media ${res.mean}, rango [${res.min}, ${res.max}].`,
        'Álgebra de Mapas 2.0'
      );
    } catch (err: any) {
      setAlgebraError(err.message || 'Error en fórmula ráster.');
    }
  };

  const handleRunResample = () => {
    const res = resampleAndReprojectRaster(dem, targetCols, targetCols, targetCrs, resampleMethod);
    setActivePreview(res.grid);
    onPublishRaster(
      res.grid,
      `Remuestreo ${resampleMethod} a ${targetCols}×${targetCols} (${res.grid.cellSizeMeters} m/celda). Centro ${targetCrs}: [${res.projectedCenter[0].toFixed(1)}, ${res.projectedCenter[1].toFixed(1)}].`,
      'Remuestreo & Reproyección Ráster'
    );
  };

  const handleRunMosaic = () => {
    const pool = [dem, ...generatedRasters.slice(0, 2)];
    const m = mosaicRasters(pool, 'mean');
    setActivePreview(m);
    onPublishRaster(m, `Mosaico ráster fusionando ${pool.length} grillas por promedio espacial.`, 'Mosaico Ráster');
  };

  const handleRunZonal = () => {
    const lyr = polygonLayers.find((l) => l.id === zonalLayerId) || polygonLayers[0];
    if (!lyr?.geojson) return;
    const rows = computeZonalStats(activePreview || dem, lyr.geojson);
    setZonalRows(rows);
  };

  const handleAdvanceOrResumeTask = (taskId: string, action: 'step' | 'pause' | 'complete') => {
    setQueueTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        if (action === 'pause') {
          return {
            ...t,
            status: 'pausada_checkpoint',
            checkpointBlock: Math.max(1, Math.floor(t.totalBlocks / 2)),
            progressPct: 50,
          };
        }
        const res = processRasterByBlocks(dem, blockSize, t.operation);
        globalRasterLruCache.set(`${dem.id}:${t.operation}:${blockSize}`, res.grid);
        setActivePreview(res.grid);
        return {
          ...t,
          status: 'completada',
          checkpointBlock: t.totalBlocks,
          progressPct: 100,
        };
      })
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Block/Halo Processor + Pyramids + Map Algebra */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Grid3X3 className="w-4 h-4 text-emerald-700" />
                <span>Motor Ráster por Bloques / Tiles con Halo &amp; Pirámides</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                Caché LRU: {cacheStats.entries}/{cacheStats.maxEntries} · Hits {cacheStats.hits} ({cacheStats.hitRatePct}%)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                value={blockOp}
                onChange={(e) => setBlockOp(e.target.value as any)}
                aria-label="Operación por bloques"
                className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
              >
                <option value="slope">Pendiente Horn por Bloques</option>
                <option value="smooth">Filtro Suavizado 3×3</option>
                <option value="relief">Relieve Local 3×3</option>
                <option value="normalize">Normalizar 0–100%</option>
              </select>

              <select
                value={blockSize}
                onChange={(e) => setBlockSize(Number(e.target.value))}
                aria-label="Tamaño de bloque"
                className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
              >
                <option value={4}>Bloques 4×4 celdas</option>
                <option value={8}>Bloques 8×8 celdas</option>
                <option value={16}>Bloques 16×16 celdas</option>
              </select>

              <button
                type="button"
                onClick={handleRunBlockProcess}
                className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Procesar Bloques</span>
              </button>
            </div>

            {blockMetrics && (
              <p className="text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                {blockMetrics}
              </p>
            )}
          </div>

          {/* Safe Map Algebra */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-indigo-700" />
              <span>Calculadora Segura de Álgebra de Mapas (Sin eval)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Variables disponibles: <code>dem</code> (elevación msnm), <code>slope</code> (pendiente °), <code>twi</code> (humedad D8). Funciones: <code>min, max, abs, sqrt, log, pow</code>.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={algebraExpr}
                onChange={(e) => setAlgebraExpr(e.target.value)}
                aria-label="Fórmula de álgebra de mapas"
                className="flex-1 min-w-[220px] px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
              />
              <button
                type="button"
                onClick={handleRunMapAlgebra}
                className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Evaluar Expresión
              </button>
            </div>
            {algebraError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                {algebraError}
              </p>
            )}
            {algebraMetrics && (
              <p className="text-[11px] font-mono text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                {algebraMetrics}
              </p>
            )}
          </div>

          {/* Reprojection / Resampling & Mosaic */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-700" />
              <span>Remuestreo, Reproyección CRS &amp; Mosaico Ráster</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <select
                value={targetCols}
                onChange={(e) => setTargetCols(Number(e.target.value))}
                className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
              >
                <option value={24}>Malla 24×24</option>
                <option value={48}>Malla 48×48</option>
                <option value={64}>Malla 64×64</option>
              </select>
              <select
                value={resampleMethod}
                onChange={(e) => setResampleMethod(e.target.value as 'bilinear' | 'nearest')}
                className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
              >
                <option value="bilinear">Interpolación Bilineal</option>
                <option value="nearest">Vecino Más Cercano</option>
              </select>
              <select
                value={targetCrs}
                onChange={(e) => setTargetCrs(e.target.value as CrsCode)}
                className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
              >
                {SUPPORTED_CRS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRunResample}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Remuestrear
              </button>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500">
                Fusión espacial de DEM base y rásters derivados ({1 + generatedRasters.slice(0, 2).length} grillas).
              </span>
              <button
                type="button"
                onClick={handleRunMosaic}
                className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Generar Mosaico
              </button>
            </div>
          </div>
        </div>

        {/* Right: Preview + Overview Pyramids + Checkpointed Queue */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Vista Piramidal ({displayGrid.cols}×{displayGrid.rows})
              </h4>
              <div className="flex gap-1">
                {pyramids.map((pyr) => (
                  <button
                    key={pyr.level}
                    type="button"
                    onClick={() => setSelectedPyrLevel(pyr.level)}
                    className={`px-2 py-1 rounded text-[10px] font-mono font-bold cursor-pointer ${
                      selectedPyrLevel === pyr.level
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    1/{pyr.factor}×
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-950 rounded-lg p-3 flex items-center justify-center">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt={displayGrid.name}
                  className="w-full max-w-[300px] aspect-square object-contain rounded border border-slate-800"
                  style={{ imageRendering: 'pixelated' }}
                />
              )}
            </div>
            <p className="text-[11px] text-slate-600 font-mono">{displayGrid.name}</p>
          </div>

          {/* Checkpointed Queue */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-slate-700" />
              <span>Cola Ráster con Puntos de Control (Checkpoints)</span>
            </h4>
            <div className="space-y-2">
              {queueTasks.map((t) => (
                <div key={t.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{t.label}</span>
                    <span className="font-mono text-[10px] text-slate-600">
                      {t.checkpointBlock}/{t.totalBlocks} bloques ({t.progressPct}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-600" style={{ width: `${t.progressPct}%` }} />
                  </div>
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-[10px] font-mono uppercase text-slate-500">{t.status}</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAdvanceOrResumeTask(t.id, 'pause')}
                        className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded text-[10px] font-semibold cursor-pointer"
                      >
                        <Pause className="w-2.5 h-2.5 inline mr-0.5" />
                        Pausar 50%
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdvanceOrResumeTask(t.id, 'complete')}
                        className="px-2 py-0.5 bg-emerald-700 text-white rounded text-[10px] font-semibold cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5 inline mr-0.5" />
                        {t.status === 'pausada_checkpoint' ? 'Reanudar' : 'Ejecutar'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Zonal Statistics Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-700" />
              <span>Estadísticas Zonales Ráster sobre Polígonos</span>
            </h3>
            <p className="text-xs text-slate-500">
              Calcula Mín, Máx, Media, Desviación Estándar y Suma del ráster activo dentro de cada polígono de gestión.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={zonalLayerId}
              onChange={(e) => setZonalLayerId(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
            >
              {polygonLayers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRunZonal}
              disabled={polygonLayers.length === 0}
              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              Calcular Zonal
            </button>
          </div>
        </div>

        {zonalRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                  <th className="py-2 pr-3">Polígono / Zona</th>
                  <th className="py-2 px-3 text-right">Celdas</th>
                  <th className="py-2 px-3 text-right">Área (ha)</th>
                  <th className="py-2 px-3 text-right">Mín</th>
                  <th className="py-2 px-3 text-right">Media</th>
                  <th className="py-2 px-3 text-right">Máx</th>
                  <th className="py-2 pl-3 text-right">Desv. Est.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {zonalRows.map((r, idx) => (
                  <tr key={idx}>
                    <td className="py-2 pr-3 font-semibold text-slate-800">{r.zoneName}</td>
                    <td className="py-2 px-3 text-right font-mono">{r.cellCount}</td>
                    <td className="py-2 px-3 text-right font-mono">{r.areaHa}</td>
                    <td className="py-2 px-3 text-right font-mono">{r.min}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">{r.mean}</td>
                    <td className="py-2 px-3 text-right font-mono">{r.max}</td>
                    <td className="py-2 pl-3 text-right font-mono">{r.stdDev}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
