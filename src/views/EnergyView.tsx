import React, { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Sun,
  Flame,
  BatteryCharging,
  DollarSign,
  TrendingDown,
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
import { calculateEnergyIntensity } from '../utils/metrics';
import { EvidenceUploader } from '../components/EvidenceUploader';
import { EvidenceGallery } from '../components/EvidenceGallery';
import { ComplianceDeclarationModal, STATUS_CONFIG } from '../components/ComplianceDeclarationModal';
import { useFeedback } from '../components/FeedbackContext';

interface EnergyViewProps {
  records: any[];
  facilities: Facility[];
  onRefresh: () => void;
  canEdit: boolean;
  userRole?: string;
  activeOrgId?: string;
}

export const EnergyView: React.FC<EnergyViewProps> = ({
  records,
  facilities,
  onRefresh,
  canEdit,
  userRole = 'admin',
  activeOrgId
}) => {
  const { showToast, confirmAction } = useFeedback();
  const [facilityFilter, setFacilityFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPhotoUploader, setShowPhotoUploader] = useState(false);

  // Compliance Declarations & Evidences (Section 5.1 & 5.2.D)
  const [declarations, setDeclarations] = useState<ComplianceDeclaration[]>([]);
  const [evidences, setEvidences] = useState<EvidenceImage[]>([]);
  const [selectedDeclaration, setSelectedDeclaration] = useState<ComplianceDeclaration | null>(null);

  const loadModuleComplianceData = async () => {
    try {
      const [decls, evs] = await Promise.all([
        api.getComplianceDeclarations({ module: 'energia' }),
        api.getEvidences({ module: 'energia' })
      ]);
      setDeclarations(decls);
      setEvidences(evs);
    } catch (e) {
      console.error('Error loading energy compliance data:', e);
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
  const [sourceType, setSourceType] = useState<'red_electrica' | 'solar_fotovoltaica' | 'diesel' | 'gas_natural'>('red_electrica');
  const [consumptionKWh, setConsumptionKWh] = useState('');
  const [costUsd, setCostUsd] = useState('');
  const [formError, setFormError] = useState('');

  const metrics = calculateEnergyIntensity(records);

  const filtered = facilityFilter ? records.filter(r => r.facilityId === facilityFilter) : records;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!consumptionKWh) {
      setFormError('El consumo en kWh es obligatorio.');
      return;
    }

    try {
      await api.createEnergy({
        facilityId: facilityId || facilities[0]?.id || '',
        date,
        sourceType,
        consumptionKWh: parseFloat(consumptionKWh),
        costUsd: costUsd ? parseFloat(costUsd) : undefined
      });
      setShowAddModal(false);
      resetForm();
      onRefresh();
      showToast('Consumo energético registrado correctamente.', 'success');
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar registro energético');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAction({
      title: 'Eliminar registro energético',
      message: '¿Está seguro de eliminar este registro de consumo energético?',
      confirmLabel: 'Eliminar',
      danger: true
    });
    if (confirmed) {
      try {
        await api.deleteEnergy(id);
        onRefresh();
        showToast('Registro energético eliminado.', 'success');
      } catch (err: any) {
        showToast(err.message || 'Error al eliminar el registro.', 'error');
      }
    }
  };

  const resetForm = () => {
    setFacilityId('');
    setDate(new Date().toISOString().split('T')[0]);
    setSourceType('red_electrica');
    setConsumptionKWh('');
    setCostUsd('');
    setFormError('');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Zap className="w-6 h-6 text-amber-500" />
            Gestión Energética & Estimación de Huella de Carbono (CO₂e)
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Matriz energética (electricidad, renovables solares, combustibles fósiles) y contabilidad de emisiones GEI Alcance 1 y 2.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowPhotoUploader(!showPhotoUploader)}
              aria-label="Cargar evidencia fotográfica energética"
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
              aria-label="Registrar consumo energético"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Consumo Energético</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Consumo Energético Total</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1.5">{metrics.totalKWh.toLocaleString()} <span className="text-xs font-normal text-slate-500">kWh</span></p>
          <p className="text-[11px] text-slate-500 mt-1">Equivalente a {(metrics.totalKWh / 1000).toFixed(1)} MWh</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase flex items-center gap-1">
            <Sun className="w-3.5 h-3.5 text-emerald-600" />
            Generación Renovable In Situ
          </span>
          <p className="text-2xl font-extrabold text-emerald-800 mt-1.5">{metrics.renewableKWh.toLocaleString()} <span className="text-xs font-normal text-slate-500">kWh</span></p>
          <p className="text-[11px] text-slate-500 mt-1">{metrics.renewableSharePercent}% de participación solar limpia</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-700 uppercase">Huella de Carbono Estimada</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1.5">{metrics.estimatedCo2Ton} <span className="text-xs font-normal text-slate-500">tCO₂e</span></p>
          <p className="text-[11px] text-slate-500 mt-1">Factores de emisión GHG Protocol Corporate</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Gasto Energético Asignado</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1.5">
            ${records.reduce((acc, r) => acc + (r.costUsd || 0), 0).toLocaleString()} <span className="text-xs font-normal text-slate-500">USD</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Costo directo operativo</p>
        </div>
      </div>

      {/* Photo Uploader Section */}
      {showPhotoUploader && canEdit && (
        <EvidenceUploader
          module="energia"
          categories={[
            'Medidor Principal',
            'Sub-Medidor de Proceso',
            'Parque Solar / Inversor',
            'Grupo Electrógeno Diesel',
            'Factura / Recibo Eléctrico',
            'Otros'
          ]}
          defaultCategory="Medidor Principal"
          onUploaded={() => {
            setShowPhotoUploader(false);
            loadModuleComplianceData();
            showToast('Evidencias fotográficas cargadas.', 'success');
          }}
          onCancel={() => setShowPhotoUploader(false)}
        />
      )}

      {/* SECTION 5.2.D: Declaraciones Oficiales de Gestión Energética */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-200">
          <div>
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              Declaraciones Oficiales de Gestión Energética y Huella (Sección 5.2.D)
            </h2>
            <p className="text-xs text-stone-500">
              Evaluación de metas de reducción de emisiones, cuotas renovables y telemetría de medidores en 5 estados.
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded self-start sm:self-auto">
            {declarations.length} Metas Evaluadas
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
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Filtrar por Instalación:</span>
        <select
          value={facilityFilter}
          onChange={e => setFacilityFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700"
        >
          <option value="">Todas las sedes operativas</option>
          {facilities.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Instalación</th>
                <th className="py-3 px-4">Fuente Energética</th>
                <th className="py-3 px-4 text-right">Consumo (kWh)</th>
                <th className="py-3 px-4 text-right">Costo Registrado (USD)</th>
                <th className="py-3 px-4 text-center">Tipo Ambiental</th>
                {canEdit && <th className="py-3 px-4 text-right">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map(r => {
                  const fac = facilities.find(f => f.id === r.facilityId);
                  const isSolar = r.sourceType === 'solar_fotovoltaica';
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-700 whitespace-nowrap">
                        {r.date}
                      </td>
                      <td className="py-3 px-4 text-slate-900 font-semibold">
                        {fac?.name || 'Sede'}
                      </td>
                      <td className="py-3 px-4 capitalize text-slate-700">
                        {r.sourceType.replace('_', ' ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {r.consumptionKWh.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {r.costUsd ? `$${r.costUsd.toLocaleString()}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                          isSolar ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {isSolar ? 'Renovable 0 Emisiones' : 'Convencional Red / Combustible'}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            aria-label={`Eliminar registro energético ${r.date}`}
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
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    No se registran datos energéticos para esta consulta.
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
              <h2 className="text-sm font-bold text-slate-900">Registrar Consumo de Energía</h2>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Instalación *</label>
                  <select
                    value={facilityId}
                    onChange={e => setFacilityId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-500"
                  >
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fuente de Energía *</label>
                <select
                  value={sourceType}
                  onChange={e => setSourceType(e.target.value as any)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-500"
                >
                  <option value="red_electrica">Red Eléctrica Comercial (SEIN)</option>
                  <option value="solar_fotovoltaica">Solar Fotovoltaica (Generación propia en techo)</option>
                  <option value="gas_natural">Gas Natural por Red</option>
                  <option value="diesel">Diésel B5 (Grupo Electrógeno de Respaldo)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Consumo en kWh *</label>
                  <input
                    type="number"
                    step="1"
                    required
                    placeholder="Ej. 12500"
                    value={consumptionKWh}
                    onChange={e => setConsumptionKWh(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Costo Facturado (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ej. 1500"
                    value={costUsd}
                    onChange={e => setCostUsd(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500"
                  />
                </div>
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
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg shadow-sm"
                >
                  Guardar Consumo
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
              <Camera className="w-4 h-4 text-amber-600" />
              Evidencias Fotográficas Energéticas & Medidores ({evidences.length})
            </h3>
            <p className="text-xs text-stone-500">
              Registros visuales de medidores eléctricos, inversores solares, recibos y generadores diesel sin límites de archivo.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowPhotoUploader(true)}
              className="px-3 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 rounded text-xs font-semibold flex items-center gap-1"
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
          emptyMessage="No se registran fotografías en el módulo de energía."
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
