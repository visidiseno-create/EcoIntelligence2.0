import React, { useMemo, useState } from 'react';
import { Sliders, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import {
  DemGrid,
  computeAhpWeights,
  computeSuitabilityGrid,
} from '../../utils/geotechEngine';
import { renderGridToDataUrl } from './GisMap2DCanvas';

interface MulticriteriaAhpPanelProps {
  dem: DemGrid;
  onPublishSuitability: (grid: DemGrid, summary: string) => void;
}

const CRITERIA_LABELS = [
  'Pendiente Topográfica',
  'Distancia / Seguridad Hídrica (TWI)',
  'Cota / Altitud Óptima',
  'Accesibilidad Vial / Corredor',
];

export const MulticriteriaAhpPanel: React.FC<MulticriteriaAhpPanelProps> = ({
  dem,
  onPublishSuitability,
}) => {
  // Pairwise ratios vs Criterion 1..4 (adjustable interactively while preserving reciprocity a_ji = 1 / a_ij)
  const [p01, setP01] = useState<number>(2); // Slope vs Hydrology
  const [p02, setP02] = useState<number>(3); // Slope vs Elevation
  const [p03, setP03] = useState<number>(4); // Slope vs Accessibility
  const [p12, setP12] = useState<number>(2); // Hydrology vs Elevation
  const [p13, setP13] = useState<number>(3); // Hydrology vs Accessibility
  const [p23, setP23] = useState<number>(2); // Elevation vs Accessibility
  const [excludeSteepDeg, setExcludeSteepDeg] = useState<number>(35);

  const matrix = useMemo(
    () => [
      [1, p01, p02, p03],
      [1 / p01, 1, p12, p13],
      [1 / p02, 1 / p12, 1, p23],
      [1 / p03, 1 / p13, 1 / p23, 1],
    ],
    [p01, p02, p03, p12, p13, p23]
  );

  const ahpResult = useMemo(() => computeAhpWeights(matrix), [matrix]);

  const suitability = useMemo(
    () =>
      computeSuitabilityGrid(
        dem,
        {
          slope: ahpResult.weights[0],
          hydrology: ahpResult.weights[1],
          elevation: ahpResult.weights[2],
          accessibility: ahpResult.weights[3],
        },
        excludeSteepDeg
      ),
    [dem, ahpResult.weights, excludeSteepDeg]
  );

  const previewUrl = useMemo(() => renderGridToDataUrl(suitability.grid), [suitability.grid]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Saaty Matrix & Parameters */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-700" />
              <span>Modelamiento Territorial Multicriterio (Método Saaty AHP)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ajuste la importancia relativa entre factores (escala Saaty 1/5 a 5) y restricciones geotécnicas de exclusión.
            </p>
          </div>
          <div
            className={`px-3 py-1 rounded-lg border text-xs font-mono font-bold flex items-center gap-1.5 ${
              ahpResult.isConsistent
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            {ahpResult.isConsistent ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            <span>CR = {ahpResult.consistencyRatio}</span>
          </div>
        </div>

        {/* Pairwise Comparison Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {[
            { label: 'Pendiente vs Hidrología (TWI)', val: p01, set: setP01 },
            { label: 'Pendiente vs Altitud', val: p02, set: setP02 },
            { label: 'Pendiente vs Accesibilidad Vial', val: p03, set: setP03 },
            { label: 'Hidrología vs Altitud', val: p12, set: setP12 },
            { label: 'Hidrología vs Accesibilidad Vial', val: p13, set: setP13 },
            { label: 'Altitud vs Accesibilidad Vial', val: p23, set: setP23 },
          ].map((item) => (
            <div key={item.label} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
              <div className="flex justify-between font-semibold text-slate-700">
                <span>{item.label}</span>
                <span className="font-mono text-emerald-700">{item.val.toFixed(1)}×</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="5"
                step="0.2"
                value={item.val}
                onChange={(e) => item.set(Number(e.target.value))}
                className="w-full accent-emerald-700 cursor-pointer"
              />
            </div>
          ))}
        </div>

        {/* Exclusion Rule */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-800">
              Restricción Dura de Exclusión por Pendiente Crítica
            </p>
            <p className="text-[11px] text-slate-500">
              Las celdas con pendiente mayor al umbral se excluyen automáticamente del modelo de aptitud.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={10}
              max={60}
              value={excludeSteepDeg}
              onChange={(e) => setExcludeSteepDeg(Number(e.target.value) || 35)}
              className="w-20 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold"
            />
            <span className="text-xs font-mono text-slate-600">grados (°)</span>
          </div>
        </div>

        {/* Computed Weights Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
              <tr>
                <th className="py-2 px-3">Criterio Territorial</th>
                <th className="py-2 px-3 text-right">Peso Eigenvector</th>
                <th className="py-2 px-3 text-right">Ponderación (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CRITERIA_LABELS.map((lbl, idx) => (
                <tr key={lbl}>
                  <td className="py-2 px-3 font-medium text-slate-800">{lbl}</td>
                  <td className="py-2 px-3 text-right font-mono">{ahpResult.weights[idx].toFixed(3)}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                    {(ahpResult.weights[idx] * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] font-mono text-slate-500">
          λ_max = {ahpResult.lambdaMax} · CI = {ahpResult.consistencyIndex} · CR = {ahpResult.consistencyRatio}{' '}
          {ahpResult.isConsistent ? '(Matriz Consistente <= 0.10)' : '(Advertencia: CR > 0.10, revise comparaciones)'}
        </p>
      </div>

      {/* Output Suitability Map & Hectares Summary */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">Mapa de Idoneidad (0–100)</h3>
          <button
            type="button"
            onClick={() =>
              onPublishSuitability(
                suitability.grid,
                `AHP Territorial (CR=${ahpResult.consistencyRatio}): Aptitud Alta ${suitability.highHa} ha, Media ${suitability.mediumHa} ha, Excluida ${suitability.excludedHa} ha.`
              )
            }
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Publicar en Visor 2D/3D</span>
          </button>
        </div>

        <div className="bg-slate-950 rounded-lg p-3 flex items-center justify-center">
          <img
            src={previewUrl}
            alt="Mapa de idoneidad territorial AHP"
            className="w-full max-w-[300px] aspect-square rounded border border-slate-800"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-[10px] font-bold uppercase text-emerald-800">Aptitud Alta (75–100)</p>
            <p className="text-base font-mono font-bold text-emerald-800">{suitability.highHa.toLocaleString()} ha</p>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-[10px] font-bold uppercase text-amber-800">Aptitud Media (50–74)</p>
            <p className="text-base font-mono font-bold text-amber-800">{suitability.mediumHa.toLocaleString()} ha</p>
          </div>
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
            <p className="text-[10px] font-bold uppercase text-rose-800">Aptitud Baja (&lt;50)</p>
            <p className="text-base font-mono font-bold text-rose-700">{suitability.lowHa.toLocaleString()} ha</p>
          </div>
          <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg">
            <p className="text-[10px] font-bold uppercase text-slate-600">Excluida (&gt;{excludeSteepDeg}°)</p>
            <p className="text-base font-mono font-bold text-slate-800">{suitability.excludedHa.toLocaleString()} ha</p>
          </div>
        </div>
      </div>
    </div>
  );
};
