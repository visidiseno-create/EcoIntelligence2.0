import React, { useState } from 'react';
import {
  Building2,
  Plus,
  MapPin,
  FileBadge,
  Activity,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';
import { api, Facility } from '../services/api';
import { ModuleEvidencePanel } from '../components/ModuleEvidencePanel';
import { useFeedback } from '../components/FeedbackContext';

interface FacilitiesViewProps {
  facilities: Facility[];
  onRefresh: () => void;
  canEdit: boolean;
  userRole?: string;
  activeOrgId?: string;
}

export const FacilitiesView: React.FC<FacilitiesViewProps> = ({
  facilities,
  onRefresh,
  canEdit,
  userRole = 'admin',
  activeOrgId
}) => {
  const { showToast } = useFeedback();
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [activity, setActivity] = useState('');
  const [environmentalPermitCode, setEnvironmentalPermitCode] = useState('');
  const [lat, setLat] = useState('-12.0464');
  const [lng, setLng] = useState('-77.0428');
  const [formError, setFormError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim() || !code.trim()) {
      setFormError('Nombre e Identificador de Instalación son obligatorios.');
      return;
    }

    try {
      await api.createFacility({
        name,
        code,
        address,
        activity,
        environmentalPermitCode,
        coordinates: {
          lat: parseFloat(lat) || -12.0464,
          lng: parseFloat(lng) || -77.0428
        }
      });
      setShowAddModal(false);
      resetForm();
      showToast('Instalación operativa registrada correctamente.', 'success');
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar instalación');
    }
  };

  const resetForm = () => {
    setName('');
    setCode('');
    setAddress('');
    setActivity('');
    setEnvironmentalPermitCode('');
    setLat('-12.0464');
    setLng('-77.0428');
    setFormError('');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-emerald-600" />
            Gestión de Instalaciones & Sedes Operativas
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Plantas industriales, depósitos y centros operativos con licencias e IGA aprobados.
          </p>
        </div>

        {canEdit && (
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            aria-label="Registrar nueva instalación"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Instalación</span>
          </button>
        )}
      </div>

      {/* Facility Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {facilities.map(fac => (
          <div
            key={fac.id}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {fac.code}
                  </span>
                  <h2 className="text-sm font-bold text-slate-900 mt-2">{fac.name}</h2>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {fac.status.toUpperCase()}
                </span>
              </div>

              <div className="mt-4 space-y-2.5 text-xs text-slate-600">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <span>{fac.address}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Activity className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{fac.activity}</span>
                </div>
                <div className="flex items-start gap-2">
                  <FileBadge className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span className="font-mono text-slate-700">Permiso IGA: {fac.environmentalPermitCode}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Coordenadas GPS:</span>
              <span className="text-slate-700 font-semibold">{fac.coordinates.lat.toFixed(4)}, {fac.coordinates.lng.toFixed(4)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Registrar Nueva Instalación</h3>
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
                  <label className="block font-semibold text-slate-700 mb-1">Nombre de la Sede *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Planta de Procesamiento Lurín"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código de Instalación *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. PLT-LUR-01"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dirección y Localidad</label>
                <input
                  type="text"
                  placeholder="Dirección fiscal / operativa completa"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Actividad Productiva Principal</label>
                <input
                  type="text"
                  placeholder="Ej. Extracción de aceites y envasado de alimentos"
                  value={activity}
                  onChange={e => setActivity(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Código de Permiso IGA / Licencia Ambiental</label>
                <input
                  type="text"
                  placeholder="Ej. DIA-PRODUCE-2023-049"
                  value={environmentalPermitCode}
                  onChange={e => setEnvironmentalPermitCode(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Latitud GPS</label>
                  <input
                    type="text"
                    value={lat}
                    onChange={e => setLat(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Longitud GPS</label>
                  <input
                    type="text"
                    value={lng}
                    onChange={e => setLng(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-emerald-500"
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
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-sm"
                >
                  Guardar Instalación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Section 5.1 Universal Evidence Panel for Facilities */}
      <ModuleEvidencePanel
        module="instalaciones"
        title="Galería Fotográfica de Instalaciones, Perímetros y Permisos"
        description="Evidencias visuales de infraestructura productiva, zonas de almacenamiento, rótulos y señalización por sede."
        activeOrgId={activeOrgId}
        userRole={userRole}
        defaultCategory="Placa Identificatoria"
        emptyMessage="No se registran fotografías cargadas para las instalaciones de esta organización."
      />
    </div>
  );
};
