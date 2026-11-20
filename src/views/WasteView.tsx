import React, { useState, useEffect } from 'react';
import {
  Trash2,
  Plus,
  Download,
  Search,
  Filter,
  Truck,
  Building,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
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

interface WasteViewProps {
  records: any[];
  facilities: Facility[];
  onRefresh: () => void;
  canEdit: boolean;
  userRole?: string;
  activeOrgId?: string;
}

export const WasteView: React.FC<WasteViewProps> = ({
  records,
  facilities,
  onRefresh,
  canEdit,
  userRole = 'admin',
  activeOrgId
}) => {
  const { showToast, confirmAction } = useFeedback();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPhotoUploader, setShowPhotoUploader] = useState(false);

  // Compliance Declarations & Evidences (Section 5.1 & 5.2.B)
  const [declarations, setDeclarations] = useState<ComplianceDeclaration[]>([]);
  const [evidences, setEvidences] = useState<EvidenceImage[]>([]);
  const [selectedDeclaration, setSelectedDeclaration] = useState<ComplianceDeclaration | null>(null);

  const loadModuleComplianceData = async () => {
    try {
      const [decls, evs] = await Promise.all([
        api.getComplianceDeclarations({ module: 'residuos' }),
        api.getEvidences({ module: 'residuos' })
      ]);
      setDeclarations(decls);
      setEvidences(evs);
    } catch (e) {
      console.error('Error loading waste compliance data:', e);
    }
  };

  useEffect(() => {
    setFacilityFilter('');
    setShowPhotoUploader(false);
    loadModuleComplianceData();
  }, [activeOrgId]);

  // Form State
  const [wasteName, setWasteName] = useState('');
  const [category, setCategory] = useState<'peligroso' | 'no_peligroso' | 'reciclable' | 'organico' | 'raee'>('peligroso');
  const [quantityKg, setQuantityKg] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [originProcess, setOriginProcess] = useState('');
  const [carrier, setCarrier] = useState('');
  const [destination, setDestination] = useState('');
  const [treatmentType, setTreatmentType] = useState('disposicion_final');
  const [manifestNumber, setManifestNumber] = useState('');
  const [formError, setFormError] = useState('');

  // Statistics
  const totalKg = records.reduce((acc, r) => acc + r.quantityKg, 0);
  const hazardousKg = records.filter(r => r.category === 'peligroso').reduce((acc, r) => acc + r.quantityKg, 0);
  const nonHazardousKg = totalKg - hazardousKg;
  const recycledKg = records
    .filter(r => r.treatmentType === 'reciclaje' || r.treatmentType === 'compostaje')
    .reduce((acc, r) => acc + r.quantityKg, 0);
  const recyclingRate = totalKg > 0 ? Math.round((recycledKg / totalKg) * 1000) / 10 : 0;

  // Filtered
  const filtered = records.filter(r => {
    const matchesSearch =
      searchTerm === '' ||
      r.wasteName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.carrier.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.manifestNumber && r.manifestNumber.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = categoryFilter === '' || r.category === categoryFilter;
    const matchesFacility = facilityFilter === '' || r.facilityId === facilityFilter;

    return matchesSearch && matchesCategory && matchesFacility;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!wasteName.trim() || !quantityKg) {
      setFormError('Nombre del residuo y cantidad en kg son requeridos.');
      return;
    }

    try {
      await api.createWaste({
        wasteName,
        category,
        quantityKg: parseFloat(quantityKg),
        facilityId: facilityId || facilities[0]?.id || '',
        date,
        originProcess,
        carrier,
        destination,
        treatmentType,
        manifestNumber
      });
      setShowAddModal(false);
      resetForm();
      onRefresh();
      showToast('Despacho de residuo registrado correctamente.', 'success');
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar residuo');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAction({
      title: 'Eliminar registro de residuo',
      message: '¿Está seguro de eliminar este registro de manifiesto de residuos?',
      confirmLabel: 'Eliminar',
      danger: true
    });
    if (confirmed) {
      try {
        await api.deleteWaste(id);
        onRefresh();
        showToast('Registro de residuo eliminado.', 'success');
      } catch (err: any) {
        showToast(err.message || 'Error al eliminar el registro.', 'error');
      }
    }
  };

  const resetForm = () => {
    setWasteName('');
    setCategory('peligroso');
    setQuantityKg('');
    setFacilityId('');
    setDate(new Date().toISOString().split('T')[0]);
    setOriginProcess('');
    setCarrier('');
    setDestination('');
    setTreatmentType('disposicion_final');
    setManifestNumber('');
    setFormError('');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Trash2 className="w-6 h-6 text-emerald-600" />
            Gestión Integral y Manifiestos de Residuos
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Custodia, trazabilidad de transportistas autorizados (EO-RS), segregación y valorización.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowPhotoUploader(!showPhotoUploader)}
              aria-label="Cargar evidencia fotográfica de residuos"
              className="px-3.5 py-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <Camera className="w-4 h-4 text-emerald-400" />
              <span>Adjuntar Fotos ({evidences.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              try {
                await api.downloadReportCsv('residuos', facilityFilter || undefined);
                showToast('Archivo CSV de residuos descargado.', 'success');
              } catch (err: any) {
                showToast(err.message || 'Error al exportar CSV.', 'error');
              }
            }}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Exportar CSV</span>
          </button>

          {canEdit && (
            <button
              onClick={() => {
                resetForm();
                setShowAddModal(true);
              }}
              aria-label="Registrar residuo"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Residuo</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Generación Total</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1.5">{totalKg.toLocaleString()} <span className="text-xs font-normal text-slate-500">kg</span></p>
          <p className="text-[11px] text-slate-500 mt-1">{records.length} despachos documentados</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-amber-700 uppercase">Residuos Peligrosos</span>
          <p className="text-2xl font-extrabold text-amber-900 mt-1.5">{hazardousKg.toLocaleString()} <span className="text-xs font-normal text-slate-500">kg</span></p>
          <p className="text-[11px] text-slate-500 mt-1">{totalKg > 0 ? Math.round((hazardousKg / totalKg) * 100) : 0}% de la masa total generada</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">No Peligrosos / Comunes</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1.5">{nonHazardousKg.toLocaleString()} <span className="text-xs font-normal text-slate-500">kg</span></p>
          <p className="text-[11px] text-slate-500 mt-1">Orgánicos, plásticos, cartón y chatarras</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase">Tasa de Valorización</span>
          <p className="text-2xl font-extrabold text-emerald-800 mt-1.5">{recyclingRate}%</p>
          <p className="text-[11px] text-slate-500 mt-1">{recycledKg.toLocaleString()} kg reciclados o compostados</p>
        </div>
      </div>

      {/* Photo Uploader Section */}
      {showPhotoUploader && canEdit && (
        <EvidenceUploader
          module="residuos"
          categories={[
            'Acopio Temporal',
            'Balanza y Pesaje',
            'Rotulado y Señalética',
            'Guía / Manifiesto EO-RS',
            'Camión / Transportista',
            'Otros'
          ]}
          defaultCategory="Acopio Temporal"
          onUploaded={() => {
            setShowPhotoUploader(false);
            loadModuleComplianceData();
            showToast('Evidencias fotográficas cargadas.', 'success');
          }}
          onCancel={() => setShowPhotoUploader(false)}
        />
      )}

      {/* SECTION 5.2.B: Declaraciones Oficiales de Manejo de Residuos */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-200">
          <div>
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              Declaraciones Oficiales de Gestión de Residuos (Sección 5.2.B)
            </h2>
            <p className="text-xs text-stone-500">
              Segregación, almacenamiento temporal, etiquetado, transportista autorizado (EO-RS) y disposición final.
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded self-start sm:self-auto">
            {declarations.length} Requisitos Evaluados
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

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por residuo, transportista o manifiesto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="">Todas las categorías</option>
            <option value="peligroso">Peligroso</option>
            <option value="no_peligroso">No Peligroso</option>
            <option value="reciclable">Reciclable</option>
            <option value="organico">Orgánico</option>
            <option value="raee">RAEE (Eléctrico/Electrónico)</option>
          </select>

          <select
            value={facilityFilter}
            onChange={e => setFacilityFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="">Todas las sedes</option>
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
                <th className="py-3 px-4">Residuo & Categoría</th>
                <th className="py-3 px-4 text-right">Cantidad</th>
                <th className="py-3 px-4">Origen / Proceso</th>
                <th className="py-3 px-4">Transportista Autorizado</th>
                <th className="py-3 px-4">Destino / Tratamiento</th>
                <th className="py-3 px-4">Manifiesto</th>
                {canEdit && <th className="py-3 px-4 text-right">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map(r => {
                  const isHaz = r.category === 'peligroso';
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-700 whitespace-nowrap">
                        {r.date}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{r.wasteName}</p>
                        <span className={`inline-block mt-0.5 px-2 py-0.2 rounded text-[10px] font-mono font-semibold uppercase ${
                          isHaz ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {r.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {r.quantityKg.toLocaleString()} kg
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {r.originProcess}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {r.carrier}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <p className="truncate max-w-[200px]" title={r.destination}>{r.destination}</p>
                        <span className="text-[10px] text-slate-500 capitalize">{r.treatmentType.replace('_', ' ')}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {r.manifestNumber || '—'}
                      </td>
                      {canEdit && (
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            aria-label={`Eliminar residuo ${r.wasteName}`}
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
                    No se encontraron registros de residuos.
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
              <h2 className="text-sm font-bold text-slate-900">Registrar Despacho de Residuos</h2>
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
                  <label className="block font-semibold text-slate-700 mb-1">Nombre del Residuo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Aceite usado / Lodos PTAR"
                    value={wasteName}
                    onChange={e => setWasteName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoría</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="peligroso">Peligroso</option>
                    <option value="no_peligroso">No Peligroso</option>
                    <option value="reciclable">Reciclable</option>
                    <option value="organico">Orgánico</option>
                    <option value="raee">RAEE</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cantidad (kg) *</label>
                  <input
                    type="number"
                    required
                    step="0.1"
                    placeholder="Ej. 450"
                    value={quantityKg}
                    onChange={e => setQuantityKg(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Proceso de Origen</label>
                  <input
                    type="text"
                    placeholder="Ej. Taller de mantenimiento"
                    value={originProcess}
                    onChange={e => setOriginProcess(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Transportista (EO-RS)</label>
                  <input
                    type="text"
                    placeholder="Empresa operadora autorizada"
                    value={carrier}
                    onChange={e => setCarrier(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">N° Manifiesto Oficial</label>
                  <input
                    type="text"
                    placeholder="Ej. MAN-2026-0912"
                    value={manifestNumber}
                    onChange={e => setManifestNumber(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Destino / Planta Final</label>
                  <input
                    type="text"
                    placeholder="Nombre del relleno o planta"
                    value={destination}
                    onChange={e => setDestination(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo de Tratamiento</label>
                  <select
                    value={treatmentType}
                    onChange={e => setTreatmentType(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="disposicion_final">Disposición Final (Relleno)</option>
                    <option value="reciclaje">Reciclaje / Re-refinación</option>
                    <option value="compostaje">Compostaje</option>
                    <option value="incineracion">Incineración Controlada</option>
                  </select>
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
                  Guardar Registro
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
              Evidencias Fotográficas de Residuos ({evidences.length})
            </h3>
            <p className="text-xs text-stone-500">
              Registros visuales de acopio, balanzas, manifiestos y áreas de almacenamiento sin límite de imágenes.
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
          emptyMessage="No se registran fotografías en el módulo de residuos."
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
