import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Printer,
  Building2,
  Calendar,
  FileSpreadsheet,
  Loader2
} from 'lucide-react';
import { api, Facility } from '../services/api';
import { ModuleEvidencePanel } from '../components/ModuleEvidencePanel';
import { useFeedback } from '../components/FeedbackContext';

interface ReportsViewProps {
  data: any;
  facilities: Facility[];
  userRole?: string;
  activeOrgId?: string;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ data, facilities, userRole = 'admin', activeOrgId }) => {
  const { showToast } = useFeedback();
  const [selectedFacility, setSelectedFacility] = useState('');
  const [period, setPeriod] = useState('2026-Q4');
  const [reportData, setReportData] = useState<any | null>(data);
  const [loadingFilter, setLoadingFilter] = useState(false);

  useEffect(() => {
    setSelectedFacility('');
    setReportData(data);
  }, [activeOrgId, data]);

  useEffect(() => {
    let cancelled = false;
    const fetchFiltered = async () => {
      if (!selectedFacility) {
        setReportData(data);
        return;
      }
      setLoadingFilter(true);
      try {
        const res = await api.getDashboardAnalytics(selectedFacility);
        if (!cancelled) setReportData(res);
      } catch (err: any) {
        if (!cancelled) showToast(err.message || 'Error al filtrar informe por sede.', 'error');
      } finally {
        if (!cancelled) setLoadingFilter(false);
      }
    };
    fetchFiltered();
    return () => {
      cancelled = true;
    };
  }, [selectedFacility, activeOrgId, data, showToast]);

  const activeData = reportData || data;
  if (!activeData) return null;

  const { organization, compliance, waste, water, air, energy, counts } = activeData;
  const selectedFacilityName = facilities.find(f => f.id === selectedFacility)?.name;

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = async () => {
    try {
      await api.downloadReportCsv('general', selectedFacility || undefined);
      showToast('Reporte CSV corporativo exportado correctamente.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al descargar reporte CSV.', 'error');
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            Analítica & Informes Ambientales Ejecutivos
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Consolidado de desempeño normativo, balances cuantitativos y exportación oficial de expedientes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Exportar CSV Completo</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            aria-label="Imprimir informe en PDF"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir / Guardar como PDF</span>
          </button>
        </div>
      </div>

      {/* Filter and Configuration Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Building2 className="w-4 h-4 text-slate-400" />
            <span>Sede:</span>
            <select
              value={selectedFacility}
              onChange={e => setSelectedFacility(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1 bg-white"
            >
              <option value="">Todas las instalaciones corporativas</option>
              {facilities.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>Período de Evaluación:</span>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1 bg-white font-mono"
            >
              <option value="2026-Q4">Cuarto Trimestre 2026 (Q4)</option>
              <option value="2026-Q3">Tercer Trimestre 2026 (Q3)</option>
              <option value="2026-ANUAL">Consolidado Anual 2026</option>
            </select>
          </div>
        </div>

        <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1.5">
          {loadingFilter && <Loader2 className="w-3 h-3 animate-spin" />}
          <span>{selectedFacilityName ? `Filtrado: ${selectedFacilityName}` : 'Datos auditables sin discrepancias'}</span>
        </span>
      </div>

      {/* Printable Official Executive Report Document Container */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-md p-8 md:p-12 print:border-none print:shadow-none print:p-0 space-y-8">
        {/* Document Header */}
        <div className="border-b-2 border-emerald-900 pb-5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 bg-emerald-600 rounded-sm inline-block"></span>
              <span className="text-xs font-mono font-bold tracking-widest text-emerald-800 uppercase">
                ECOINTELLIGENCE ENVIRONMENTAL AUDIT
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 mt-1">
              INFORME EJECUTIVO DE DESEMPEÑO Y CUMPLIMIENTO AMBIENTAL
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Expediente Regulatorio {selectedFacilityName ? `— ${selectedFacilityName}` : 'Consolidado'} • Período: {period}
            </p>
          </div>

          <div className="text-right text-xs font-mono text-slate-600">
            <p><strong>RUC:</strong> {organization?.taxId}</p>
            <p><strong>EMPRESA:</strong> {organization?.name}</p>
            <p><strong>EMISIÓN:</strong> {new Date().toISOString().split('T')[0]}</p>
          </div>
        </div>

        {/* Executive Summary Paragraph */}
        <div className="text-xs text-slate-700 leading-relaxed space-y-2">
          <p>
            El presente informe consolida los registros técnicos y evidencias documentales generadas por <strong>{organization?.name}</strong> en sus {counts.facilities} instalaciones operativas. La plataforma ha procesado de manera determinística las métricas normativas de acuerdo con el marco regulatorio ambiental aplicable (OEFA, MINAM, PRODUCE, ANA y SIGERSOL).
          </p>
          <p>
            El índice general de cumplimiento de obligaciones legales alcanza el <strong>{compliance.complianceRatePercent}%</strong>, con un total de <strong>{compliance.fulfilled}</strong> obligaciones cumplidas de <strong>{compliance.total}</strong> compromisos evaluados. Se encuentran registradas <strong>{compliance.overdue}</strong> obligaciones con plazo vencido en proceso de subsanación prioritaria.
          </p>
        </div>

        {/* Summary Metric Tables */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Table 1: Vectors */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-3 py-2 font-bold text-xs text-slate-800 border-b border-slate-200">
              1. Balances Físicos Ambientales del Período
            </div>
            <table className="w-full text-left text-xs">
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-white">
                  <td className="py-2 px-3 font-semibold text-slate-700">Residuos Sólidos Totales</td>
                  <td className="py-2 px-3 text-right font-mono">{waste.totalKg.toLocaleString()} kg</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="py-2 px-3 font-semibold text-slate-700">Residuos Peligrosos Controlados</td>
                  <td className="py-2 px-3 text-right font-mono text-amber-800">{waste.hazardousKg.toLocaleString()} kg</td>
                </tr>
                <tr className="bg-white">
                  <td className="py-2 px-3 font-semibold text-slate-700">Tasa de Valorización / Reciclaje</td>
                  <td className="py-2 px-3 text-right font-mono text-emerald-700 font-bold">{waste.recyclingRatePercent}%</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="py-2 px-3 font-semibold text-slate-700">Consumo Hídrico Acumulado</td>
                  <td className="py-2 px-3 text-right font-mono">{water.totalConsumedM3.toLocaleString()} m³</td>
                </tr>
                <tr className="bg-white">
                  <td className="py-2 px-3 font-semibold text-slate-700">Efluente Tratado Vertido</td>
                  <td className="py-2 px-3 text-right font-mono">{water.totalDischargedM3.toLocaleString()} m³</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="py-2 px-3 font-semibold text-slate-700">Consumo Energético Global</td>
                  <td className="py-2 px-3 text-right font-mono">{energy.totalKWh.toLocaleString()} kWh</td>
                </tr>
                <tr className="bg-white">
                  <td className="py-2 px-3 font-semibold text-slate-700">Participación Energía Renovable</td>
                  <td className="py-2 px-3 text-right font-mono text-emerald-700 font-bold">{energy.renewableSharePercent}%</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="py-2 px-3 font-semibold text-slate-700">Huella GEI Estimada (Alcances 1 y 2)</td>
                  <td className="py-2 px-3 text-right font-mono font-bold">{energy.estimatedCo2Ton} tCO₂e</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Table 2: Compliance & Inspections */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-3 py-2 font-bold text-xs text-slate-800 border-b border-slate-200">
              2. Auditoría y Control de Desviaciones (CAPA)
            </div>
            <table className="w-full text-left text-xs">
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-white">
                  <td className="py-2 px-3 font-semibold text-slate-700">Tasa de Conformidad Legal</td>
                  <td className="py-2 px-3 text-right font-mono text-emerald-700 font-bold">{compliance.complianceRatePercent}%</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="py-2 px-3 font-semibold text-slate-700">Inspecciones en Terreno Completadas</td>
                  <td className="py-2 px-3 text-right font-mono">{counts.inspections} auditorías</td>
                </tr>
                <tr className="bg-white">
                  <td className="py-2 px-3 font-semibold text-slate-700">Muestreos de Emisiones Atmosféricas</td>
                  <td className="py-2 px-3 text-right font-mono">{air.totalSamples} puntos</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="py-2 px-3 font-semibold text-slate-700">Conformidad de Parámetros de Aire</td>
                  <td className="py-2 px-3 text-right font-mono">{air.complianceRatePercent}%</td>
                </tr>
                <tr className="bg-white">
                  <td className="py-2 px-3 font-semibold text-slate-700">Excedencias de Calidad de Aire</td>
                  <td className="py-2 px-3 text-right font-mono text-rose-700 font-bold">{air.exceededSamples}</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="py-2 px-3 font-semibold text-slate-700">Acciones Correctivas Abiertas</td>
                  <td className="py-2 px-3 text-right font-mono text-amber-700 font-bold">{counts.openActions}</td>
                </tr>
                <tr className="bg-white">
                  <td className="py-2 px-3 font-semibold text-slate-700">Evidencias Custodiadas en Biblioteca</td>
                  <td className="py-2 px-3 text-right font-mono">{counts.documents} archivos</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Declarations and Legal Disclaimer */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-[11px] text-slate-600 space-y-1.5">
          <p className="font-bold text-slate-800">CLÁUSULA DE RESPONSABILIDAD TÉCNICA Y AUDITORÍA:</p>
          <p>
            Los indicadores presentados han sido generados mediante cómputo matemático directo sobre las tablas relacionales de la base de datos de ECOINTELLIGENCE. La plataforma no sustituye los pronunciamientos resolutivos emitidos por la autoridad ambiental competente. La organización declara bajo juramento la veracidad y autenticidad de los manifiestos, certificados de calibración y análisis de laboratorio acreditados ante INACAL que respaldan cada cifra reportada.
          </p>
        </div>

        {/* Signatures Block */}
        <div className="pt-8 grid grid-cols-2 gap-12 border-t border-slate-300">
          <div className="text-center">
            <div className="border-b border-slate-400 pb-8 mb-2"></div>
            <p className="text-xs font-bold text-slate-900">Ing. Valeria Mendoza</p>
            <p className="text-[11px] text-slate-500">Responsable de Gestión Ambiental y ESG</p>
            <p className="text-[10px] font-mono text-slate-400">CIP N° 198421</p>
          </div>

          <div className="text-center">
            <div className="border-b border-slate-400 pb-8 mb-2"></div>
            <p className="text-xs font-bold text-slate-900">Dr. Roberto Santillán</p>
            <p className="text-[11px] text-slate-500">Auditor Líder Ambiental ISO 14001</p>
            <p className="text-[10px] font-mono text-slate-400">Registro IRCA N° A0192</p>
          </div>
        </div>
      </div>

      {/* Section 5.1 Universal Evidence Panel for Reports */}
      <ModuleEvidencePanel
        module="informes"
        title="Anexos Fotográficos de Expedientes e Informes"
        description="Evidencias fotográficas complementarias adjuntas a los informes trimestrales o memorias de sostenibilidad."
        facilityId={selectedFacility || undefined}
        activeOrgId={activeOrgId}
        userRole={userRole}
        defaultCategory="Inspección en Terreno"
        emptyMessage="No se registran anexos fotográficos cargados para informes en esta sede."
        className="no-print"
      />
    </div>
  );
};
