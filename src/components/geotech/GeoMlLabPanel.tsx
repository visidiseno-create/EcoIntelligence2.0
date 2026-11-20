import React, { useMemo, useState } from 'react';
import { BrainCircuit, Play, Save, Layers, ShieldAlert } from 'lucide-react';
import { DemGrid, GeoMlSavedModel, GeotechProject } from '../../utils/geotechEngine';
import {
  detectRasterAnomalies,
  runDemVsNdviSpatialRegression,
  runGeoMlClassification,
  runImageSegmentation,
  runThematicRemoteSensingWorkflow,
  ThematicRemoteSensingWorkflow,
} from '../../utils/geoMlEngine';
import { renderGridToDataUrl } from './GisMap2DCanvas';

interface GeoMlLabPanelProps {
  project: GeotechProject;
  userName: string;
  canEdit: boolean;
  onSaveModel: (model: GeoMlSavedModel) => void;
  onPublishRaster: (grid: DemGrid, summary: string, toolName: string) => void;
}

const THEMATIC_FLOWS: Array<{ id: ThematicRemoteSensingWorkflow; label: string }> = [
  { id: 'deforestation', label: '1. Deforestación (ΔNDVI)' },
  { id: 'wildfire', label: '2. Incendios Forestales (dNBR)' },
  { id: 'agriculture', label: '3. Vigor Agrícola (NDVI)' },
  { id: 'water_bodies', label: '4. Cuerpos de Agua (NDWI)' },
  { id: 'urbanization', label: '5. Expansión Urbana (ΔNDBI)' },
  { id: 'soil_moisture', label: '6. Humedad del Suelo (NDMI)' },
];

