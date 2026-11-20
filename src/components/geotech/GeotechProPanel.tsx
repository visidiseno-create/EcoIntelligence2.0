import React, { useMemo, useState } from 'react';
import { HardHat, Layers, Activity, ShieldAlert, Ruler } from 'lucide-react';
import { BoreholeRecord, DemGrid } from '../../utils/geotechEngine';
import {
  buildBoreholeCrossSection,
  computeBearingCapacity,
  computeBoreholeLpi,
  computeGeotechZoningMap,
  computeSettlement1D,
  evaluateSeismicSlopeStability,
  interpolateSubsurfaceSurfaces,
} from '../../utils/geotechPro2';
import {
  classifyAtterbergLabSample,
  GEOTECH_EQUATIONS_CATALOG,
  interpretCptProfile,
} from '../../utils/geotechHydro3';

interface GeotechProPanelProps {
  dem: DemGrid;
  boreholes: BoreholeRecord[];
  onPublishRaster: (grid: DemGrid, summary: string, toolName: string) => void;
}

export const GeotechProPanel: React.FC<GeotechProPanelProps> = ({
  dem,
  boreholes,
  onPublishRaster,
}) => {
  // Bearing Capacity state
  const [bearingMethod, setBearingMethod] = useState<'terzaghi' | 'meyerhof'>('meyerhof');
  const [footingShape, setFootingShape] = useState<'strip' | 'square' | 'circular' | 'rectangular'>('square');
  const [widthBM, setWidthBM] = useState<number>(2.5);
  const [lengthLM, setLengthLM] = useState<number>(4.0);
  const [embedmentDfM, setEmbedmentDfM] = useState<number>(1.8);
  const [waterDepthM, setWaterDepthM] = useState<number>(boreholes[0]?.waterTableDepthM ?? 4.5);
  const [cohesionKpa, setCohesionKpa] = useState<number>(12);
  const [frictionDeg, setFrictionDeg] = useState<number>(31);
  const [unitWeightKnM3, setUnitWeightKnM3] = useState<number>(18.8);
  const [safetyFactor, setSafetyFactor] = useState<number>(3.0);

  // Settlement 1D state
  const [appliedPressKpa, setAppliedPressKpa] = useState<number>(160);
  const [elasticEsKpa, setElasticEsKpa] = useState<number>(28000);
  const [compCc, setCompCc] = useState<number>(0.16);
  const [voidE0, setVoidE0] = useState<number>(0.72);
  const [layerHm, setLayerHm] = useState<number>(4.5);

  // Seismic slope & LPI
  const [seismicKh, setSeismicKh] = useState<number>(0.18);
  const [slopeDeg, setSlopeDeg] = useState<number>(30);
  const [pgaG, setPgaG] = useState<number>(boreholes[0]?.pgaG ?? 0.36);
  const [selectedBhId, setSelectedBhId] = useState<string>(boreholes[0]?.id || '');

  // Geotech 3.0: Atterberg interactive classification
  const [labLL, setLabLL] = useState<number>(44);
  const [labLP, setLabLP] = useState<number>(22);

  const section = useMemo(() => buildBoreholeCrossSection(boreholes), [boreholes]);
  const bearingRes = useMemo(
    () =>
      computeBearingCapacity({
        method: bearingMethod,
        footingShape,
        widthBM,
        lengthLM,
        embedmentDfM,
        waterTableDepthM: waterDepthM,
        cohesionKpa,
        frictionDeg,
        unitWeightKnM3,
        safetyFactor,
      }),
    [bearingMethod, footingShape, widthBM, lengthLM, embedmentDfM, waterDepthM, cohesionKpa, frictionDeg, unitWeightKnM3, safetyFactor]
  );

  const settleRes = useMemo(
    () =>
      computeSettlement1D({
        appliedPressureKpa: appliedPressKpa,
        footingWidthBM: widthBM,
        soilElasticModulusKpa: elasticEsKpa,
        poissonRatio: 0.3,
        compressibleLayerHm: layerHm,
        compressionIndexCc: compCc,
        initialVoidRatioE0: voidE0,
        initialEffectiveStressKpa: 65,
      }),
    [appliedPressKpa, widthBM, elasticEsKpa, layerHm, compCc, voidE0]
  );

  const seismicRes = useMemo(
    () =>
      evaluateSeismicSlopeStability({
        method: 'simplified_bishop',
        slopeAngleDeg: slopeDeg,
        slopeHeightM: 15,
        failureDepthM: 5,
        unitWeightKnM3,
        cohesionKpa,
        frictionDeg,
        porePressureRatioRu: 0.2,
        seismicKh,
      }),
    [slopeDeg, unitWeightKnM3, cohesionKpa, frictionDeg, seismicKh]
  );

  const activeBh = boreholes.find((b) => b.id === selectedBhId) || boreholes[0];
  const lpiRes = useMemo(() => (activeBh ? computeBoreholeLpi(activeBh, pgaG) : null), [activeBh, pgaG]);
  const cptRows = useMemo(() => (activeBh ? interpretCptProfile(activeBh) : []), [activeBh]);
  const casagrandeCalc = useMemo(() => classifyAtterbergLabSample(labLL, labLP), [labLL, labLP]);

  const handlePublishSubsurface = (type: 'water' | 'bedrock' | 'uncertainty' | 'zoning') => {
    if (type === 'zoning') {
      const z = computeGeotechZoningMap(dem, boreholes);
      onPublishRaster(
        z.zoningGrid,
        `Zonificación geotécnica 2.0: Favorable ${z.countsByClass.favorablePct}%, Moderado ${z.countsByClass.moderadoPct}%, Restringido ${z.countsByClass.restringidoPct}%, Crítico ${z.countsByClass.criticoPct}%.`,
        'Zonificación Geotécnica 2.0'
      );
      return;
    }
    const sub = interpolateSubsurfaceSurfaces(boreholes, dem);
    if (type === 'water') {
      onPublishRaster(
        sub.waterTableDepthGrid,
        `Superficie IDW nivel freático (${boreholes.length} sondeos). Incertidumbre media: ±${sub.meanUncertaintyM} m al sondeo más cercano.`,
        'Nivel Freático IDW'
      );
    } else if (type === 'bedrock') {
      onPublishRaster(
        sub.bedrockDepthGrid,
        `Profundidad estrato competente/roca IDW (${boreholes.length} sondeos).`,
        'Horizonte Roca IDW'
      );
    } else {
      onPublishRaster(
        sub.uncertaintyDistanceGrid,
        `Mapa de incertidumbre espacial geotécnica (distancia media al sondeo más cercano: ${sub.meanUncertaintyM} m).`,
        'Incertidumbre Espacial Geotécnica'
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* Subsurface & Provenance Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-bold text-slate-800 mr-1">Trazabilidad de Datos:</span>
          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-semibold">Sondeos = Ensayo SPT / CPT Campo</span>
          <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-900 font-semibold">Superficies = Interpolación IDW</span>
          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">Cargas / Sismo = Modelo Analítico</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handlePublishSubsurface('zoning')}
            className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Publicar Zonificación Geotécnica</span>
          </button>
          {boreholes.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => handlePublishSubsurface('water')}
                className="px-2.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Freático IDW
              </button>
              <button
                type="button"
                onClick={() => handlePublishSubsurface('bedrock')}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Roca IDW
              </button>
              <button
                type="button"
                onClick={() => handlePublishSubsurface('uncertainty')}
                className="px-2.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Incertidumbre IDW
              </button>
            </>
          )}
        </div>
      </div>

      {/* Multi-Borehole Cross-Section SVG */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Ruler className="w-4 h-4 text-amber-700" />
            <span>Sección Estratigráfica Multi-Sondeo &amp; Nivel Freático ({boreholes.length} perforaciones SPT)</span>
          </h3>
          <span className="text-[11px] font-mono text-slate-500">
            Longitud perfil: {section.totalLengthM.toLocaleString()} m · Cota [{section.minElevM}..{section.maxElevM} msnm]
          </span>
        </div>

        {section.columns.length === 0 ? (
          <p className="text-xs text-slate-500">Sin sondeos SPT cargados en este proyecto.</p>
        ) : (
          <svg viewBox="0 0 760 220" className="w-full h-56 bg-slate-950 rounded-lg border border-slate-800">
            {(() => {
              const padL = 48;
              const padR = 48;
              const padT = 24;
              const padB = 28;
              const plotW = 760 - padL - padR;
              const plotH = 220 - padT - padB;
              const elevSpan = Math.max(section.maxElevM - section.minElevM, 5);
              const distSpan = Math.max(section.totalLengthM, 100);

              const toX = (d: number) =>
                section.columns.length === 1 ? 380 : padL + (d / distSpan) * plotW;
              const toY = (z: number) => padT + ((section.maxElevM - z) / elevSpan) * plotH;

              const wtLine = section.columns
                .map((col) => `${toX(col.distanceM).toFixed(1)},${toY(col.waterTableElevM).toFixed(1)}`)
                .join(' ');
              const surfLine = section.columns
                .map((col) => `${toX(col.distanceM).toFixed(1)},${toY(col.collarElevM).toFixed(1)}`)
                .join(' ');

              return (
                <>
                  {section.columns.length > 1 && (
                    <>
                      <polyline points={surfLine} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 3" />
                      <polyline points={wtLine} fill="none" stroke="#38bdf8" strokeWidth="1.8" />
                    </>
                  )}
                  {section.columns.map((col) => {
                    const cx = toX(col.distanceM);
                    return (
                      <g key={col.boreholeId}>
                        {col.strata.map((st, sIdx) => {
                          const yTop = toY(col.collarElevM - st.fromM);
                          const yBot = toY(col.collarElevM - st.toM);
                          const h = Math.max(4, yBot - yTop);
                          return (
                            <rect
                              key={sIdx}
                              x={cx - 14}
                              y={yTop}
                              width={28}
                              height={h}
                              fill={st.color || '#94a3b8'}
                              stroke="#0f172a"
                              strokeWidth="0.8"
                            />
                          );
                        })}
                        <text x={cx} y={toY(col.collarElevM) - 6} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#fbbf24">
                          {col.code} ({col.collarElevM}m)
                        </text>
                        <text x={cx} y={208} textAnchor="middle" fontSize="8" fill="#94a3b8">
                          {col.distanceM} m
                        </text>
                      </g>
                    );
                  })}
                  <text x="12" y="16" fontSize="8.5" fill="#38bdf8">
                    ── Nivel Freático (N.F.)
                  </text>
                  <text x="140" y="16" fontSize="8.5" fill="#10b981">
                    --- Cota Terreno
                  </text>
                </>
              );
            })()}
          </svg>
        )}
      </div>

      {/* Calculators Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Bearing Capacity + 1D Settlement */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <HardHat className="w-4 h-4 text-amber-700" />
            <span>Capacidad Portante (Terzaghi / Meyerhof) &amp; Asentamiento 1D</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Método</label>
              <select
                value={bearingMethod}
                onChange={(e) => setBearingMethod(e.target.value as any)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
              >
                <option value="meyerhof">Meyerhof (1963)</option>
                <option value="terzaghi">Terzaghi (1943)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Zapata</label>
              <select
                value={footingShape}
                onChange={(e) => setFootingShape(e.target.value as any)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
              >
                <option value="square">Cuadrada (B×B)</option>
                <option value="rectangular">Rectangular (B×L)</option>
                <option value="strip">Corrida</option>
                <option value="circular">Circular</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ancho B (m)</label>
              <input type="number" step="0.2" min="0.5" value={widthBM} onChange={(e) => setWidthBM(Number(e.target.value) || 2)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Desplante Df (m)</label>
              <input type="number" step="0.2" min="0.4" value={embedmentDfM} onChange={(e) => setEmbedmentDfM(Number(e.target.value) || 1.5)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cohesión c (kPa)</label>
              <input type="number" min="0" value={cohesionKpa} onChange={(e) => setCohesionKpa(Number(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fricción φ (°)</label>
              <input type="number" min="0" max="46" value={frictionDeg} onChange={(e) => setFrictionDeg(Number(e.target.value) || 30)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-[10px] text-slate-500 uppercase font-bold">Factores Nc/Nq/Nγ</p>
              <p className="font-mono font-bold text-slate-900">
                {bearingRes.nc} / {bearingRes.nq} / {bearingRes.nGamma}
              </p>
            </div>
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-[10px] text-amber-800 uppercase font-bold">q_ult (kPa)</p>
              <p className="font-mono font-bold text-amber-900">{bearingRes.qUltKpa}</p>
            </div>
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-[10px] text-emerald-800 uppercase font-bold">q_adm (FS={safetyFactor})</p>
              <p className="font-mono font-bold text-emerald-900">{bearingRes.qAdmKpa} kPa</p>
            </div>
            <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-[10px] text-indigo-800 uppercase font-bold">Asentamiento Total</p>
              <p className="font-mono font-bold text-indigo-900">{settleRes.totalSettlementMm} mm</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <label>
              Carga q (kPa):
              <input type="number" value={appliedPressKpa} onChange={(e) => setAppliedPressKpa(Number(e.target.value) || 100)} className="w-full mt-0.5 px-2 py-1 border border-slate-300 rounded font-mono" />
            </label>
            <label>
              Módulo Es (kPa):
              <input type="number" value={elasticEsKpa} onChange={(e) => setElasticEsKpa(Number(e.target.value) || 20000)} className="w-full mt-0.5 px-2 py-1 border border-slate-300 rounded font-mono" />
            </label>
            <label>
              Índice Cc:
              <input type="number" step="0.02" value={compCc} onChange={(e) => setCompCc(Number(e.target.value) || 0.15)} className="w-full mt-0.5 px-2 py-1 border border-slate-300 rounded font-mono" />
            </label>
          </div>
          <p className="text-[11px] text-slate-600 font-mono">
            Asentamiento inmediato Se: {settleRes.elasticImmediateMm} mm · Consolidación 1D Sc: {settleRes.consolidationPrimaryMm} mm · Estado límite 25mm: {settleRes.acceptable25mm ? 'CUMPLE' : 'EXCEDE'}
          </p>
        </div>

        {/* Seismic Pseudo-Static Slope + Multi-Stratum LPI */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-700" />
            <span>Estabilidad Sísmica Pseudo-Estática &amp; Índice LPI Multi-Estrato</span>
          </h3>

          <div className="grid grid-cols-3 gap-2.5 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Talud β (°)</label>
              <input type="number" value={slopeDeg} onChange={(e) => setSlopeDeg(Number(e.target.value) || 25)} className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Coef. Sísmico kh</label>
              <input type="number" step="0.02" min="0" max="0.4" value={seismicKh} onChange={(e) => setSeismicKh(Number(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">PGA Diseño (g)</label>
              <input type="number" step="0.02" min="0.05" max="0.8" value={pgaG} onChange={(e) => setPgaG(Number(e.target.value) || 0.3)} className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Bishop Estático (kh=0)</p>
              <p className="text-lg font-mono font-bold text-slate-900">FS = {seismicRes.staticFs}</p>
            </div>
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-[10px] font-bold text-rose-800 uppercase">Bishop Sísmico (kh={seismicKh})</p>
              <p className="text-lg font-mono font-bold text-rose-900">FS_s = {seismicRes.seismicFs}</p>
            </div>
          </div>
          <p className="text-[11px] font-semibold text-slate-700">{seismicRes.stabilityClass}</p>

          {activeBh && lpiRes && (
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <select
                  value={activeBh.id}
                  onChange={(e) => setSelectedBhId(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  {boreholes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.name} (N.F. {b.waterTableDepthM}m)
                    </option>
                  ))}
                </select>
                <span className="px-2.5 py-1 bg-slate-900 text-white rounded text-xs font-mono font-bold">
                  LPI = {lpiRes.lpi} · {lpiRes.riskCategory}
                </span>
              </div>
              <div className="max-h-32 overflow-y-auto text-[11px] border border-slate-200 rounded-lg divide-y divide-slate-100">
                {lpiRes.strataEvaluated.map((st, idx) => (
                  <div key={idx} className="px-2.5 py-1 flex items-center justify-between">
                    <span className="font-mono">
                      {st.fromM}–{st.toM}m ({st.uscs}, N60={st.sptN60})
                    </span>
                    <span className="font-mono font-bold">
                      FS_liq={st.fsLiq} · ΔLPI={st.lpiContribution}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-950 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>{bearingRes.methodologyNote}</span>
          </div>
        </div>
      </div>

      {/* GEOTECH 3.0: CPT ROBERTSON SBT + LAB TESTS + EQUATION CATALOG */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-slate-900">
            Geotecnia 3.0 — Perfil CPT (Robertson SBT Ic) &amp; Laboratorio Atterberg
          </h3>
          {cptRows.length > 0 ? (
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-[11px] text-left border-collapse font-mono tabular-nums">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-sans uppercase text-slate-500">
                  <tr>
                    <th className="py-1.5 px-2">Prof (m)</th>
                    <th className="py-1.5 px-2 text-right">qc (MPa)</th>
                    <th className="py-1.5 px-2 text-right">Rf (%)</th>
                    <th className="py-1.5 px-2 text-right">Ic</th>
                    <th className="py-1.5 px-2 font-sans">Comportamiento SBT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cptRows.map((row) => (
                    <tr key={row.depthM}>
                      <td className="py-1 px-2">{row.depthM} m</td>
                      <td className="py-1 px-2 text-right">{row.qcMpa}</td>
                      <td className="py-1 px-2 text-right">{row.frictionRatioRfPct}%</td>
                      <td className="py-1 px-2 text-right font-bold text-amber-800">{row.sbtIndexIc}</td>
                      <td className="py-1 px-2 font-sans text-slate-700">{row.soilBehaviorType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-500">El sondeo seleccionado no incluye lecturas CPTu.</p>
          )}

          {/* Recorded Lab Tests + Interactive Casagrande Calculator */}
          {(activeBh?.labTests || []).length > 0 && (
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <p className="font-bold text-slate-800">Ensayos de Laboratorio Registrados ({activeBh?.code})</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left border-collapse font-mono">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-sans uppercase text-slate-500">
                    <tr>
                      <th className="py-1 px-2">Muestra</th>
                      <th className="py-1 px-2">Prof</th>
                      <th className="py-1 px-2">LL / LP / IP</th>
                      <th className="py-1 px-2">Finos</th>
                      <th className="py-1 px-2">c&apos; / φ&apos;</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(activeBh?.labTests || []).map((lt) => (
                      <tr key={lt.sampleId}>
                        <td className="py-1 px-2 font-bold">{lt.sampleId}</td>
                        <td className="py-1 px-2">{lt.depthM}m</td>
                        <td className="py-1 px-2">{lt.liquidLimitPct} / {lt.plasticLimitPct} / {lt.plasticityIndexPct}%</td>
                        <td className="py-1 px-2">{lt.finesPct}%</td>
                        <td className="py-1 px-2">{lt.cohesionKpa} kPa / {lt.frictionDeg}°</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
            <label>
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Límite Líquido LL (%)</span>
              <input type="number" value={labLL} onChange={(e) => setLabLL(Number(e.target.value) || 0)} className="w-full px-2 py-1 border border-slate-300 rounded font-mono" />
            </label>
            <label>
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Límite Plástico LP (%)</span>
              <input type="number" value={labLP} onChange={(e) => setLabLP(Number(e.target.value) || 0)} className="w-full px-2 py-1 border border-slate-300 rounded font-mono" />
            </label>
            <div className="col-span-2 p-2 bg-slate-50 border border-slate-200 rounded">
              <span className="font-mono font-bold text-slate-900 block">
                IP = {casagrandeCalc.ipPct}% · Riesgo Expansión: {casagrandeCalc.expansivityRisk}
              </span>
              <span className="text-[11px] text-slate-700">{casagrandeCalc.casagrandeClass}</span>
            </div>
          </div>
        </div>

        {/* Scientific Equation & Method Catalog */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-slate-900">
            Catálogo de Ecuaciones, Parámetros &amp; Referencias Científicas
          </h3>
          <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {GEOTECH_EQUATIONS_CATALOG.map((eq) => (
              <div key={eq.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p className="font-bold text-slate-900">{eq.title}</p>
                <p className="font-mono text-[11px] text-emerald-800 bg-white px-2 py-1 rounded border border-slate-200">
                  {eq.equationLatexPlain}
                </p>
                <p className="text-[11px] text-slate-600">
                  <strong>Fuente:</strong> {eq.sourceReference} · <strong>Alcance:</strong> {eq.applicableScope}
                </p>
                <p className="text-[11px] text-amber-900">
                  <strong>Limitación:</strong> {eq.limitations.join(' ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
