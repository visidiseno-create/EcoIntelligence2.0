import React, { useMemo, useState } from 'react';
import { ShieldCheck, AlertTriangle, Compass, Layers, Play, FlaskConical, HardHat, Droplets, FileCheck2 } from 'lucide-react';
import { DemGrid, GeotechProject } from '../../utils/geotechEngine';
import { computeConsolidatedQualityScore } from '../../utils/dataQualityEngine';
import { computeSpatialUncertaintyAnalysis } from '../../utils/geoEngine3';
import { renderGridToDataUrl } from './GisMap2DCanvas';
import { ensurePrecisionUncertainty } from '../../utils/reproducibility4';
import { generateProjectQualityReport } from '../../utils/enterpriseOps4';
import {
  GEOTECH_PRELIMINARY_DISCLAIMER,
  runGeotechValidationBattery,
  runHydrologyValidationSuite,
  runScientificValidationBattery,
} from '../../utils/scientificValidation4';

interface QualityUncertaintyPanelProps {
  project: GeotechProject;
  onPublishRaster: (grid: DemGrid, summary: string, toolName: string) => void;
}

export const QualityUncertaintyPanel: React.FC<QualityUncertaintyPanelProps> = ({
  project,
  onPublishRaster,
}) => {
  const vectorLayers = useMemo(
    () => project.layers.filter((l) => l.kind === 'vector' && l.geojson),
    [project.layers]
  );
  const pointLayers = useMemo(
    () => vectorLayers.filter((l) => l.geojson?.features.some((f) => f.geometry?.type === 'Point')),
    [vectorLayers]
  );

  const [auditLayerId, setAuditLayerId] = useState<string>(vectorLayers[0]?.id || '');
  const [uncLayerId, setUncLayerId] = useState<string>(pointLayers[0]?.id || vectorLayers[0]?.id || '');

  const auditLayer = useMemo(
    () => vectorLayers.find((l) => l.id === auditLayerId) || vectorLayers[0],
    [vectorLayers, auditLayerId]
  );
  const uncLayer = useMemo(
    () => vectorLayers.find((l) => l.id === uncLayerId) || pointLayers[0] || vectorLayers[0],
    [vectorLayers, pointLayers, uncLayerId]
  );

  const numericFields = useMemo(() => {
    const props = uncLayer?.geojson?.features[0]?.properties || {};
    return Object.entries(props)
      .filter(([, v]) => typeof v === 'number' || (!Number.isNaN(Number(v)) && String(v).trim() !== ''))
      .map(([k]) => k);
  }, [uncLayer]);

  const [uncField, setUncField] = useState<string>(numericFields[0] || '');
  const effectiveField = numericFields.includes(uncField) ? uncField : numericFields[0] || '';

  // 4.0 Validation Batteries State
  const [sciValidation, setSciValidation] = useState<ReturnType<typeof runScientificValidationBattery> | null>(null);
  const [geoValidation, setGeoValidation] = useState<ReturnType<typeof runGeotechValidationBattery> | null>(null);
  const [hydroValidation, setHydroValidation] = useState<ReturnType<typeof runHydrologyValidationSuite> | null>(null);

  const aiProjectReport = useMemo(() => generateProjectQualityReport(project), [project]);

  const qualityReport = useMemo(
    () =>
      computeConsolidatedQualityScore({
        vectorLayer: auditLayer?.geojson ? { name: auditLayer.name, geojson: auditLayer.geojson } : undefined,
        rasterGrid: project.dem,
        referenceDem: project.dem,
        lidarPoints: project.lidarCloud,
      }),
    [auditLayer, project.dem, project.lidarCloud]
  );

  const uncertaintyReport = useMemo(() => {
    if (!uncLayer?.geojson || !effectiveField) return null;
    try {
      return computeSpatialUncertaintyAnalysis(uncLayer.geojson, effectiveField, project.dem);
    } catch {
      return null;
    }
  }, [uncLayer, effectiveField, project.dem]);

  const explicitUncertainty = useMemo(
    () => (uncertaintyReport ? ensurePrecisionUncertainty(uncertaintyReport.precisionEnvelope) : null),
    [uncertaintyReport]
  );

  const resultMapUrl = useMemo(
    () => (uncertaintyReport ? renderGridToDataUrl(uncertaintyReport.resultGrid) : ''),
    [uncertaintyReport]
  );
  const confidenceMapUrl = useMemo(
    () => (uncertaintyReport ? renderGridToDataUrl(uncertaintyReport.confidenceGrid) : ''),
    [uncertaintyReport]
  );

  return (
    <div className="space-y-5">
      {/* SECTION 1: DATA QUALITY ENGINE & GIS DATA QUALITY SCORE */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>Motor de Calidad de Datos Geoespaciales (GIS DATA QUALITY SCORE)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Auditoría independiente de topología vectorial, integridad radiométrica ráster y densidad ASPRS LiDAR.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={auditLayer?.id || ''}
              onChange={(e) => setAuditLayerId(e.target.value)}
              aria-label="Capa vectorial a auditar"
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-medium"
            >
              {vectorLayers.map((l) => (
                <option key={l.id} value={l.id}>
                  Vector: {l.name}
                </option>
              ))}
            </select>
            <div className="px-3.5 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-mono font-bold tabular-nums">
              SCORE GLOBAL: {qualityReport.overallScore}/100 ({qualityReport.grade})
            </div>
          </div>
        </div>

        {/* 3 Domain Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Vector Quality */}
          {qualityReport.vectorReport && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-900">
                <span>1. Calidad Vectorial</span>
                <span className="font-mono text-emerald-700">
                  {qualityReport.vectorReport.score}/100 (Grado {qualityReport.vectorReport.grade})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono text-slate-700">
                <span>Entidades: {qualityReport.vectorReport.featureCount}</span>
                <span>Auto-intersec.: {qualityReport.vectorReport.selfIntersections}</span>
                <span>Duplicadas: {qualityReport.vectorReport.duplicateGeometries}</span>
                <span>Superposiciones: {qualityReport.vectorReport.overlapsCount}</span>
                <span>Atrib. incomp.: {qualityReport.vectorReport.incompleteAttributesCount}</span>
                <span>Fuera WGS84: {qualityReport.vectorReport.crsOutOfBoundsCount}</span>
              </div>
              {qualityReport.vectorReport.issues.length > 0 && (
                <div className="pt-1 space-y-1">
                  {qualityReport.vectorReport.issues.map((iss, idx) => (
                    <p key={idx} className="text-[11px] text-amber-900">
                      • [{iss.code}] {iss.message} ({iss.count})
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Raster Quality */}
          {qualityReport.rasterReport && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-900">
                <span>2. Calidad Ráster / DEM</span>
                <span className="font-mono text-emerald-700">
                  {qualityReport.rasterReport.score}/100 (Grado {qualityReport.rasterReport.grade})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono text-slate-700">
                <span>Celdas: {qualityReport.rasterReport.totalCells}</span>
                <span>NaN / Inf: {qualityReport.rasterReport.nanOrInfCount}</span>
                <span>NoData: {qualityReport.rasterReport.noDataPct}%</span>
                <span>Fuera rango: {qualityReport.rasterReport.outOfRangeCount}</span>
                <span>Constante: {qualityReport.rasterReport.flatConstantRatioPct}%</span>
                <span>CRS válido: {qualityReport.rasterReport.crsMismatch ? 'NO' : 'SÍ'}</span>
              </div>
              {qualityReport.rasterReport.issues.length > 0 && (
                <div className="pt-1 space-y-1">
                  {qualityReport.rasterReport.issues.map((iss, idx) => (
                    <p key={idx} className="text-[11px] text-amber-900">
                      • [{iss.code}] {iss.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LiDAR Quality */}
          {qualityReport.lidarReport && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-900">
                <span>3. Calidad Nube LiDAR</span>
                <span className="font-mono text-emerald-700">
                  {qualityReport.lidarReport.score}/100 (Grado {qualityReport.lidarReport.grade})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono text-slate-700">
                <span>Puntos: {qualityReport.lidarReport.pointCount.toLocaleString()}</span>
                <span>Densidad: {qualityReport.lidarReport.meanDensityPtsM2} pts/m²</span>
                <span>Duplicados: {qualityReport.lidarReport.duplicatePoints}</span>
                <span>Outliers &gt;4.5σ: {qualityReport.lidarReport.extremeOutliers}</span>
                <span>Huecos: {qualityReport.lidarReport.spatialGapsPct}%</span>
                <span>CV densidad: {qualityReport.lidarReport.irregularDensityCvPct}%</span>
              </div>
              {qualityReport.lidarReport.issues.length > 0 && (
                <div className="pt-1 space-y-1">
                  {qualityReport.lidarReport.issues.map((iss, idx) => (
                    <p key={idx} className="text-[11px] text-amber-900">
                      • [{iss.code}] {iss.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-950">
          <strong>Dictamen Técnico de Saneamiento:</strong> {qualityReport.recommendations.join(' | ')}
        </div>
      </div>

      {/* SECTION 2: SPATIAL UNCERTAINTY & SENSITIVITY ENGINE */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Compass className="w-4 h-4 text-sky-700" />
              <span>Motor de Incertidumbre Espacial &amp; Análisis de Sensibilidad AHP</span>
            </h3>
            <p className="text-xs text-slate-500">
              Distingue visualmente el resultado interpolado frente a la confianza espacial real según densidad de muestreo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={uncLayer?.id || ''}
              onChange={(e) => setUncLayerId(e.target.value)}
              aria-label="Capa muestreo incertidumbre"
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
            >
              {vectorLayers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              value={effectiveField}
              onChange={(e) => setUncField(e.target.value)}
              aria-label="Variable numérica incertidumbre"
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
            >
              {numericFields.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        {uncertaintyReport ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Confianza Media</p>
                <p className="text-base font-mono font-bold tabular-nums text-sky-800">
                  {uncertaintyReport.overallConfidenceScore}%
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Baja Confianza (&lt;45%)</p>
                <p className="text-base font-mono font-bold tabular-nums text-amber-800">
                  {uncertaintyReport.lowConfidencePct}% área
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Densidad Muestreo</p>
                <p className="text-base font-mono font-bold tabular-nums text-slate-900">
                  {uncertaintyReport.sampleDensityPerKm2} pts/km²
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Dist. Media Muestra</p>
                <p className="text-base font-mono font-bold tabular-nums text-slate-900">
                  {uncertaintyReport.meanNearestSampleM} m
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Dist. Máx Vacío</p>
                <p className="text-base font-mono font-bold tabular-nums text-rose-700">
                  {uncertaintyReport.maxNearestSampleM} m
                </p>
              </div>
            </div>

            {uncertaintyReport.lowConfidencePct > 35 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  Advertencia de Cobertura: {uncertaintyReport.lowConfidencePct}% del dominio supera el radio de soporte muestral; se recomienda densificar muestreo en campo antes de decisiones constructivas.
                </span>
              </div>
            )}

            {explicitUncertainty && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
                <p className="font-bold text-slate-900">
                  Declaración Obligatoria de Resultado, Confianza y Limitaciones (4.0)
                </p>
                <p className="text-slate-800">
                  <strong>RESULTADO:</strong> {explicitUncertainty.resultado}
                </p>
                <p className="text-sky-900">
                  <strong>CONFIANZA:</strong> {explicitUncertainty.confianza}
                </p>
                <div className="text-amber-900">
                  <strong>LIMITACIONES:</strong>
                  <ul className="list-disc pl-4 mt-0.5 space-y-0.5 text-[11px]">
                    {explicitUncertainty.limitaciones.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Side-by-side Result vs Confidence Maps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-200">
                  <span className="font-bold">Mapa 1: Resultado Interpolado ({effectiveField})</span>
                  <button
                    type="button"
                    onClick={() =>
                      onPublishRaster(
                        uncertaintyReport.resultGrid,
                        uncertaintyReport.precisionEnvelope.resultSummary,
                        'Incertidumbre Espacial — Resultado'
                      )
                    }
                    className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Layers className="w-3 h-3" />
                    <span>Publicar</span>
                  </button>
                </div>
                <img
                  src={resultMapUrl}
                  alt="Mapa Resultado Interpolado"
                  className="w-full max-w-[260px] mx-auto aspect-square object-contain rounded border border-slate-800"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>

              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-200">
                  <span className="font-bold">Mapa 2: Confianza Espacial (0–100%)</span>
                  <button
                    type="button"
                    onClick={() =>
                      onPublishRaster(
                        uncertaintyReport.confidenceGrid,
                        `Mapa de confianza espacial (${uncertaintyReport.overallConfidenceScore}% media).`,
                        'Mapa de Confianza Espacial 3.0'
                      )
                    }
                    className="px-2.5 py-1 bg-sky-700 hover:bg-sky-600 text-white rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Layers className="w-3 h-3" />
                    <span>Publicar</span>
                  </button>
                </div>
                <img
                  src={confidenceMapUrl}
                  alt="Mapa de Confianza Espacial"
                  className="w-full max-w-[260px] mx-auto aspect-square object-contain rounded border border-slate-800"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </div>

            {/* Parameter Sensitivity Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="py-2 px-3">Parámetro Evaluado (Sensibilidad ±15%)</th>
                    <th className="py-2 px-3 text-right">Score Base</th>
                    <th className="py-2 px-3 text-right">+15% Peso</th>
                    <th className="py-2 px-3 text-right">-15% Peso</th>
                    <th className="py-2 px-3 text-right">Índice Sensibilidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {uncertaintyReport.sensitivitySummary.map((row) => (
                    <tr key={row.parameter}>
                      <td className="py-1.5 px-3 font-sans font-medium text-slate-800">{row.parameter}</td>
                      <td className="py-1.5 px-3 text-right">{row.baselineScore}</td>
                      <td className="py-1.5 px-3 text-right">{row.perturbedPlus15Pct}</td>
                      <td className="py-1.5 px-3 text-right">{row.perturbedMinus15Pct}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-indigo-700">
                        {row.sensitivityIndexPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Elija una capa vectorial con atributos numéricos para generar el mapa dual Resultado vs Confianza.
          </p>
        )}
      </div>

      {/* SECTION 3: AI PROJECT REVIEWER (PROJECT QUALITY REPORT) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-indigo-700" />
              <span>AI Project Reviewer — {aiProjectReport.reportTitle}</span>
            </h3>
            <p className="text-xs text-slate-500">
              Auditoría automática de CRS, geometrías, NoData, vigencia, fuentes, parámetros geotécnicos e incertidumbre (9 dimensiones).
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-mono font-bold">
              {aiProjectReport.score}/100 (Grado {aiProjectReport.grade})
            </span>
            <span
              className={`px-3 py-1.5 rounded-lg font-bold ${
                aiProjectReport.publishReady ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {aiProjectReport.publishReady ? 'APTO PUBLICACIÓN' : 'BLOQUEADO PARA PUBLICAR'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {aiProjectReport.checkedDimensions.map((dim) => (
            <span key={dim} className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-700 font-medium">
              ✓ {dim}
            </span>
          ))}
        </div>

        {aiProjectReport.findings.length === 0 ? (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-medium">
            Sin hallazgos críticos ni inconsistencias detectadas. El proyecto cumple los requisitos técnicos para flujo de aprobación oficial.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {aiProjectReport.findings.map((f) => (
              <div key={f.id} className="p-3 flex flex-wrap items-start justify-between gap-2 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        f.severity === 'CRÍTICO'
                          ? 'bg-rose-100 text-rose-800'
                          : f.severity === 'ALTO'
                          ? 'bg-amber-100 text-amber-900'
                          : f.severity === 'MEDIO'
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {f.severity}
                    </span>
                    <strong className="text-slate-900">{f.target}</strong>
                    <span className="font-mono text-[10px] text-slate-400">[{f.code}]</span>
                  </div>
                  <p className="text-slate-700">{f.detail}</p>
                  <p className="text-[11px] text-emerald-800 font-medium">Recomendación: {f.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 4: SCIENTIFIC VALIDATION (20 ALGORITHMS) + GEOTECH (13 METHODS) + HYDROLOGY */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-emerald-700" />
              <span>Framework de Validación Científica, Geotécnica (13 Métodos) e Hidrológica 4.0</span>
            </h3>
            <p className="text-xs text-slate-500">
              Contrastación reproducible de 20 algoritmos espaciales, 13 métodos geotécnicos y sensibilidad hidrológica contra casos analíticos exactos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSciValidation(runScientificValidationBattery())}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Validación Científica (20 Algoritmos)</span>
            </button>
            <button
              type="button"
              onClick={() => setGeoValidation(runGeotechValidationBattery())}
              className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <HardHat className="w-3.5 h-3.5" />
              <span>Validación Geotécnica (13 Métodos)</span>
            </button>
            <button
              type="button"
              onClick={() => setHydroValidation(runHydrologyValidationSuite(project.dem))}
              className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Droplets className="w-3.5 h-3.5" />
              <span>Validación Hidrológica &amp; Sensibilidad</span>
            </button>
          </div>
        </div>

        {/* Scientific 20 Algorithms Results */}
        {sciValidation && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <strong className="text-slate-900">
                Batería Científica (20 Algoritmos): {sciValidation.passedCount}/{sciValidation.totalCount} aprobados ({sciValidation.passRatePct}%)
              </strong>
              <span className="font-mono text-[11px] text-slate-500">{sciValidation.executedAt.slice(0, 19)}</span>
            </div>
            <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-lg">
              <table className="w-full text-[11px] text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500 sticky top-0">
                  <tr>
                    <th className="py-2 px-2">#</th>
                    <th className="py-2 px-2">Algoritmo</th>
                    <th className="py-2 px-2">Caso Referencia</th>
                    <th className="py-2 px-2 text-right">Esperado</th>
                    <th className="py-2 px-2 text-right">Calculado</th>
                    <th className="py-2 px-2 text-right">Error / Tol.</th>
                    <th className="py-2 px-2 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sciValidation.cases.map((c) => (
                    <tr key={c.id}>
                      <td className="py-1.5 px-2 font-mono text-slate-400">{c.id}</td>
                      <td className="py-1.5 px-2 font-semibold text-slate-900">{c.algorithm}</td>
                      <td className="py-1.5 px-2 text-slate-600">{c.referenceCase}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{String(c.expectedValue)}</td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900">{String(c.actualValue)}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-slate-500">
                        {c.absError} / {c.tolerance} {c.unit}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                            c.status === 'APROBADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Geotech 13 Methods Results */}
        {geoValidation && (
          <div className="space-y-2.5">
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-950 font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{geoValidation.disclaimer || GEOTECH_PRELIMINARY_DISCLAIMER}</span>
            </div>
            <p className="text-xs font-bold text-slate-900">
              Validación Geotécnica: {geoValidation.passedCount}/{geoValidation.totalCount} métodos verificados
            </p>
            <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-lg">
              <table className="w-full text-[11px] text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500 sticky top-0">
                  <tr>
                    <th className="py-2 px-2">Método</th>
                    <th className="py-2 px-2">Ecuación &amp; Supuestos</th>
                    <th className="py-2 px-2 text-right">Calculado</th>
                    <th className="py-2 px-2 text-right">Sensib. Δ%</th>
                    <th className="py-2 px-2">Referencia</th>
                    <th className="py-2 px-2 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {geoValidation.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-1.5 px-2 font-semibold text-slate-900">
                        {item.id}. {item.method}
                        <span className="block text-[10px] font-mono text-slate-500">{item.parameters}</span>
                      </td>
                      <td className="py-1.5 px-2 text-slate-700">
                        <code className="font-mono text-[10px] text-indigo-800">{item.equation}</code>
                        <span className="block text-[10px] text-slate-500">{item.assumptions}</span>
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900">
                        {String(item.computedResult)} {item.unit}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-sky-800">{item.sensitivityDeltaPct}%</td>
                      <td className="py-1.5 px-2 text-slate-600">{item.bibliographicRef}</td>
                      <td className="py-1.5 px-2 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                            item.status === 'APROBADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Hydrology Validation & Sensitivity Results */}
        {hydroValidation && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-900">
              Validación Hidrológica ({hydroValidation.demName}): {hydroValidation.passedCount}/{hydroValidation.totalCount} componentes aprobados
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="py-2 px-2">Componente Hidrológico</th>
                      <th className="py-2 px-2">Métrica</th>
                      <th className="py-2 px-2 text-right">Valor</th>
                      <th className="py-2 px-2 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {hydroValidation.checks.map((ck) => (
                      <tr key={ck.id}>
                        <td className="py-1.5 px-2 font-semibold text-slate-900">{ck.component}</td>
                        <td className="py-1.5 px-2 text-slate-600">{ck.metric}</td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold">{String(ck.value)}</td>
                        <td className="py-1.5 px-2 text-right">
                          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-mono font-bold text-[10px]">
                            {ck.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="py-2 px-2">Parámetro Sensibilidad</th>
                      <th className="py-2 px-2 text-right">Base → Perturbado</th>
                      <th className="py-2 px-2 text-right">Δ%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {hydroValidation.sensitivity.map((row) => (
                      <tr key={row.variable}>
                        <td className="py-1.5 px-2 font-semibold text-slate-900">
                          {row.variable}
                          <span className="block text-[10px] font-normal text-slate-500">{row.perturbation}</span>
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono">
                          {row.baselineQ} → {row.perturbedQ}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-indigo-700">
                          {row.deltaPct > 0 ? `+${row.deltaPct}%` : `${row.deltaPct}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
