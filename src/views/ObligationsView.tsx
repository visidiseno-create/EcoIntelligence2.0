import React, { useState } from 'react';
import {
  ShieldCheck,
  Plus,
  Search,
  Filter,
  Calendar,
  Building2,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  X,
  Trash2,
  Edit2
} from 'lucide-react';
import { api, Facility } from '../services/api';
import { ModuleEvidencePanel } from '../components/ModuleEvidencePanel';
import { useFeedback } from '../components/FeedbackContext';

interface ObligationsViewProps {
  obligations: any[];
  facilities: Facility[];
  onRefresh: () => void;
  canEdit: boolean;
  userRole?: string;
  activeOrgId?: string;
}

export const ObligationsView: React.FC<ObligationsViewProps> = ({
  obligations,
  facilities,
  onRefresh,
  canEdit,
  userRole = 'admin',
  activeOrgId
}) => {
  const { showToast, confirmAction } = useFeedback();
  const [searchTerm, setSearchTerm] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedObligation, setSelectedObligation] = useState<any | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [normativeSource, setNormativeSource] = useState('');
  const [jurisdiction, setJurisdiction] = useState('Nacional');
  const [dueDate, setDueDate] = useState('');
  const [frequency, setFrequency] = useState('anual');
  const [responsible, setResponsible] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  // Filtering
  const filtered = obligations.filter(ob => {
    const matchesSearch =
      searchTerm === '' ||
      ob.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ob.normativeSource.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ob.responsible.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFacility = facilityFilter === '' || ob.facilityId === facilityFilter;
    const matchesStatus = statusFilter === '' || ob.status === statusFilter;

    return matchesSearch && matchesFacility && matchesStatus;
  });

  const handleCreateObligation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!title.trim() || !normativeSource.trim() || !dueDate) {
      setFormError('Por favor complete los campos obligatorios (*).');
      return;
    }

    try {
      await api.createObligation({
        title,
        normativeSource,
        jurisdiction,
        dueDate,
        frequency,
        responsible,
        facilityId: facilityId || facilities[0]?.id || '',
        description
      });
      setShowAddModal(false);
      resetForm();
      showToast('Obligación ambiental registrada en la matriz legal.', 'success');
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar obligación');
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await api.updateObligation(id, { status: newStatus });
      onRefresh();
      if (selectedObligation && selectedObligation.id === id) {
        setSelectedObligation({ ...selectedObligation, status: newStatus });
      }
      showToast(`Estado actualizado a "${newStatus.replace('_', ' ')}".`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al actualizar estado.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAction({
      title: 'Eliminar obligación legal',
      message: '¿Está seguro de eliminar esta obligación legal del registro?',
      confirmLabel: 'Eliminar',
      danger: true
    });
    if (confirmed) {
      try {
        await api.deleteObligation(id);
        onRefresh();
        setSelectedObligation(null);
        showToast('Obligación eliminada del registro.', 'info');
      } catch (err: any) {
        showToast(err.message || 'Error al eliminar obligación.', 'error');
      }
    }
  };

  const resetForm = () => {
    setTitle('');
    setNormativeSource('');
    setJurisdiction('Nacional');
    setDueDate('');
    setFrequency('anual');
    setResponsible('');
    setFacilityId('');
    setDescription('');
    setFormError('');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            Matriz de Cumplimiento Legal y Obligaciones Ambientales
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Registro sistemático de compromisos emanados de IGA, licencias, normas sectoriales y plazos legales.
          </p>
        </div>

        {canEdit && (
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            aria-label="Registrar nueva obligación"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Obligación</span>
          </button>
        )}
      </div>

      {/* Controls & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por título, norma o responsable..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <select
            value={facilityFilter}
            onChange={e => setFacilityFilter(e.target.value)}
            aria-label="Filtrar por instalación"
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-emerald-500"
          >
            <option value="">Todas las instalaciones</option>
            {facilities.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filtrar por estado"
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-emerald-500"
          >
            <option value="">Todos los estados</option>
            <option value="cumplida">Cumplida</option>
            <option value="en_progreso">En Progreso</option>
            <option value="pendiente">Pendiente</option>
            <option value="vencida">Vencida</option>
          </select>

          <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0">
            <button
              onClick={() => setViewMode('table')}
              aria-label="Vista tabla"
              className={`px-3 py-1 text-xs font-semibold ${viewMode === 'table' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Tabla
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              aria-label="Vista calendario"
              className={`px-3 py-1 text-xs font-semibold ${viewMode === 'calendar' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Calendario
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Obligación & Fuente Normativa</th>
                  <th className="py-3 px-4">Instalación</th>
                  <th className="py-3 px-4">Vencimiento</th>
                  <th className="py-3 px-4">Frecuencia</th>
                  <th className="py-3 px-4">Responsable</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-center">Evidencias</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length > 0 ? (
                  filtered.map(ob => {
                    const fac = facilities.find(f => f.id === ob.facilityId);
                    const isOverdue = ob.status === 'vencida' || (ob.status !== 'cumplida' && ob.dueDate < '2026-11-04');
                    return (
                      <tr key={ob.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{ob.title}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{ob.normativeSource} • Jurisdicción: {ob.jurisdiction}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {fac?.name || 'Corporativo General'}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-800">
                          <span className={isOverdue ? 'text-rose-600 font-bold' : ''}>{ob.dueDate}</span>
                        </td>
                        <td className="py-3 px-4 capitalize text-slate-600">
                          {ob.frequency}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {ob.responsible}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                            ob.status === 'cumplida'
                              ? 'bg-emerald-100 text-emerald-800'
                              : isOverdue
                              ? 'bg-rose-100 text-rose-800'
                              : ob.status === 'en_progreso'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {ob.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {ob.evidenceCount || 0}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedObligation(ob)}
                              aria-label={`Ver detalle ${ob.title}`}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium transition-colors"
                            >
                              Detalle
                            </button>
                            {canEdit && (
                              <button
                                onClick={() => handleDelete(ob.id)}
                                aria-label={`Eliminar ${ob.title}`}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                      No se encontraron obligaciones que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Calendar View */
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              Agenda Mensual de Vencimientos Ambientales (Noviembre - Diciembre 2026)
            </h3>
            <span className="text-xs text-slate-500">Cronograma de plazos regulatorios</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {filtered.map(ob => (
              <div
                key={ob.id}
                onClick={() => setSelectedObligation(ob)}
                className="p-3.5 rounded-lg border border-slate-200 hover:border-emerald-500 hover:shadow-sm cursor-pointer transition-all bg-slate-50/50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-800">{ob.dueDate}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono uppercase font-semibold ${
                    ob.status === 'cumplida' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {ob.status}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 mt-2 line-clamp-2">{ob.title}</h4>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{ob.normativeSource}</p>
                <p className="text-[11px] text-slate-600 mt-2 font-medium">Resp: {ob.responsible}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Obligation Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900">Registrar Obligación Ambiental</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateObligation} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Título de la Obligación *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Monitoreo Semestral de Ruido Ambiental"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fuente Normativa / IGA *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. D.S. 085-2003-PCM o EIA"
                    value={normativeSource}
                    onChange={e => setNormativeSource(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jurisdicción</label>
                  <select
                    value={jurisdiction}
                    onChange={e => setJurisdiction(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Nacional">Nacional (OEFA / MINAM)</option>
                    <option value="Sectorial">Sectorial (PRODUCE / MINEM / MIDAGRI)</option>
                    <option value="Regional">Regional / GORE</option>
                    <option value="Municipal">Municipal / Local</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha de Vencimiento *</label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Frecuencia</label>
                  <select
                    value={frequency}
                    onChange={e => setFrequency(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="mensual">Mensual</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="semestral">Semestral</option>
                    <option value="anual">Anual</option>
                    <option value="unica">Única vez</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Responsable</label>
                  <input
                    type="text"
                    placeholder="Ingeniero o cargo"
                    value={responsible}
                    onChange={e => setResponsible(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Instalación Vinculada</label>
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
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descripción / Alcance</label>
                <textarea
                  rows={2}
                  placeholder="Detalles sobre el protocolo de ensayo, entidad ante la cual se presenta..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                ></textarea>
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
                  Guardar Obligación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Obligation Detail / Status Modal */}
      {selectedObligation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900">Detalle de Obligación Legal</h2>
              <button
                onClick={() => setSelectedObligation(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Título</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">{selectedObligation.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Fuente Normativa</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{selectedObligation.normativeSource}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Vencimiento</span>
                  <p className="font-mono font-bold text-slate-900 mt-0.5">{selectedObligation.dueDate}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Responsable</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{selectedObligation.responsible}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Evidencias Cargadas</span>
                  <p className="font-mono font-bold text-emerald-700 mt-0.5">{selectedObligation.evidenceCount || 0} archivos</p>
                </div>
              </div>

              {selectedObligation.description && (
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Alcance & Notas</span>
                  <p className="text-slate-700 mt-0.5 leading-relaxed">{selectedObligation.description}</p>
                </div>
              )}

              {canEdit && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1.5">Actualizar Estado</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleUpdateStatus(selectedObligation.id, 'cumplida')}
                      className={`px-3 py-1.5 rounded-lg font-semibold border ${
                        selectedObligation.status === 'cumplida'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                      }`}
                    >
                      ✓ Marcar Cumplida
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedObligation.id, 'en_progreso')}
                      className={`px-3 py-1.5 rounded-lg font-semibold border ${
                        selectedObligation.status === 'en_progreso'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      En Progreso
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedObligation.id, 'pendiente')}
                      className={`px-3 py-1.5 rounded-lg font-semibold border ${
                        selectedObligation.status === 'pendiente'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                      }`}
                    >
                      Pendiente
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedObligation.id, 'vencida')}
                      className={`px-3 py-1.5 rounded-lg font-semibold border ${
                        selectedObligation.status === 'vencida'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-50'
                      }`}
                    >
                      Vencida
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-3 flex justify-end">
                <button
                  onClick={() => setSelectedObligation(null)}
                  className="px-4 py-1.5 bg-slate-800 text-white font-semibold rounded-lg text-xs"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 5.1 Universal Evidence Panel for Obligations */}
      <ModuleEvidencePanel
        module="obligaciones"
        title="Evidencias Fotográficas de Cumplimiento de Obligaciones Legales"
        description="Respaldo fotográfico de avisos, cargos presentados ante OEFA/MINAM/ANA y cumplimiento en sitio."
        facilityId={facilityFilter || undefined}
        activeOrgId={activeOrgId}
        userRole={userRole}
        defaultCategory="Registro de Monitoreo"
        emptyMessage="No se registran fotografías cargadas para las obligaciones ambientales."
      />
    </div>
  );
};