export const GeoMlLabPanel: React.FC<GeoMlLabPanelProps> = ({
  project,
  userName,
  canEdit,
  onSaveModel,
  onPublishRaster,
}) => {
  const [dateSlot, setDateSlot] = useState<'t1' | 't2'>('t2');
  const [algorithm, setAlgorithm] = useState<'random_forest' | 'svm' | 'decision_tree'>('random_forest');
  const [zThresh, setZThresh] = useState<number>(2.0);
  const [thematicId, setThematicId] = useState<ThematicRemoteSensingWorkflow>('deforestation');

  const [activeGrid, setActiveGrid] = useState<DemGrid | null>(null);
  const [activeSummary, setActiveSummary] = useState<string>('');
  const [mlMetrics, setMlMetrics] = useState<{
    accuracyPct: number;
    precisionPct: number;
    recallPct: number;
    f1Pct: number;
    kappa: number;
    confusionMatrix: number[][];
    classLabels: string[];
    savedModel: GeoMlSavedModel;
  } | null>(null);
  const [regMetrics, setRegMetrics] = useState<{ rmse: number; mae: number; r2: number; slopeCoeff: number } | null>(
    null
  );

  const previewUrl = useMemo(() => (activeGrid ? renderGridToDataUrl(activeGrid) : ''), [activeGrid]);

  if (!project.spectralScene) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-600">
        El proyecto "{project.name}" no cuenta con escena espectral multibanda. Seleccione un proyecto con cobertura satelital (ej. PROY-SIG-001).
      </div>
    );
  }

  const scene = project.spectralScene;

  const handleTrainMl = () => {
    const res = runGeoMlClassification(scene, dateSlot, algorithm, userName);
    setActiveGrid(res.predictedGrid);
    setActiveSummary(res.precisionEnvelope.resultSummary);
    setMlMetrics({
      ...res.metrics,
      classLabels: res.classLabels,
      savedModel: res.savedModel,
    });
    setRegMetrics(null);
  };

  const handleRunRegression = () => {
    const res = runDemVsNdviSpatialRegression(project.dem, scene, dateSlot, userName);
    setActiveGrid(res.predictedGrid);
    setActiveSummary(res.precisionEnvelope.resultSummary);
    setRegMetrics({ rmse: res.rmse, mae: res.mae, r2: res.r2, slopeCoeff: res.slopeCoeff });
    setMlMetrics(null);
    if (canEdit) onSaveModel(res.savedModel);
  };

  const handleRunAnomalies = () => {
    const res = detectRasterAnomalies(project.dem, zThresh);
    setActiveGrid(res.anomalyGrid);
    setActiveSummary(res.precisionEnvelope.resultSummary);
    setMlMetrics(null);
    setRegMetrics(null);
  };

  const handleRunSegmentation = () => {
    const res = runImageSegmentation(scene, dateSlot, 0.085);
    setActiveGrid(res.segmentGrid);
    setActiveSummary(res.precisionEnvelope.resultSummary);
    setMlMetrics(null);
    setRegMetrics(null);
  };

  const handleRunThematic = () => {
    const res = runThematicRemoteSensingWorkflow(scene, thematicId);
    setActiveGrid(res.resultGrid);
    setActiveSummary(res.findingSummary);
    setMlMetrics(null);
    setRegMetrics(null);
  };

  return (
    <div className="space-y-5">
      {/* Scientific Provenance Guardrail */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <strong>Distinción Científica Obligatoria (PREDICCIÓN ML ≠ OBSERVADO):</strong> Todos los mapas generados en este laboratorio corresponden a{' '}
          <span className="font-mono font-bold">prediccion_ml</span> obtenidos mediante validación holdout 50/50 sobre muestras espectrales; no sustituyen verificación en campo.
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-indigo-700" />
            <span>Entrenamiento GeoML &amp; Teledetección 3.0</span>
          </h3>

          <div className="grid grid-cols-2 gap-2.5">
            <label>
              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha Escena</span>
              <select
                value={dateSlot}
                onChange={(e) => setDateSlot(e.target.value as 't1' | 't2')}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
              >
                <option value="t2">T2 ({scene.t2.date})</option>
                <option value="t1">T1 ({scene.t1.date})</option>
              </select>
            </label>
            <label>
              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Algoritmo Clasificador</span>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value as any)}
                aria-label="Algoritmo GeoML"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
              >
                <option value="random_forest">Random Forest (11 árboles)</option>
                <option value="svm">SVM Multi-Clase (OVR)</option>
                <option value="decision_tree">Decision Tree (CART)</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleTrainMl}
              className="px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Entrenar &amp; Evaluar Clasificador</span>
            </button>
            {mlMetrics && canEdit && (
              <button
                type="button"
                onClick={() => onSaveModel(mlMetrics.savedModel)}
                className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar Modelo</span>
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 space-y-2">
            <p className="text-[11px] font-bold uppercase text-slate-600">Analítica Espacial Complementaria</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleRunRegression}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold cursor-pointer"
              >
                Regresión OLS (DEM → NDVI)
              </button>
              <button
                type="button"
                onClick={handleRunSegmentation}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold cursor-pointer"
              >
                Segmentación por Objetos
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5">
                <span>Umbral |Z|:</span>
                <input
                  type="number"
                  step="0.2"
                  min={1.0}
                  max={4.0}
                  value={zThresh}
                  onChange={(e) => setZThresh(Number(e.target.value) || 2.0)}
                  className="w-16 px-2 py-1 border border-slate-300 rounded font-mono"
                />
              </label>
              <button
                type="button"
                onClick={handleRunAnomalies}
                className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-semibold cursor-pointer"
              >
                Detectar Anomalías Z-Score
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 space-y-2">
            <p className="text-[11px] font-bold uppercase text-slate-600">6 Flujos Temáticos de Teledetección</p>
            <div className="flex gap-2">
              <select
                value={thematicId}
                onChange={(e) => setThematicId(e.target.value as ThematicRemoteSensingWorkflow)}
                className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg"
              >
                {THEMATIC_FLOWS.map((tf) => (
                  <option key={tf.id} value={tf.id}>
                    {tf.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRunThematic}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold cursor-pointer"
              >
                Ejecutar
              </button>
            </div>
          </div>
        </div>

        {/* Right: Map Preview & Metrics */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">Resultado GeoML &amp; Validación Cuantitativa</h3>
            {activeGrid && (
              <button
                type="button"
                onClick={() => onPublishRaster(activeGrid, activeSummary, 'GeoML 3.0')}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Publicar Predicción al Visor</span>
              </button>
            )}
          </div>

          {activeGrid ? (
            <div className="space-y-4">
              <div className="bg-slate-950 rounded-lg p-3 flex flex-col items-center gap-2">
                <img
                  src={previewUrl}
                  alt="Mapa Predicción GeoML"
                  className="w-56 h-56 object-contain rounded border border-slate-800"
                  style={{ imageRendering: 'pixelated' }}
                />
                <p className="text-[11px] font-mono text-emerald-300 text-center">{activeSummary}</p>
              </div>

              {mlMetrics && (
                <div className="space-y-3">
                  <div className="grid grid-cols-5 gap-2 text-xs font-mono">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                      <span className="text-[10px] text-slate-500 block">ACCURACY</span>
                      <strong className="text-slate-900">{mlMetrics.accuracyPct}%</strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                      <span className="text-[10px] text-slate-500 block">PRECISION</span>
                      <strong className="text-slate-900">{mlMetrics.precisionPct}%</strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                      <span className="text-[10px] text-slate-500 block">RECALL</span>
                      <strong className="text-slate-900">{mlMetrics.recallPct}%</strong>
                    </div>
                    <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
                      <span className="text-[10px] text-indigo-700 block">F1-SCORE</span>
                      <strong className="text-indigo-900">{mlMetrics.f1Pct}%</strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                      <span className="text-[10px] text-slate-500 block">KAPPA</span>
                      <strong className="text-slate-900">{mlMetrics.kappa}</strong>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left border-collapse font-mono">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="py-1.5 px-2">Real \ Predicción</th>
                          {mlMetrics.classLabels.map((lbl, idx) => (
                            <th key={idx} className="py-1.5 px-2 text-right">
                              C{idx}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {mlMetrics.confusionMatrix.map((row, rIdx) => (
                          <tr key={rIdx}>
                            <td className="py-1 px-2 font-sans font-semibold text-slate-700">
                              C{rIdx}: {mlMetrics.classLabels[rIdx]}
                            </td>
                            {row.map((val, cIdx) => (
                              <td
                                key={cIdx}
                                className={`py-1 px-2 text-right ${
                                  rIdx === cIdx ? 'font-bold text-emerald-700' : 'text-slate-500'
                                }`}
                              >
                                {val}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {regMetrics && (
                <div className="grid grid-cols-4 gap-2 text-xs font-mono">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">RMSE: <strong>{regMetrics.rmse}</strong></div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">MAE: <strong>{regMetrics.mae}</strong></div>
                  <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded">R²: <strong>{regMetrics.r2}</strong></div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">β: <strong>{regMetrics.slopeCoeff}</strong></div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 border border-dashed border-slate-300 rounded-lg text-center text-xs text-slate-500">
              Ejecute Random Forest, SVM, Regresión Espacial OLS o un flujo temático para inspeccionar su matriz de confusión y métricas reales.
            </div>
          )}
        </div>
      </div>

      {/* Saved ML Models Registry */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">
          Registro de Modelos GeoML Guardados ({project.trainedMlModels?.length || 0})
        </h3>
        {(project.trainedMlModels || []).length === 0 ? (
          <p className="text-xs text-slate-500">Sin modelos guardados aún en este proyecto.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="py-2 px-3">Modelo</th>
                  <th className="py-2 px-3">Algoritmo</th>
                  <th className="py-2 px-3">Muestras</th>
                  <th className="py-2 px-3">Métricas</th>
                  <th className="py-2 px-3">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(project.trainedMlModels || []).map((m) => (
                  <tr key={m.id}>
                    <td className="py-1.5 px-3 font-semibold text-slate-900">{m.name}</td>
                    <td className="py-1.5 px-3 font-mono text-indigo-700">{m.algorithm}</td>
                    <td className="py-1.5 px-3 font-mono">{m.sampleCount}</td>
                    <td className="py-1.5 px-3 font-mono text-[11px]">
                      {m.metrics.accuracyPct !== undefined
                        ? `Acc=${m.metrics.accuracyPct}% · F1=${m.metrics.f1Pct}% · κ=${m.metrics.kappa}`
                        : `RMSE=${m.metrics.rmse} · R²=${m.metrics.r2}`}
                    </td>
                    <td className="py-1.5 px-3 text-slate-600">{m.trainedBy}</td>
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
