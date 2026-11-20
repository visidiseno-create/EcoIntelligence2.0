import React, { useMemo, useState } from 'react';
import {
  Satellite,
  Layers,
  ArrowRightLeft,
  Cpu,
  CheckCircle2,
  Search,
  Sparkles,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  SpectralScene,
  DemGrid,
  computeSpectralChange,
  classifyLandCoverKMeans,
} from '../../utils/geotechEngine';
import {
  applyDos1AtmosphericAndCloudMask,
  computeCustomSpectralFormula,
  computeExtendedSpectralIndex,
  ExtendedSpectralIndex,
  renderSpectralCompositeDataUrl,
  runSupervisedClassificationAndValidate,
  SPECTRAL_INDEX_CATALOG,
  SpectralCompositeMode,
} from '../../utils/spectralEngine2';
import { renderGridToDataUrl } from './GisMap2DCanvas';
import { api } from '../../services/api';

interface SpectralLabPanelProps {
  scene?: SpectralScene;
  fallbackBounds?: [number, number, number, number];
  onPublishRaster: (grid: DemGrid, summary: string, toolName: string) => void;
}

export const SpectralLabPanel: React.FC<SpectralLabPanelProps> = ({
  scene,
  fallbackBounds,
  onPublishRaster,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<ExtendedSpectralIndex>('NDVI');
  const [dateSlot, setDateSlot] = useState<'t1' | 't2'>('t2');
  const [analysisMode, setAnalysisMode] = useState<
    'index' | 'composite' | 'change' | 'kmeans' | 'supervised' | 'custom'
  >('index');
  const [applyDos1, setApplyDos1] = useState<boolean>(false);
  const [compositeMode, setCompositeMode] = useState<SpectralCompositeMode>('false_color_nir');
  const [customFormula, setCustomFormula] = useState<string>('(nir - swir1) / (nir + swir1)');
  const [customError, setCustomError] = useState<string>('');

  // Live STAC Catalog Search state
  const [stacLoading, setStacLoading] = useState<boolean>(false);
  const [stacError, setStacError] = useState<string>('');
  const [stacProvider, setStacProvider] = useState<string>('');
  const [stacItems, setStacItems] = useState<
    Array<{
      id: string;
      collection: string;
      datetime: string;
      cloudCover: number | null;
      platform: string;
      bbox: [number, number, number, number];
      thumbnailUrl?: string;
    }>
  >([]);

  const dos1Result = useMemo(() => {
    if (!scene || !applyDos1) return null;
    return applyDos1AtmosphericAndCloudMask(scene, dateSlot, 0.24);
  }, [scene, dateSlot, applyDos1]);

  const effectiveScene = dos1Result ? dos1Result.correctedScene : scene;

  const computedIndex = useMemo(() => {
    if (!effectiveScene) return null;
    return computeExtendedSpectralIndex(effectiveScene, dateSlot, selectedIndex);
  }, [effectiveScene, dateSlot, selectedIndex]);

  const computedChange = useMemo(() => {
    if (!effectiveScene) return null;
    // Map extended index cleanly when supported in 1.0 or diff two extended grids directly
    const r1 = computeExtendedSpectralIndex(effectiveScene, 't1', selectedIndex);
    const r2 = computeExtendedSpectralIndex(effectiveScene, 't2', selectedIndex);
    const n = r1.grid.values.length;
    const deltaVals = new Array<number>(n);
    let sumDelta = 0,
      lossCount = 0,
      gainCount = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.round((r2.grid.values[i] - r1.grid.values[i]) * 1000) / 1000;
      deltaVals[i] = d;
      sumDelta += d;
      if (d <= -0.1) lossCount++;
      else if (d >= 0.1) gainCount++;
    }
    return {
      deltaGrid: {
        ...r2.grid,
        id: `delta2-${selectedIndex}-${Date.now()}`,
        name: `Cambio Multitemporal Δ${selectedIndex} (${effectiveScene.t1.date} → ${effectiveScene.t2.date})`,
        unit: `Δ${selectedIndex}`,
        values: deltaVals,
        colorScale: 'thermal' as const,
      },
      t1Grid: r1.grid,
      t2Grid: r2.grid,
      meanDelta: Math.round((sumDelta / n) * 1000) / 1000,
      significantLossPct: Math.round((lossCount / n) * 1000) / 10,
      significantGainPct: Math.round((gainCount / n) * 1000) / 10,
      unchangedPct: Math.round(((n - lossCount - gainCount) / n) * 1000) / 10,
    };
  }, [effectiveScene, selectedIndex]);

  const computedKMeans = useMemo(() => {
    if (!effectiveScene) return null;
    return classifyLandCoverKMeans(effectiveScene, dateSlot);
  }, [effectiveScene, dateSlot]);

  const computedSupervised = useMemo(() => {
    if (!effectiveScene) return null;
    return runSupervisedClassificationAndValidate(effectiveScene, dateSlot);
  }, [effectiveScene, dateSlot]);

  const computedCustom = useMemo(() => {
    if (!effectiveScene || analysisMode !== 'custom') return null;
    try {
      setCustomError('');
      return computeCustomSpectralFormula(effectiveScene, dateSlot, customFormula);
    } catch (err: any) {
      setCustomError(err.message || 'Error de sintaxis en fórmula espectral.');
      return null;
    }
  }, [effectiveScene, dateSlot, analysisMode, customFormula]);

  const compositeUrl = useMemo(() => {
    if (!effectiveScene || analysisMode !== 'composite') return '';
    return renderSpectralCompositeDataUrl(effectiveScene, dateSlot, compositeMode);
  }, [effectiveScene, dateSlot, analysisMode, compositeMode]);

  const handleSearchStac = async () => {
    const bbox = scene?.bounds || fallbackBounds || [-76.92, -12.32, -76.82, -12.23];
    setStacLoading(true);
    setStacError('');
    try {
      const res = await api.searchStacCatalog({
        bbox,
        collection: 'sentinel-2-l2a',
        limit: 6,
        maxCloudCover: 40,
      });
      setStacProvider(res.provider);
      setStacItems(res.items);
    } catch (err: any) {
      setStacError(err.message || 'No fue posible conectar con el catálogo STAC público.');
    } finally {
      setStacLoading(false);
    }
  };

  if (!scene) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Satellite className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">
            Sin escena multiespectral bitemporal cargada en este proyecto
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Seleccione Cuenca Lurín (Prueba A) o Parque Industrial Callao (Prueba C) para operar los 11 índices Sentinel-2, corrección DOS1 y matriz de confusión, o consulte escenas reales en el catálogo STAC abajo.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900">Catálogo Satelital Real STAC (Sentinel-2 L2A AWS)</h4>
            <button
              type="button"
              onClick={handleSearchStac}
              disabled={stacLoading}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {stacLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Buscar Escenas STAC en Vivo</span>
            </button>
          </div>
          {stacError && <p className="text-xs text-rose-700">{stacError}</p>}
        </div>
      </div>
    );
  }

  const activeOutputGrid =
    analysisMode === 'index'
      ? computedIndex?.grid
      : analysisMode === 'change'
      ? computedChange?.deltaGrid
      : analysisMode === 'kmeans'
      ? computedKMeans?.classGrid
      : analysisMode === 'supervised'
      ? computedSupervised?.classGrid
      : analysisMode === 'custom'
      ? computedCustom?.grid
      : computedIndex?.grid;

  const previewUrl =
    analysisMode === 'composite'
      ? compositeUrl
      : activeOutputGrid
      ? renderGridToDataUrl(activeOutputGrid)
      : '';
  const t1Url = computedChange ? renderGridToDataUrl(computedChange.t1Grid) : '';
  const t2Url = computedChange ? renderGridToDataUrl(computedChange.t2Grid) : '';

  const handlePublish = () => {
    if (!activeOutputGrid) return;
    if (analysisMode === 'index' && computedIndex) {
      onPublishRaster(
        computedIndex.grid,
        `${selectedIndex} (${scene[dateSlot].date}${applyDos1 ? ' DOS1' : ''}): media ${computedIndex.mean}, cobertura >0.25: ${computedIndex.positiveCoveragePct}%.`,
        `Índice Espectral ${selectedIndex}`
      );
    } else if (analysisMode === 'change' && computedChange) {
      onPublishRaster(
        computedChange.deltaGrid,
        `Cambio Δ${selectedIndex}: pérdida ${computedChange.significantLossPct}%, ganancia ${computedChange.significantGainPct}%.`,
        `Cambio Multitemporal Δ${selectedIndex}`
      );
    } else if (analysisMode === 'kmeans' && computedKMeans) {
      onPublishRaster(
        computedKMeans.classGrid,
        `Clasificación K-Means (4 coberturas) sobre ${scene[dateSlot].sensor}.`,
        'Clasificación K-Means'
      );
    } else if (analysisMode === 'supervised' && computedSupervised) {
      onPublishRaster(
        computedSupervised.classGrid,
        `Clasificación Supervisada (OA=${computedSupervised.overallAccuracyPct}%, Kappa=${computedSupervised.kappa}).`,
        'Clasificación Supervisada + Kappa'
      );
    } else if (analysisMode === 'custom' && computedCustom) {
      onPublishRaster(
        computedCustom.grid,
        `Fórmula espectral "${customFormula}": media ${computedCustom.mean}.`,
        'Fórmula Espectral 2.0'
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* Controls Ribbon */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'index', label: '11 Índices', icon: Satellite },
                { id: 'composite', label: 'Composiciones RGB/SWIR', icon: Layers },
                { id: 'change', label: 'Cambio T1→T2', icon: ArrowRightLeft },
                { id: 'kmeans', label: 'K-Means', icon: Cpu },
                { id: 'supervised', label: 'Supervisada + Kappa', icon: ShieldCheck },
                { id: 'custom', label: 'Fórmula Libre', icon: Sparkles },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setAnalysisMode(m.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                  analysisMode === m.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <m.icon className="w-3.5 h-3.5" />
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={applyDos1}
                onChange={(e) => setApplyDos1(e.target.checked)}
                className="accent-emerald-700"
              />
              <span>Corrección DOS1 + Nubes</span>
            </label>

            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(e.target.value as ExtendedSpectralIndex)}
              aria-label="Índice espectral"
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
            >
              {SPECTRAL_INDEX_CATALOG.map((idx) => (
                <option key={idx.code} value={idx.code}>
                  {idx.code} — {idx.name}
                </option>
              ))}
            </select>

            {analysisMode !== 'change' && (
              <select
                value={dateSlot}
                onChange={(e) => setDateSlot(e.target.value as 't1' | 't2')}
                aria-label="Fecha de escena satelital"
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-700"
              >
                <option value="t1">T1: {scene.t1.date}</option>
                <option value="t2">T2: {scene.t2.date}</option>
              </select>
            )}

            <button
              type="button"
              onClick={handlePublish}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Publicar al Visor</span>
            </button>
          </div>
        </div>

        {analysisMode === 'composite' && (
          <div className="flex items-center gap-2 pt-1 text-xs">
            <span className="font-semibold text-slate-700">Combinación de Bandas:</span>
            {(
              [
                { id: 'rgb', label: 'Color Natural (R-G-B)' },
                { id: 'false_color_nir', label: 'Falso Color Vegetación (NIR-R-G)' },
                { id: 'swir_urban', label: 'Urbano / Litología (SWIR2-NIR-R)' },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCompositeMode(c.id)}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                  compositeMode === c.id ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {analysisMode === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-slate-700">Bandas: blue, green, red, nir, swir1, swir2:</span>
            <input
              type="text"
              value={customFormula}
              onChange={(e) => setCustomFormula(e.target.value)}
              className="flex-1 min-w-[220px] px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
            />
            {customError && <span className="text-xs text-rose-700">{customError}</span>}
          </div>
        )}
      </div>

      {/* Main Spectral Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              {analysisMode === 'composite' ? `Composición ${compositeMode}` : activeOutputGrid?.name}
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              {scene.cols}×{scene.rows} px
            </span>
          </div>

          <div className="bg-slate-950 rounded-lg p-3 flex items-center justify-center">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Ráster espectral"
                className="w-full max-w-[320px] aspect-square object-contain rounded border border-slate-800"
                style={{ imageRendering: 'pixelated' }}
              />
            )}
          </div>

          {dos1Result && (
            <p className="text-[11px] font-mono text-sky-900 bg-sky-50 border border-sky-200 rounded-lg p-2">
              DOS1 aplicado (Path Blue={dos1Result.pathRadiance.blue}, Red={dos1Result.pathRadiance.red}) · Nubes detectadas: {dos1Result.cloudMaskedPixels} px ({dos1Result.cloudPct}%)
            </p>
          )}
        </div>

        <div className="lg:col-span-7 space-y-4">
          {analysisMode === 'index' && computedIndex && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Estadísticas {selectedIndex} ({scene[dateSlot].date})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Mínimo</p>
                  <p className="text-lg font-mono font-bold text-slate-900">{computedIndex.min}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Media</p>
                  <p className="text-lg font-mono font-bold text-emerald-700">{computedIndex.mean}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Máximo</p>
                  <p className="text-lg font-mono font-bold text-slate-900">{computedIndex.max}</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="text-[10px] font-bold text-emerald-800 uppercase">Índice &gt; 0.25</p>
                  <p className="text-lg font-mono font-bold text-emerald-800">{computedIndex.positiveCoveragePct}%</p>
                </div>
              </div>
              <p className="text-[11px] font-mono text-slate-500">
                Fórmula: {SPECTRAL_INDEX_CATALOG.find((i) => i.code === selectedIndex)?.formula}
              </p>
            </div>
          )}

          {analysisMode === 'change' && computedChange && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">
                Comparación Multitemporal Δ{selectedIndex} ({scene.t1.date} → {scene.t2.date})
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-2 rounded-lg text-center">
                  <p className="text-[10px] font-mono text-slate-300 mb-1.5">T1: {scene.t1.date}</p>
                  <img src={t1Url} alt="Escena T1" className="w-full max-w-[140px] mx-auto aspect-square" style={{ imageRendering: 'pixelated' }} />
                </div>
                <div className="bg-slate-950 p-2 rounded-lg text-center">
                  <p className="text-[10px] font-mono text-slate-300 mb-1.5">T2: {scene.t2.date}</p>
                  <img src={t2Url} alt="Escena T2" className="w-full max-w-[140px] mx-auto aspect-square" style={{ imageRendering: 'pixelated' }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                  <p className="text-[10px] font-bold text-rose-800 uppercase">Pérdida (≤ -0.1)</p>
                  <p className="text-base font-mono font-bold text-rose-700">{computedChange.significantLossPct}%</p>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-[10px] font-bold text-slate-600 uppercase">Estable</p>
                  <p className="text-base font-mono font-bold text-slate-800">{computedChange.unchangedPct}%</p>
                </div>
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-[10px] font-bold text-emerald-800 uppercase">Ganancia (≥ +0.1)</p>
                  <p className="text-base font-mono font-bold text-emerald-700">{computedChange.significantGainPct}%</p>
                </div>
              </div>
            </div>
          )}

          {analysisMode === 'kmeans' && computedKMeans && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Clasificación No Supervisada K-Means</h3>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                    <th className="py-2">Clase</th>
                    <th className="py-2 text-right">Hectáreas</th>
                    <th className="py-2 text-right">% Área</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {computedKMeans.breakdown.map((r) => (
                    <tr key={r.classIndex}>
                      <td className="py-2 font-medium text-slate-800">{r.label}</td>
                      <td className="py-2 text-right font-mono">{r.hectares}</td>
                      <td className="py-2 text-right font-mono font-bold">{r.percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {analysisMode === 'supervised' && computedSupervised && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Matriz de Confusión &amp; Exactitud (Mínima Distancia · Holdout 50%)
                </h3>
                <div className="flex gap-2 text-xs font-mono">
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded font-bold">
                    Exactitud Global: {computedSupervised.overallAccuracyPct}%
                  </span>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-900 rounded font-bold">
                    Kappa κ = {computedSupervised.kappa}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase">
                      <th className="py-1.5">Ref \ Pred</th>
                      {computedSupervised.classLabels.map((lbl, idx) => (
                        <th key={idx} className="py-1.5 text-center">C{idx + 1}</th>
                      ))}
                      <th className="py-1.5 text-right">Prod %</th>
                      <th className="py-1.5 text-right">Usuario %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {computedSupervised.confusionMatrix.map((row, rIdx) => (
                      <tr key={rIdx}>
                        <td className="py-1.5 font-semibold text-slate-800">
                          C{rIdx + 1}: {computedSupervised.classLabels[rIdx]}
                        </td>
                        {row.map((val, cIdx) => (
                          <td
                            key={cIdx}
                            className={`py-1.5 text-center font-mono ${
                              rIdx === cIdx ? 'font-bold bg-emerald-50 text-emerald-800' : 'text-slate-600'
                            }`}
                          >
                            {val}
                          </td>
                        ))}
                        <td className="py-1.5 text-right font-mono">
                          {computedSupervised.perClassMetrics[rIdx].producersAccPct}%
                        </td>
                        <td className="py-1.5 text-right font-mono">
                          {computedSupervised.perClassMetrics[rIdx].usersAccPct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Live STAC Catalog Search */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Búsqueda en Vivo Catálogo Satelital STAC (Copernicus Sentinel-2 L2A)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Consulta directa al endpoint público Earth Search AWS v1 filtrando por el bounding box del proyecto activo.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSearchStac}
                disabled={stacLoading}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {stacLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>Consultar STAC en Vivo</span>
              </button>
            </div>

            {stacError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                {stacError}
              </p>
            )}

            {stacItems.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono text-emerald-700 font-bold">
                  Proveedor: {stacProvider} · {stacItems.length} escenas reales encontradas
                </p>
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-lg text-xs">
                  {stacItems.map((it) => (
                    <div key={it.id} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-mono font-bold text-slate-800 text-[11px]">{it.id}</p>
                        <p className="text-[10px] text-slate-500">
                          {it.datetime.slice(0, 10)} · {it.platform}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 bg-sky-50 border border-sky-200 rounded font-mono text-[10px] text-sky-900">
                        Nubes: {it.cloudCover !== null ? `${it.cloudCover}%` : 'N/D'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
