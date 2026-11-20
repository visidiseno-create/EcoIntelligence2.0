import React, { useState } from 'react';
import {
  Droplets,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Waves,
  X,
  Trash2
} from 'lucide-react';
import { api, Facility } from '../services/api';
import { ModuleEvidencePanel } from '../components/ModuleEvidencePanel';
import { useFeedback } from '../components/FeedbackContext';

interface WaterViewProps {
  records: any[];
  facilities: Facility[];
  onRefresh: () => void;
  canEdit: boolean;
  userRole?: string;
  activeOrgId?: string;
}

export const WaterView: React.FC<WaterViewProps> = ({
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

  // Form State
  const [facilityId, setFacilityId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [source, setSource] = useState<'red_publica' | 'pozo_subterraneo' | 'fuente_superficial' | 'agua_recirculada'>('pozo_subterraneo');
  const [volumeConsumedM3, setVolumeConsumedM3] = useState('');
  const [volumeDischargedM3, setVolumeDischargedM3] = useState('');
  const [dischargePermitCompliant, setDischargePermitCompliant] = useState(true);
  const [bod5MgL, setBod5MgL] = useState('');
  const [codMgL, setCodMgL] = useState('');
  const [ph, setPh] = useState('');
  const [formError, setFormError] = useState('');

  // Statistics
  const totalConsumed = records.reduce((acc, r) => acc + r.volumeConsumedM3, 0);
  const totalDischarged = records.reduce((acc, r) => acc + (r.volumeDischargedM3 || 0), 0);
  const recirculated = records
    .filter(r => r.source === 'agua_recirculada')
    .reduce((acc, r) => acc + r.volumeConsumedM3, 0);
  const recirculationRate = totalConsumed > 0 ? Math.round((recirculated / totalConsumed) * 1000) / 10 : 0;
  const compliantCount = records.filter(r => r.dischargePermitCompliant).length;
  const complianceRate = records.length > 0 ? Math.round((compliantCount / records.length) * 1000) / 10 : 100;

  const filtered = facilityFilter ? records.filter(r => r.facilityId === facilityFilter) : records;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!volumeConsumedM3) {
      setFormError('El volumen consumido en m³ es obligatorio.');
      return;
    }

    try {
      await api.createWater({
        facilityId: facilityId || facilities[0]?.id || '',
        date,
        source,
        volumeConsumedM3: parseFloat(volumeConsumedM3),
        volumeDischargedM3: volumeDischargedM3 ? parseFloat(volumeDischargedM3) : 0,
        dischargePermitCompliant,
        bod5MgL: bod5MgL ? parseFloat(bod5MgL) : undefined,
        codMgL: codMgL ? parseFloat(codMgL) : undefined,
        ph: ph ? parseFloat(ph) : undefined
      });
      setShowAddModal(false);
      resetForm();
      showToast('Registro hídrico almacenado correctamente.', 'success');
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar registro hídrico');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAction({
      title: 'Eliminar registro hídrico',
      message: '¿Eliminar este registro de consumo hídrico?',
      confirmLabel: 'Eliminar',
      danger: true
    });
    if (confirmed) {
      try {
        await api.deleteWater(id);
        showToast('Registro hídrico eliminado.', 'info');
        onRefresh();
      } catch (err: any) {
        showToast(err.message || 'Error al eliminar registro hídrico.', 'error');
      }
    }
  };

  const resetForm = () => {
    setFacilityId('');
    setDate(new Date().toISOString().split('T')[0]);
    setSource('pozo_subterraneo');
    setVolumeConsumedM3('');
    setVolumeDischargedM3('');
    setDischargePermitCompliant(true);
    setBod5MgL('');
    setCodMgL('');
    setPh('');
    setFormError('');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Droplets className="w-6 h-6 text-blue-600" />
            Gestión de Recursos Hídricos y Vertimientos
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Monitoreo volumétrico de captación, balance hídrico, reúso y cumplimiento de LMP de efluentes.
          </p>
        </div>

        {canEdit && (
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            aria-label="Registrar consumo hídrico"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Consumo / Efluente</span>
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Consumo Total Acumulado</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1.5">{totalConsumed.toLocaleString()} <span className="text-xs font-normal text-slate-500">m³</span></p>
          <p className="text-[11px] text-slate-500 mt-1">{records.length} lecturas volumétricas</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Efluente Vertido Tratado</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1.5">{totalDischarged.toLocaleString()} <span className="text-xs font-normal text-slate-500">m³</span></p>
          <p className="text-[11px] text-slate-500 mt-1">Con descarga a PTAR o cuerpo receptor</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-blue-700 uppercase">Tasa de Recirculación / Reúso</span>
          <p className="text-2xl font-extrabold text-blue-800 mt-1.5">{recirculationRate}%</p>
          <p className="text-[11px] text-slate-500 mt-1">{recirculated.toLocaleString()} m³ recirculados en proceso</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase">Conformidad LMP Efluentes</span>
          <p className="text-2xl font-extrabold text-emerald-800 mt-1.5">{complianceRate}%</p>
          <p className="text-[11px] text-slate-500 mt-1">{compliantCount}/{records.length} monitoreos conformes</p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Filtrar por Instalación:</span>
        <select
          value={facilityFilter}
          onChange={e => setFacilityFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700"
        >
          <option value="">Todas las instalaciones</option>
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
                <th className="py-3 px-4">Fuente de Abastecimiento</th>
                <th className="py-3 px-4 text-right">Consumo (m³)</th>
                <th className="py-3 px-4 text-right">Efluente (m³)</th>
                <th className="py-3 px-4 text-center">DBO₅ / DQO / pH</th>
                <th className="py-3 px-4 text-center">Conformidad LMP</th>
                {canEdit && <th className="py-3 px-4 text-right">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map(r => {
                  const fac = facilities.find(f => f.id === r.facilityId);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-700 whitespace-nowrap">
                        {r.date}
                      </td>
                      <td className="py-3 px-4 text-slate-900 font-semibold">
                        {fac?.name || 'Sede no especificada'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 capitalize">
                        {r.source.replace('_', ' ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {r.volumeConsumedM3.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        {r.volumeDischargedM3 ? r.volumeDischargedM3.toLocaleString() : '0'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[11px] text-slate-600">
                        {r.bod5MgL ? `${r.bod5MgL} mg/L | ${r.codMgL || '—'} mg/L | pH ${r.ph || '—'}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                          r.dischargePermitCompliant ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {r.dischargePermitCompliant ? 'Conforme' : 'Desviación'}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            aria-label={`Eliminar registro hídrico ${r.date}`}
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
                    No hay registros hídricos disponibles.
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
              <h2 className="text-sm font-bold text-slate-900">Registrar Balance Hídrico & Efluentes</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
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
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-500"
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
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fuente de Abastecimiento</label>
                <select
                  value={source}
                  onChange={e => setSource(e.target.value as any)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                >
                  <option value="pozo_subterraneo">Pozo Subterráneo (Extracción ANA)</option>
                  <option value="red_publica">Red Pública Municipal</option>
                  <option value="fuente_superficial">Fuente Superficial (Río / Canal)</option>
                  <option value="agua_recirculada">Agua Recirculada / Tratada</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Volumen Consumido (m³) *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    placeholder="Ej. 650"
                    value={volumeConsumedM3}
                    onChange={e => setVolumeConsumedM3(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Volumen Vertido (m³)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ej. 420"
                    value={volumeDischargedM3}
                    onChange={e => setVolumeDischargedM3(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">DBO₅ (mg/L)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ej. 35"
                    value={bod5MgL}
                    onChange={e => setBod5MgL(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">DQO (mg/L)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ej. 70"
                    value={codMgL}
                    onChange={e => setCodMgL(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">pH</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ej. 7.2"
                    value={ph}
                    onChange={e => setPh(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="permitCheck"
                  checked={dischargePermitCompliant}
                  onChange={e => setDischargePermitCompliant(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300"
                />
                <label htmlFor="permitCheck" className="font-semibold text-slate-700">
                  Parámetros conformes con los Límites Máximos Permisibles (LMP) de la autorización de vertimiento
                </label>
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
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-sm"
                >
                  Guardar Registro Hídrico
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Section 5.1 Universal Evidence Panel for Water Resources */}
      <ModuleEvidencePanel
        module="agua"
        title="Evidencias Fotográficas de Medidores, Pozos y Puntos de Vertimiento"
        description="Lecturas fotográficas de caudalímetros, estado de PTAR, puntos de toma de muestras y canales de efluentes."
        facilityId={facilityFilter || undefined}
        activeOrgId={activeOrgId}
        userRole={userRole}
        defaultCategory="Registro de Monitoreo"
        emptyMessage="No se registran fotografías vinculadas al módulo de recursos hídricos."
      />
    </div>
  );
};
