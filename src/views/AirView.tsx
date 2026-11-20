import React, { useState, useEffect } from 'react';
import {
  Wind,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Factory,
  Search,
  Filter,
  X,
  Trash2,
  Camera,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Clock,
  Slash
} from 'lucide-react';
import { api, Facility, ComplianceDeclaration, EvidenceImage } from '../services/api';
import { EvidenceUploader } from '../components/EvidenceUploader';
import { EvidenceGallery } from '../components/EvidenceGallery';
import { ComplianceDeclarationModal, STATUS_CONFIG } from '../components/ComplianceDeclarationModal';
import { useFeedback } from '../components/FeedbackContext';

interface AirViewProps {
  records: any[];
  facilities: Facility[];
  onRefresh: () => void;
  canEdit: boolean;
  userRole?: string;
  activeOrgId?: string;
}

export const AirView: React.FC<AirViewProps> = ({
  records,
  facilities,
  onRefresh,
  canEdit,
  userRole = 'admin',
  activeOrgId
}) => {
  const { showToast, confirmAction } = useFeedback();
  const [paramFilter, setParamFilter] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPhotoUploader, setShowPhotoUploader] = useState(false);

  // Compliance Declarations & Evidences (Section 5.1 & 5.2.C)
  const [declarations, setDeclarations] = useState<ComplianceDeclaration[]>([]);
  const [evidences, setEvidences] = useState<EvidenceImage[]>([]);
  const [selectedDeclaration, setSelectedDeclaration] = useState<ComplianceDeclaration | null>(null);

  const loadModuleComplianceData = async () => {
    try {
      const [decls, evs] = await Promise.all([
        api.getComplianceDeclarations({ module: 'aire' }),
        api.getEvidences({ module: 'aire' })
      ]);
      setDeclarations(decls);
      setEvidences(evs);
    } catch (e) {
      console.error('Error loading air compliance data:', e);
    }
  };

  useEffect(() => {
    setFacilityFilter('');
    setShowPhotoUploader(false);
    loadModuleComplianceData();
  }, [activeOrgId]);

  // Form State
  const [facilityId, setFacilityId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [emissionSource, setEmissionSource] = useState('');
  const [parameter, setParameter] = useState<'PM10' | 'PM2.5' | 'SO2' | 'NOx' | 'CO' | 'COV'>('PM10');
  const [measuredValue, setMeasuredValue] = useState('');
  const [limitValue, setLimitValue] = useState('50');
  const [unit, setUnit] = useState('mg/Nm3');
  const [formError, setFormError] = useState('');

  // Statistics
  const totalSamples = records.length;
  const compliantSamples = records.filter(r => r.measuredValue <= r.limitValue).length;
  const exceededSamples = totalSamples - compliantSamples;
  const complianceRate = totalSamples > 0 ? Math.round((compliantSamples / totalSamples) * 1000) / 10 : 100;

  const filtered = records.filter(r => {
    const matchesParam = paramFilter === '' || r.parameter === paramFilter;
    const matchesFacility = facilityFilter === '' || r.facilityId === facilityFilter;
    return matchesParam && matchesFacility;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!emissionSource.trim() || !measuredValue || !limitValue) {
      setFormError('Fuente de emisión, valor medido y límite son obligatorios.');
      return;
    }

    try {
      await api.createAir({
        facilityId: facilityId || facilities[0]?.id || '',
        date,
        emissionSource,
        parameter,
        measuredValue: parseFloat(measuredValue),
        limitValue: parseFloat(limitValue),
        unit
      });
      setShowAddModal(false);
      resetForm();
      onRefresh();
      showToast('Monitoreo de emisiones registrado correctamente.', 'success');
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar monitoreo de aire');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAction({
      title: 'Eliminar monitoreo atmosférico',
      message: '¿Está seguro de eliminar este registro de emisión atmosférica?',
      confirmLabel: 'Eliminar',
      danger: true
    });
    if (confirmed) {
      try {
        await api.deleteAir(id);
        onRefresh();
        showToast('Registro de aire eliminado.', 'success');
      } catch (err: any) {
        showToast(err.message || 'Error al eliminar el registro.', 'error');
      }
    }
  };

  const resetForm = () => {
    setFacilityId('');
    setDate(new Date().toISOString().split('T')[0]);
    setEmissionSource('');
    setParameter('PM10');
    setMeasuredValue('');
    setLimitValue('50');
    setUnit('mg/Nm3');
    setFormError('');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Wind className="w-6 h-6 text-emerald-600" />
            Gestión de Emisiones Atmosféricas y Calidad de Aire
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Monitoreos isocinéticos en chimeneas fijas, gases de combustión y concentraciones vs Límites Máximos Permisibles (LMP).
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowPhotoUploader(!showPhotoUploader)}
              aria-label="Cargar evidencia fotográfica de emisiones"
              className="px-3.5 py-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <Camera className="w-4 h-4 text-emerald-400" />
              <span>Adjuntar Fotos ({evidences.length})</span>
            </button>
          )}

          {canEdit && (
            <button
              onClick={() => {
                resetForm();
                setShowAddModal(true);
              }}
              aria-label="Registrar monitoreo de aire"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Monitoreo de Emisiones</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Total de Muestreos</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1.5">{totalSamples}</p>
          <p className="text-[11px] text-slate-500 mt-1">Fuentes fijas y estaciones perimétricas</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase">Puntos Conformes</span>
          <p className="text-2xl font-extrabold text-emerald-800 mt-1.5">{compliantSamples}</p>
          <p className="text-[11px] text-slate-500 mt-1">Concentración inferior al límite normativo</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-rose-700 uppercase">Excedencias Detectadas</span>
          <p className="text-2xl font-extrabold text-rose-900 mt-1.5">{exceededSamples}</p>
          <p className="text-[11px] text-slate-500 mt-1">{exceededSamples > 0 ? 'Requiere calibración de quemadores/filtros' : 'Sin desvíos'}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-700 uppercase">Tasa de Conformidad</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1.5">{complianceRate}%</p>
          <p className="text-[11px] text-slate-500 mt-1">Evaluación según D.S. 003-2017-MINAM</p>
        </div>
      </div>

      {/* Alert if any exceedance */}
      {exceededSamples > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-800">
            <p className="font-bold">Alerta de Monitoreo Ambiental: Se registraron mediciones por encima del límite legal.</p>
            <p className="mt-0.5">Revise las fuentes con exceso de concentración para coordinar mantenimiento inmediato de quemadores o mangas filtrantes con el área técnica.</p>
          </div>
        </div>
      )}

      {/* Photo Uploader Section */}
      {showPhotoUploader && canEdit && (
        <EvidenceUploader
          module="aire"
          categories={[
            'Chimenea y Ducto',
            'Puerto de Muestreo',
            'Equipo Isocinético',
            'Filtros de Manga',
            'Placa / Caldera',
            'Otros'
          ]}
          defaultCategory="Chimenea y Ducto"
          onUploaded={() => {
            setShowPhotoUploader(false);
            loadModuleComplianceData();
            showToast('Evidencias fotográficas cargadas.', 'success');
          }}
          onCancel={() => setShowPhotoUploader(false)}
        />
      )}

      {/* SECTION 5.2.C: Declaraciones Oficiales de Calidad del Aire y Emisiones */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-200">
          <div>
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              Declaraciones Oficiales de Emisiones Atmosféricas (Sección 5.2.C)
            </h2>
            <p className="text-xs text-stone-500">
              Evaluación de chimeneas, fuentes fijas y parámetros vs Límites Máximos Permisibles (LMP) en 5 estados.
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded self-start sm:self-auto">
            {declarations.length} Fuentes Evaluadas
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {declarations.map((decl) => {
            const stCfg = STATUS_CONFIG[decl.currentStatus] || STATUS_CONFIG.cumple;
            const Icon = stCfg.icon;

            return (
              <div
                key={decl.id}
                onClick={() => setSelectedDeclaration(decl)}
                className="p-3 bg-stone-50 hover:bg-white border border-stone-200 hover:border-emerald-500 rounded-lg cursor-pointer transition-all flex flex-col justify-between shadow-2xs group"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-stone-200 text-stone-800 rounded">
                      {decl.requirementCode}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${stCfg.bg} ${stCfg.text} border ${stCfg.border}`}
                    >
                      <Icon className="w-3 h-3" />
                      {stCfg.label}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-stone-900 group-hover:text-emerald-800 line-clamp-1">
                    {decl.requirementTitle}
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-1">
                    {decl.legalReference}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-stone-200 flex items-center justify-between text-[10px] text-stone-500">
                  <span className="flex items-center gap-1 text-emerald-700 font-medium">
                    <Camera className="w-3 h-3" />
                    {decl.attachedEvidenceIds?.length || 0} fotos
                  </span>
                  <span className="text-emerald-700 font-semibold group-hover:underline">
                    Evaluar / Justificar →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-700">Filtros de Parámetro y Planta:</span>
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={paramFilter}
            onChange={e => setParamFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="">Todos los parámetros</option>
            <option value="PM10">PM10 (Material Particulado 10 µm)</option>
            <option value="PM2.5">PM2.5 (Material Particulado Fino)</option>
            <option value="SO2">SO2 (Dióxido de Azufre)</option>
            <option value="NOx">NOx (Óxidos de Nitrógeno)</option>
            <option value="CO">CO (Monóxido de Carbono)</option>
            <option value="COV">COV (Compuestos Orgánicos Volátiles)</option>
          </select>

          <select
            value={facilityFilter}
            onChange={e => setFacilityFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="">Todas las instalaciones</option>
            {facilities.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Fuente / Chimenea</th>
                <th className="py-3 px-4">Parámetro</th>
                <th className="py-3 px-4 text-right">Valor Medido</th>
                <th className="py-3 px-4 text-right">Límite Normativo</th>
                <th className="py-3 px-4 text-center">Unidad</th>
                <th className="py-3 px-4 text-center">Estado</th>
                {canEdit && <th className="py-3 px-4 text-right">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map(r => {
                  const isExceeded = r.measuredValue > r.limitValue;
                  const ratio = Math.round((r.measuredValue / r.limitValue) * 100);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-700 whitespace-nowrap">
                        {r.date}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{r.emissionSource}</p>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {r.parameter}
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-bold ${isExceeded ? 'text-rose-600' : 'text-slate-900'}`}>
                        {r.measuredValue}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {r.limitValue}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-600">
                        {r.unit}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                          isExceeded ? 'bg-rose-100 text-rose-800 font-bold' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isExceeded ? `Excede (${ratio}%)` : `Conforme (${ratio}%)`}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            aria-label={`Eliminar monitoreo de aire ${r.emissionSource}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    No se encontraron monitoreos de emisiones con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900">Registrar Monitoreo de Emisiones</h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fuente Fija / Punto de Muestreo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Chimenea Caldera CH-01 o Horno Secador"
                  value={emissionSource}
                  onChange={e => setEmissionSource(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Parámetro *</label>
                  <select
                    value={parameter}
                    onChange={e => setParameter(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="PM10">PM10 (Material Particulado 10)</option>
                    <option value="PM2.5">PM2.5 (Partículas Finas)</option>
                    <option value="SO2">SO2 (Dióxido de Azufre)</option>
                    <option value="NOx">NOx (Óxidos de Nitrógeno)</option>
                    <option value="CO">CO (Monóxido de Carbono)</option>
                    <option value="COV">COV (Compuestos Orgánicos)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha de Medición</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Valor Medido *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ej. 42.5"
                    value={measuredValue}
                    onChange={e => setMeasuredValue(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Límite Normativo *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ej. 50"
                    value={limitValue}
                    onChange={e => setLimitValue(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unidad</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Instalación</label>
                <select
                  value={facilityId}
                  onChange={e => setFacilityId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
                >
                  {facilities.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-sm"
                >
                  Guardar Monitoreo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Evidences Photo Gallery */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-stone-200">
          <div>
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Camera className="w-4 h-4 text-emerald-700" />
              Evidencias Fotográficas de Emisiones y Chimeneas ({evidences.length})
            </h3>
            <p className="text-xs text-stone-500">
              Registros visuales de chimeneas fijas, puertos de muestreo, filtros de manga y calderas sin cuota limitante.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowPhotoUploader(true)}
              className="px-3 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 rounded text-xs font-semibold flex items-center gap-1"
            >
              <Camera className="w-3.5 h-3.5" />
              Cargar Foto
            </button>
          )}
        </div>

        <EvidenceGallery
          evidences={evidences}
          onDelete={async (id) => {
            try {
              await api.deleteEvidence(id);
              loadModuleComplianceData();
              showToast('Evidencia fotográfica eliminada.', 'success');
            } catch (err: any) {
              showToast(err.message || 'Error al eliminar evidencia.', 'error');
            }
          }}
          userRole={userRole}
          emptyMessage="No se registran fotografías en el módulo de emisiones atmosféricas."
          showFilters={false}
        />
      </div>

      {/* Compliance Declaration Modal */}
      {selectedDeclaration && (
        <ComplianceDeclarationModal
          declaration={selectedDeclaration}
          onClose={() => setSelectedDeclaration(null)}
          onSaved={() => {
            setSelectedDeclaration(null);
            loadModuleComplianceData();
          }}
          userRole={userRole}
          allEvidences={evidences}
        />
      )}
    </div>
  );
};
