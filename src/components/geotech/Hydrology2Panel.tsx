import React, { useMemo, useState } from 'react';
import { Droplets, Layers, AlertTriangle, Play, ShieldAlert } from 'lucide-react';
import { DemGrid, GisLayer, GeoFeatureCollection } from '../../utils/geotechEngine';
import {
  computeAdvancedHydrology,
  computeHydroTerritorialExposure,
} from '../../utils/hydrology2';
import { computeHydrology3Analysis } from '../../utils/geotechHydro3';
import { renderGridToDataUrl } from './GisMap2DCanvas';

interface Hydrology2PanelProps {
  dem: DemGrid;
  layers: GisLayer[];
  onPublishRaster: (grid: DemGrid, summary: string, toolName: string) => void;
  onPublishVectorLayer: (layer: GisLayer, summary: string) => void;
}

export const Hydrology2Panel: React.FC<Hydrology2PanelProps> = ({
  dem,
  layers,
  onPublishRaster,
  onPublishVectorLayer,
}) => {
  const [rainfallMmHr, setRainfallMmHr] = useState<number>(48);
  const [runoffCoeffC, setRunoffCoeffC] = useState<number>(0.58);
  const [activeLayerPreview, setActiveLayerPreview] = useState<'twi' | 'flowAcc'>('twi');

  const hydro = useMemo(
    () => computeAdvancedHydrology(dem, rainfallMmHr, runoffCoeffC),
    [dem, rainfallMmHr, runoffCoeffC]
  );

  const hydro3 = useMemo(
    () => computeHydrology3Analysis(dem, rainfallMmHr, runoffCoeffC),
    [dem, rainfallMmHr, runoffCoeffC]
  );

  // Merge point/polygon infrastructure layers for territorial exposure test
  const infrastructureFc: GeoFeatureCollection = useMemo(() => {
    const features = layers
      .filter((l) => l.category === 'infraestructura' || l.category === 'ambiental')
      .flatMap((l) => l.geojson?.features || []);
    return { type: 'FeatureCollection', features: features.slice(0, 20) };
  }, [layers]);

  const exposureRows = useMemo(
    () => computeHydroTerritorialExposure(hydro.twiGrid, hydro.streamNetworkGeoJson, infrastructureFc),
    [hydro.twiGrid, hydro.streamNetworkGeoJson, infrastructureFc]
  );

  const previewUrl = useMemo(
    () => renderGridToDataUrl(activeLayerPreview === 'twi' ? hydro.twiGrid : hydro.flowAccumulationGrid),
    [activeLayerPreview, hydro]
  );

  const handlePublishAllToMap = () => {
    onPublishRaster(
      hydro.twiGrid,
      `Hidrología 2.0 Priority-Flood (${hydro.sinksFilledCount} sumideros rellenados) · Q pico racional ${hydro.morphometry.rationalPeakFlowM3s} m³/s.`,
      'Hidrología 2.0 (Priority-Flood + TWI)'
    );
    if (hydro.streamNetworkGeoJson.features.length > 0) {
      onPublishVectorLayer(
        {
          id: `lyr-strahler-${Date.now()}`,
          name: `Red Hídrica Strahler (Orden 1–${hydro.maxStrahlerOrder})`,
          category: 'hidrologia',
          kind: 'vector',
          visible: true,
          opacity: 0.95,
          crs: 'EPSG:4326',
          source: 'Extracción D8 + Orden Strahler tras Priority-Flood',
          capturedDate: new Date().toISOString().split('T')[0],
          metadata: { provenance: 'modelo_analitico' },
          symbology: { color: '#0284c7', weight: 2.5 },
          geojson: hydro.streamNetworkGeoJson,
        },
        `Publicada red hídrica Strahler (${hydro.streamSegmentCount} tramos).`
      );
    }
    if (hydro.watershedGeoJson.features.length > 0) {
      onPublishVectorLayer(
        {
          id: `lyr-basin-${Date.now()}`,
          name: `Subcuenca Delineada (${hydro.morphometry.basinAreaKm2} km²)`,
          category: 'hidrologia',
          kind: 'vector',
          visible: true,
          opacity: 0.75,
          crs: 'EPSG:4326',
          source: 'Delimitación automática de cuenca D8',
          capturedDate: new Date().toISOString().split('T')[0],
          metadata: { provenance: 'modelo_analitico' },
          symbology: { color: '#0369a1', fillColor: '#38bdf8', fillOpacity: 0.16, weight: 2 },
          geojson: hydro.watershedGeoJson,
        },
        `Publicada subcuenca (${hydro.morphometry.basinAreaKm2} km², Tc ${hydro.morphometry.kirpichTcMin} min).`
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* Parameters Ribbon */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-sky-700" />
            <span className="text-xs font-bold text-slate-900">Parámetros Hidrológicos (Kirpich &amp; Racional):</span>
          </div>
          <label className="text-xs text-slate-700 flex items-center gap-1.5">
            <span>Lluvia diseño I (mm/h):</span>
            <input
              type="number"
              min={5}
              max={250}
              value={rainfallMmHr}
              onChange={(e) => setRainfallMmHr(Number(e.target.value) || 40)}
              className="w-20 px-2 py-1 border border-slate-300 rounded text-xs font-mono"
            />
          </label>
          <label className="text-xs text-slate-700 flex items-center gap-1.5">
            <span>Coef. Escorrentía C:</span>
            <input
              type="number"
              min={0.1}
              max={0.98}
              step={0.05}
              value={runoffCoeffC}
              onChange={(e) => setRunoffCoeffC(Number(e.target.value) || 0.5)}
              className="w-20 px-2 py-1 border border-slate-300 rounded text-xs font-mono"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={handlePublishAllToMap}
          className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Publicar Cuenca, Red Strahler y TWI al Visor</span>
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Mapa Topográfico Hidrológico
            </h4>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setActiveLayerPreview('twi')}
                className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                  activeLayerPreview === 'twi' ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                TWI
              </button>
              <button
                type="button"
                onClick={() => setActiveLayerPreview('flowAcc')}
                className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                  activeLayerPreview === 'flowAcc' ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Flujo Acum. D8
              </button>
            </div>
          </div>

          <div className="bg-slate-950 rounded-lg p-3 flex items-center justify-center">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Ráster Hidrológico"
                className="w-full max-w-[300px] aspect-square object-contain rounded border border-slate-800"
                style={{ imageRendering: 'pixelated' }}
              />
            )}
          </div>
          <p className="text-[11px] font-mono text-slate-500">
            Sumideros rellenados (Priority-Flood): {hydro.sinksFilledCount} · Tramos Strahler: {hydro.streamSegmentCount} (Orden máx {hydro.maxStrahlerOrder})
          </p>
        </div>

        <div className="lg:col-span-7 space-y-4">
          {/* Morphometry KPIs */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Morfometría de Cuenca &amp; Caudal Pico (Método Racional + Kirpich)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Área Cuenca</p>
                <p className="text-base font-mono font-bold tabular-nums text-slate-900">{hydro.morphometry.basinAreaKm2} km²</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Compacidad Kc</p>
                <p className="text-base font-mono font-bold tabular-nums text-slate-900">{hydro.morphometry.compactnessKc}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Tc Kirpich</p>
                <p className="text-base font-mono font-bold tabular-nums text-sky-800">{hydro.morphometry.kirpichTcMin} min</p>
              </div>
              <div className="p-3 bg-sky-50 rounded-lg border border-sky-200">
                <p className="text-[10px] font-bold text-sky-900 uppercase">Q Pico Racional</p>
                <p className="text-base font-mono font-bold tabular-nums text-sky-900">
                  {hydro.morphometry.rationalPeakFlowM3s} m³/s
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-600 pt-1">
              <span>Perímetro: {hydro.morphometry.basinPerimeterKm} km</span>
              <span>Densidad Dd: {hydro.morphometry.drainageDensityKmKm2} km/km²</span>
              <span>Desnivel ΔH: {hydro.morphometry.reliefM} m</span>
            </div>
          </div>

          {/* Exposure Overlay */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Cruce de Exposición Hídrica sobre Instalaciones &amp; Activos
            </h3>
            {exposureRows.length === 0 ? (
              <p className="text-xs text-slate-500">Sin activos puntuales/poligonales de infraestructura en este proyecto.</p>
            ) : (
              <div className="overflow-x-auto max-h-52">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <th className="py-1.5">Activo / Instalación</th>
                      <th className="py-1.5 text-right">TWI Local</th>
                      <th className="py-1.5 text-right">Dist. Cauce (m)</th>
                      <th className="py-1.5 text-right">Susceptibilidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {exposureRows.map((row, i) => (
                      <tr key={i}>
                        <td className="py-1.5 font-medium text-slate-800">{row.name}</td>
                        <td className="py-1.5 text-right font-mono">{row.twiAtLocation}</td>
                        <td className="py-1.5 text-right font-mono">{row.distanceToStreamM} m</td>
                        <td className="py-1.5 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.exposureLevel === 'Alto'
                                ? 'bg-rose-100 text-rose-800'
                                : row.exposureLevel === 'Moderado'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {row.exposureLevel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-[11px] text-amber-950 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>{hydro.methodologyNote}</span>
          </div>
        </div>
      </div>

      {/* HYDROLOGY 3.0 EXPANSION: TAXONOMY, HORTON LAWS, IDF MATRIX & SCENARIOS */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="border-b border-slate-200 pb-3">
          <h3 className="text-sm font-bold text-slate-900">
            Hidrología 3.0 — Leyes de Horton, Curvas IDF &amp; Escenarios de Escorrentía
          </h3>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]">
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
              {hydro3.taxonomyDistinction.topographic}
            </div>
            <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-sky-950">
              {hydro3.taxonomyDistinction.hydrological}
            </div>
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-950">
              {hydro3.taxonomyDistinction.hydraulicExternal}
            </div>
          </div>
        </div>

        {/* Horton Ratios */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5 space-y-3 text-xs">
            <h4 className="font-bold text-slate-800">Leyes Geomorfológicas de Horton</h4>
            <div className="grid grid-cols-3 gap-2.5 font-mono tabular-nums">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[10px] font-sans font-bold text-slate-500 block">Bifurcación Rb</span>
                <strong className="text-base text-slate-900">{hydro3.horton.bifurcationRatioRb}</strong>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[10px] font-sans font-bold text-slate-500 block">Longitud Rl</span>
                <strong className="text-base text-slate-900">{hydro3.horton.lengthRatioRl}</strong>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[10px] font-sans font-bold text-slate-500 block">Área Ra</span>
                <strong className="text-base text-slate-900">{hydro3.horton.areaRatioRa}</strong>
              </div>
            </div>
            <p className="text-[11px] text-slate-600">{hydro3.horton.drainageTextureNote}</p>

            {/* Multi-scenario Comparison */}
            <h4 className="font-bold text-slate-800 pt-2">Comparación Multi-Escenario</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-1.5 px-2">Escenario</th>
                    <th className="py-1.5 px-2 text-right">C</th>
                    <th className="py-1.5 px-2 text-right">Q Pico</th>
                    <th className="py-1.5 px-2 text-right">Δ%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hydro3.scenarioComparison.map((sc) => (
                    <tr key={sc.scenarioName}>
                      <td className="py-1.5 px-2 font-medium text-slate-800">{sc.scenarioName}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{sc.runoffCoeffC}</td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-sky-800">{sc.peakFlowM3s} m³/s</td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {sc.deltaVsBaselinePct > 0 ? `+${sc.deltaVsBaselinePct}%` : `${sc.deltaVsBaselinePct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* IDF Matrix */}
          <div className="lg:col-span-7 space-y-2 text-xs">
            <h4 className="font-bold text-slate-800">
              Matriz Curvas IDF Sintéticas (Intensidad mm/h · Caudal Racional m³/s)
            </h4>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-[11px] text-left border-collapse font-mono tabular-nums">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-sans font-bold uppercase text-slate-500">
                  <tr>
                    <th className="py-1.5 px-2">Tr (Años)</th>
                    <th className="py-1.5 px-2 text-right">Duración</th>
                    <th className="py-1.5 px-2 text-right">Intensidad (mm/h)</th>
                    <th className="py-1.5 px-2 text-right">Q Pico (m³/s)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hydro3.idfMatrix.map((pt, i) => (
                    <tr key={i}>
                      <td className="py-1 px-2 font-bold text-slate-800">Tr = {pt.returnPeriodYears} años</td>
                      <td className="py-1 px-2 text-right">{pt.durationMin} min</td>
                      <td className="py-1 px-2 text-right">{pt.intensityMmHr} mm/h</td>
                      <td className="py-1 px-2 text-right font-bold text-sky-800">{pt.peakFlowRationalM3s} m³/s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
