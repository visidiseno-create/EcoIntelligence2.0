import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Slash,
  Filter,
  Search,
  Building,
  RefreshCw,
  Camera,
  FileCheck,
  Eye,
  SlidersHorizontal,
  ChevronRight,
  TrendingUp,
  Download
} from 'lucide-react';
import {
  api,
  ComplianceDeclaration,
  ComplianceDashboardData,
  EvidenceImage,
  Facility
} from '../services/api';
import { ComplianceDeclarationModal, STATUS_CONFIG } from '../components/ComplianceDeclarationModal';
import { EvidenceGallery } from '../components/EvidenceGallery';
import { EvidenceUploader } from '../components/EvidenceUploader';
import { useFeedback } from '../components/FeedbackContext';

interface ComplianceDashboardViewProps {
  userRole?: string;
  facilities: Facility[];
  selectedFacilityId?: string;
  activeOrgId?: string;
}

export const ComplianceDashboardView: React.FC<ComplianceDashboardViewProps> = ({
  userRole = 'admin',
  facilities = [],
  selectedFacilityId,
  activeOrgId
}) => {
  const { showToast } = useFeedback();
  const canEdit = userRole !== 'lector';

  const [data, setData] = useState<ComplianceDashboardData | null>(null);
  const [evidences, setEvidences] = useState<EvidenceImage[]>([]);
  const [evidenceStats, setEvidenceStats] = useState<{
    totalCount: number;
    totalBytes: number;
    totalFormatted: string;
    byModule: Record<string, number>;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [facilityFilter, setFacilityFilter] = useState<string>(selectedFacilityId || 'all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Active view tab: Declaraciones vs Galería Universal
  const [viewMode, setViewMode] = useState<'declarations' | 'gallery'>('declarations');

  // Modal state
  const [selectedDeclaration, setSelectedDeclaration] = useState<ComplianceDeclaration | null>(null);
  const [showGlobalUploader, setShowGlobalUploader] = useState(false);

  useEffect(() => {
    if (selectedFacilityId) {
      setFacilityFilter(selectedFacilityId);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    setFacilityFilter(selectedFacilityId || 'all');
    setShowGlobalUploader(false);
    setSelectedDeclaration(null);
  }, [activeOrgId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, evRes, evStats] = await Promise.all([
        api.getComplianceDashboard({
          facilityId: facilityFilter !== 'all' ? facilityFilter : undefined,
          module: moduleFilter !== 'all' ? moduleFilter : undefined
        }),
        api.getEvidences({
          facilityId: facilityFilter !== 'all' ? facilityFilter : undefined,
          module: moduleFilter !== 'all' ? moduleFilter : undefined
        }),
        api.getEvidenceStats()
      ]);

      setData(dashRes);
      setEvidences(evRes);
      setEvidenceStats(evStats);
    } catch (err: any) {
      setError(err.message || 'Error al cargar el panel de cumplimiento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [facilityFilter, moduleFilter, activeOrgId]);

  const handleSavedDeclaration = (updated: ComplianceDeclaration) => {
    setSelectedDeclaration(null);
    showToast(`Declaración "${updated.requirementCode}" actualizada.`, 'success');
    loadData();
  };

  // Filter declarations locally with safe null checks
  const filteredDeclarations = (data?.declarations || []).filter((decl) => {
    const matchesStatus =
      statusFilter === 'all' ||
      decl.currentStatus === statusFilter ||
      (decl as any).status === statusFilter;

    const code = (decl.requirementCode || decl.id || '').toLowerCase();
    const title = (decl.requirementTitle || '').toLowerCase();
    const ref = (decl.legalReference || '').toLowerCase();
    const fac = (decl.facilityName || '').toLowerCase();
    const term = searchQuery.toLowerCase();

    const matchesSearch =
      !searchQuery ||
      code.includes(term) ||
      title.includes(term) ||
      ref.includes(term) ||
      fac.includes(term);

    return matchesStatus && matchesSearch;
  });

  const rawStats: any = data?.stats || {};
  const stats = {
    totalRequirements: rawStats.totalRequirements || 0,
    evaluatedCount: rawStats.evaluatedCount || rawStats.evaluated || 0,
    cumple: rawStats.cumple || 0,
    noCumple: rawStats.noCumple || 0,
    cumplimientoParcial: rawStats.cumplimientoParcial || 0,
    pendienteVerificacion: rawStats.pendienteVerificacion || 0,
    noAplica: rawStats.noAplica || 0,
    compliancePercentage:
      rawStats.compliancePercentage !== undefined
        ? rawStats.compliancePercentage
        : rawStats.complianceRatePercent !== undefined
        ? rawStats.complianceRatePercent
        : 0,
    actionableDeficiencies: rawStats.actionableDeficiencies || 0
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
          {error}
        </div>
      )}

      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-stone-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 bg-emerald-950 text-emerald-300 text-xs font-bold rounded flex items-center gap-1.5 uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Sección 5.2 & 5.3
            </span>
            <span className="text-xs text-stone-500 font-medium">
              Sistema Determinístico de Declaración de Cumplimiento
            </span>
          </div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">
            Panel Oficial de Cumplimiento Ambiental
          </h1>
          <p className="text-xs text-stone-600 mt-1 max-w-3xl">
            Evaluación determinística en 5 estados oficiales (Cumple, No Cumple, Cumplimiento Parcial, Pendiente de Verificación y No Aplica). Trazabilidad inmutable con justificación obligatoria y galería de evidencias fotográficas ilimitada.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            aria-label="Recargar métricas"
            className="p-2 border border-stone-300 rounded text-stone-600 hover:text-stone-900 hover:bg-stone-50 cursor-pointer transition-colors"
            title="Recargar métricas"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-700' : ''}`} />
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={() => setShowGlobalUploader(!showGlobalUploader)}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Camera className="w-4 h-4" />
              Cargar Fotografía
            </button>
          )}
        </div>
      </div>

      {/* Global Evidence Uploader accordion */}
      {showGlobalUploader && canEdit && (
        <EvidenceUploader
          module={moduleFilter !== 'all' ? moduleFilter : 'general'}
          facilityId={facilityFilter !== 'all' ? facilityFilter : undefined}
          defaultCategory="Inspección en Terreno"
          onUploaded={() => {
            setShowGlobalUploader(false);
            loadData();
            showToast('Evidencias fotográficas cargadas.', 'success');
          }}
          onCancel={() => setShowGlobalUploader(false)}
        />
      )}

      {/* 5-STATE STATISTICAL CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Compliance Rate Gauge */}
        <div className="bg-emerald-950 text-white p-4 rounded-lg col-span-2 sm:col-span-3 lg:col-span-2 flex flex-col justify-between shadow-xs border border-emerald-900">
          <div>
            <div className="flex items-center justify-between text-xs text-emerald-300 font-semibold uppercase tracking-wider">
              <span>Tasa Real de Cumplimiento</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold tracking-tight text-white">
                {stats.compliancePercentage.toFixed(1)}%
              </span>
              <span className="text-xs text-emerald-200">
                base evaluable ({rawStats.applicableEvaluated || (stats.cumple + stats.noCumple + stats.cumplimientoParcial)} req.)
              </span>
            </div>
          </div>

          <div className="mt-3">
            <div className="w-full bg-emerald-900/80 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, stats.compliancePercentage))}%` }}
              />
            </div>
            <p className="text-[11px] text-emerald-200 mt-1.5">
              * Excluye estrictamente &quot;No Aplica&quot; y diferencia &quot;Pendiente de Verificación&quot;.
            </p>
          </div>
        </div>

        {/* Cumple */}
        <div className="bg-white p-3.5 rounded-lg border border-emerald-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-xs font-bold uppercase tracking-wider">Cumple</span>
            <CheckCircle className="w-4 h-4" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-emerald-800">{stats.cumple}</div>
            <p className="text-[10px] text-stone-500 mt-0.5">Conforme normativo</p>
          </div>
        </div>

        {/* No Cumple */}
        <div className="bg-white p-3.5 rounded-lg border border-red-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-red-700">
            <span className="text-xs font-bold uppercase tracking-wider">No Cumple</span>
            <XCircle className="w-4 h-4" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-red-800">{stats.noCumple}</div>
            <p className="text-[10px] text-stone-500 mt-0.5">Acción correctiva obligatoria</p>
          </div>
        </div>

        {/* Cumplimiento Parcial */}
        <div className="bg-white p-3.5 rounded-lg border border-amber-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-xs font-bold uppercase tracking-wider">Parcial</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-amber-800">{stats.cumplimientoParcial}</div>
            <p className="text-[10px] text-stone-500 mt-0.5">Ponderado al 50%</p>
          </div>
        </div>

        {/* Pendiente & No Aplica */}
        <div className="bg-white p-3.5 rounded-lg border border-blue-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-xs font-bold uppercase tracking-wider">Pendiente</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-blue-800">{stats.pendienteVerificacion}</div>
            <p className="text-[10px] text-stone-500 mt-0.5">En proceso de muestreo</p>
          </div>
        </div>
      </div>

      {/* Sub-Metrics: No Aplica & Storage */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Slash className="w-4 h-4 text-stone-500" />
            <div>
              <span className="font-semibold text-stone-800">No Aplica (Exentos):</span>
              <p className="text-[11px] text-stone-500">Excluidos del denominador oficial</p>
            </div>
          </div>
          <span className="text-sm font-bold text-stone-700">{stats.noAplica} req.</span>
        </div>

        <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-700" />
            <div>
              <span className="font-semibold text-stone-800">Almacenamiento de Evidencias:</span>
              <p className="text-[11px] text-stone-500">{evidenceStats?.totalCount || 0} fotos archivadas</p>
            </div>
          </div>
          <span className="text-sm font-bold text-emerald-800">{evidenceStats?.totalFormatted || '0 B'}</span>
        </div>

        <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-700" />
            <div>
              <span className="font-semibold text-stone-800">Total Requisitos Registrados:</span>
              <p className="text-[11px] text-stone-500">En matriz de cumplimiento</p>
            </div>
          </div>
          <span className="text-sm font-bold text-stone-800">{stats.totalRequirements}</span>
        </div>
      </div>

      {/* Mode Switch & Filter Bar */}
      <div className="bg-white border border-stone-200 rounded-lg p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* View toggle */}
          <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('declarations')}
              className={`px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                viewMode === 'declarations'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Matriz de Declaraciones ({filteredDeclarations.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('gallery')}
              className={`px-3 py-1.5 rounded-md cursor-pointer transition-colors flex items-center gap-1.5 ${
                viewMode === 'gallery'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5 text-emerald-700" />
              Galería Transversal de Fotos ({evidences.length})
            </button>
          </div>

          {/* Quick Search */}
          <div className="w-full sm:w-72 relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por código, título o norma..."
              className="w-full pl-9 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded text-xs text-stone-900 focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
            />
          </div>
        </div>

        {/* Filter Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-stone-100">
          <div>
            <label className="block text-[11px] font-semibold text-stone-500 mb-1">
              Instalación / Sede:
            </label>
            <select
              value={facilityFilter}
              onChange={(e) => setFacilityFilter(e.target.value)}
              className="w-full text-xs bg-stone-50 border border-stone-200 rounded px-2.5 py-1.5 text-stone-800 cursor-pointer"
            >
              <option value="all">Todas las Instalaciones</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-500 mb-1">
              Módulo Temático:
            </label>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="w-full text-xs bg-stone-50 border border-stone-200 rounded px-2.5 py-1.5 text-stone-800 cursor-pointer"
            >
              <option value="all">Todos los Módulos</option>
              <option value="documentos">Biblioteca y Custodia de Evidencias</option>
              <option value="residuos">Gestión de Residuos y Manifiestos</option>
              <option value="aire">Emisiones Atmosféricas y Calidad de Aire</option>
              <option value="energia">Gestión Energética y Huella de Carbono</option>
              <option value="general">Requisitos Generales e Institucionales</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-500 mb-1">
              Estado de Cumplimiento:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-xs bg-stone-50 border border-stone-200 rounded px-2.5 py-1.5 text-stone-800 cursor-pointer"
            >
              <option value="all">Todos los Estados</option>
              <option value="cumple">Cumple Requisito</option>
              <option value="no_cumple">No Cumple (Incumplimiento)</option>
              <option value="cumplimiento_parcial">Cumplimiento Parcial</option>
              <option value="pendiente_verificacion">Pendiente de Verificación</option>
              <option value="no_aplica">No Aplica</option>
            </select>
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: DECLARATIONS TABLE */}
      {viewMode === 'declarations' && (
        <div className="bg-white border border-stone-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-stone-700">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Requisito Ambiental & Norma</th>
                  <th className="px-4 py-3">Módulo</th>
                  <th className="px-4 py-3">Instalación</th>
                  <th className="px-4 py-3 text-center">Estado Formal</th>
                  <th className="px-4 py-3 text-center">Evidencias</th>
                  <th className="px-4 py-3">Última Evaluación</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredDeclarations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-stone-500">
                      No se encontraron requisitos que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredDeclarations.map((decl) => {
                    const stCfg = STATUS_CONFIG[decl.currentStatus] || STATUS_CONFIG.cumple;
                    const Icon = stCfg.icon;

                    return (
                      <tr
                        key={decl.id}
                        className="hover:bg-stone-50/80 transition-colors cursor-pointer"
                        onClick={() => setSelectedDeclaration(decl)}
                      >
                        <td className="px-4 py-3 font-mono font-bold text-stone-900 whitespace-nowrap">
                          {decl.requirementCode}
                        </td>

                        <td className="px-4 py-3 max-w-xs sm:max-w-md">
                          <div className="font-semibold text-stone-900 leading-snug">
                            {decl.requirementTitle}
                          </div>
                          <div className="text-[11px] text-stone-500 mt-0.5 truncate">
                            Ref: {decl.legalReference}
                          </div>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-stone-100 text-stone-700 rounded text-[11px] font-medium capitalize">
                            {decl.module}
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-stone-600">
                          {decl.facilityName}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold ${stCfg.bg} ${stCfg.text} border ${stCfg.border}`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {stCfg.label}
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <span className="inline-flex items-center gap-1 text-xs text-stone-600 bg-stone-100 px-2 py-0.5 rounded font-medium">
                            <Camera className="w-3.5 h-3.5 text-emerald-700" />
                            {decl.attachedEvidenceIds?.length || 0} fotos
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-[11px] text-stone-500">
                          <div>
                            {decl.lastEvaluatedAt && !Number.isNaN(new Date(decl.lastEvaluatedAt).getTime())
                              ? new Date(decl.lastEvaluatedAt).toLocaleDateString('es-ES', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric'
                                })
                              : '—'}
                          </div>
                          <div className="text-stone-400">
                            {decl.lastEvaluatedBy?.name?.split(' ')[0] || 'Auditor'}
                          </div>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDeclaration(decl);
                            }}
                            className="px-2.5 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 rounded text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Evaluar / Historial
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: TRANSVERSAL EVIDENCE GALLERY */}
      {viewMode === 'gallery' && (
        <div className="bg-white border border-stone-200 rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-stone-200">
            <div>
              <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-700" />
                Custodia Visual de Evidencias Transversales
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Fotografías y registros gráficos de todos los módulos sin límites artificiales.
              </p>
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={() => setShowGlobalUploader(true)}
                className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <Camera className="w-3.5 h-3.5" />
                Subir Nueva Evidencia
              </button>
            )}
          </div>

          <EvidenceGallery
            evidences={evidences}
            onDelete={async (id) => {
              try {
                await api.deleteEvidence(id);
                loadData();
                showToast('Evidencia fotográfica eliminada.', 'success');
              } catch (err: any) {
                showToast(err.message || 'Error al eliminar evidencia.', 'error');
              }
            }}
            userRole={userRole}
            emptyMessage="No hay fotografías registradas para los filtros seleccionados."
            showFilters={true}
          />
        </div>
      )}

      {/* Compliance Declaration Detail & History Modal */}
      {selectedDeclaration && (
        <ComplianceDeclarationModal
          declaration={selectedDeclaration}
          onClose={() => setSelectedDeclaration(null)}
          onSaved={handleSavedDeclaration}
          userRole={userRole}
          allEvidences={evidences}
        />
      )}
    </div>
  );
};
