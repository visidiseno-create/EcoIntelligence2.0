import React, { useState, useEffect } from 'react';
import {
  FolderLock,
  Plus,
  Download,
  Search,
  Filter,
  FileText,
  FileCheck2,
  Trash2,
  Building2,
  ShieldCheck,
  X,
  Camera,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Slash
} from 'lucide-react';
import { api, Facility, ComplianceDeclaration, EvidenceImage } from '../services/api';
import { EvidenceUploader } from '../components/EvidenceUploader';
import { EvidenceGallery } from '../components/EvidenceGallery';
import { ComplianceDeclarationModal, STATUS_CONFIG } from '../components/ComplianceDeclarationModal';
import { useFeedback } from '../components/FeedbackContext';

interface DocumentsViewProps {
  documents: any[];
  facilities: Facility[];
  obligations: any[];
  onRefresh: () => void;
  canEdit: boolean;
  userRole?: string;
  activeOrgId?: string;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  documents,
  facilities,
  obligations,
  onRefresh,
  canEdit,
  userRole = 'admin',
  activeOrgId
}) => {
  const { showToast, confirmAction } = useFeedback();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPhotoUploader, setShowPhotoUploader] = useState(false);

  // Compliance Declarations & Evidences
  const [declarations, setDeclarations] = useState<ComplianceDeclaration[]>([]);
  const [evidences, setEvidences] = useState<EvidenceImage[]>([]);
  const [selectedDeclaration, setSelectedDeclaration] = useState<ComplianceDeclaration | null>(null);

  const loadModuleComplianceData = async () => {
    try {
      const [decls, evs] = await Promise.all([
        api.getComplianceDeclarations({ module: 'documentos' }),
        api.getEvidences({ module: 'documentos' })
      ]);
      setDeclarations(decls);
      setEvidences(evs);
    } catch (e) {
      console.error('Error loading documents compliance data:', e);
    }
  };

  useEffect(() => {
    setShowPhotoUploader(false);
    loadModuleComplianceData();
  }, [activeOrgId]);

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'licencia' | 'monitoreo' | 'manifiesto' | 'politica' | 'auditoria'>('monitoreo');
  const [facilityId, setFacilityId] = useState('');
  const [obligationId, setObligationId] = useState('');
  const [fileName, setFileName] = useState('');
  const [version, setVersion] = useState('1.0');
  const [formError, setFormError] = useState('');

  const filtered = documents.filter(d => {
    const matchesSearch =
      searchTerm === '' ||
      d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.uploadedBy.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === '' || d.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!title.trim() || !fileName.trim()) {
      setFormError('Título del documento y archivo son obligatorios.');
      return;
    }

    try {
      await api.createDocument({
        title,
        category,
        facilityId: facilityId || undefined,
        obligationId: obligationId || undefined,
        fileName: fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
        version,
        fileSizeKb: Math.floor(Math.random() * 2500) + 400
      });

      setShowUploadModal(false);
      resetForm();
      onRefresh();
      showToast('Documento registrado en el repositorio.', 'success');
    } catch (err: any) {
      setFormError(err.message || 'Error al registrar documento');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAction({
      title: 'Eliminar documento',
      message: '¿Está seguro de eliminar este documento de la biblioteca?',
      confirmLabel: 'Eliminar',
      danger: true
    });
    if (confirmed) {
      try {
        await api.deleteDocument(id);
        onRefresh();
        showToast('Documento eliminado de la biblioteca.', 'success');
      } catch (err: any) {
        showToast(err.message || 'Error al eliminar documento.', 'error');
      }
    }
  };

  const handleDownload = (doc: any) => {
    // Generate text/pdf simulation download
    const content = `ECOINTELLIGENCE - CERTIFICADO Y EVIDENCIA AMBIENTAL\n======================================================\nDocumento: ${doc.title}\nArchivo: ${doc.fileName}\nCategoría: ${doc.category.toUpperCase()}\nVersión: ${doc.version}\nFecha de Carga: ${doc.uploadDate}\nSubido Por: ${doc.uploadedBy}\n\nEste archivo certifica el registro formal de la evidencia ambiental en la plataforma ECOINTELLIGENCE con trazabilidad e integridad de custodia.\n======================================================\nFirma Digital de Integridad SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Descargando ${doc.fileName}...`, 'info');
  };

  const resetForm = () => {
    setTitle('');
    setCategory('monitoreo');
    setFacilityId('');
    setObligationId('');
    setFileName('');
    setVersion('1.0');
    setFormError('');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <FolderLock className="w-6 h-6 text-emerald-600" />
            Biblioteca Documental & Custodia de Evidencias
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Repositorio centralizado de Resoluciones Directorales, IGA, informes de laboratorio acreditado y manifiestos SIGERSOL.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowPhotoUploader(!showPhotoUploader)}
              aria-label="Cargar evidencia fotográfica"
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
                setShowUploadModal(true);
              }}
              aria-label="Cargar documento o evidencia"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Cargar Documento</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por título, nombre de archivo o responsable..."
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
            <option value="licencia">Licencias & Resoluciones (IGA)</option>
            <option value="monitoreo">Informes de Monitoreo Acreditado</option>
            <option value="manifiesto">Manifiestos de Residuos</option>
            <option value="politica">Políticas & Planes de Contingencia</option>
            <option value="auditoria">Informes de Auditoría</option>
          </select>
        </div>
      </div>

      {/* Photo Uploader Section */}
      {showPhotoUploader && canEdit && (
        <EvidenceUploader
          module="documentos"
          defaultCategory="Custodia de Evidencias"
          onUploaded={() => {
            setShowPhotoUploader(false);
            loadModuleComplianceData();
            showToast('Evidencias fotográficas cargadas.', 'success');
          }}
          onCancel={() => setShowPhotoUploader(false)}
        />
      )}

      {/* SECTION 5.2.A: Declaración Formal de Cumplimiento (Documentos y Evidencias) */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-200">
          <div>
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              Declaraciones Oficiales de Cumplimiento Documental (Sección 5.2.A)
            </h2>
            <p className="text-xs text-stone-500">
              Evaluación expresa y justificada en 5 estados oficiales con vinculación probatoria.
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded self-start sm:self-auto">
            {declarations.length} Requisitos Monitoreados
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

      {/* Documents Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Documento & Archivo</th>
                <th className="py-3 px-4">Categoría</th>
                <th className="py-3 px-4">Instalación / Obligación</th>
                <th className="py-3 px-4 text-center">Versión</th>
                <th className="py-3 px-4">Fecha de Carga</th>
                <th className="py-3 px-4">Subido Por</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map(doc => {
                  const fac = facilities.find(f => f.id === doc.facilityId);
                  const ob = obligations.find(o => o.id === doc.obligationId);
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-start gap-2.5">
                          <FileText className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-slate-900">{doc.title}</p>
                            <p className="text-[11px] font-mono text-slate-500 mt-0.5">{doc.fileName} ({(doc.fileSizeKb / 1024).toFixed(1)} MB)</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-slate-100 text-slate-700">
                          {doc.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {fac?.name || 'Corporativo General'}
                        {ob && <p className="text-[10px] text-emerald-700 truncate max-w-[180px]">Vinc: {ob.title}</p>}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-700">
                        v{doc.version}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                        {doc.uploadDate}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {doc.uploadedBy}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDownload(doc)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
                            title="Descargar documento de prueba"
                            aria-label={`Descargar ${doc.fileName}`}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => handleDelete(doc.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="Eliminar documento"
                              aria-label={`Eliminar ${doc.title}`}
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
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    No se encontraron documentos en esta categoría.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900">Cargar Documento / Evidencia Ambiental</h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Título Descriptivo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Informe de Ensayo de Emisiones Trimestre IV"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoría</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="monitoreo">Informe de Monitoreo Acreditado</option>
                    <option value="licencia">Licencia / Resolución IGA</option>
                    <option value="manifiesto">Manifiesto de Residuos</option>
                    <option value="politica">Plan o Política Ambiental</option>
                    <option value="auditoria">Auditoría / Acta</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Versión</label>
                  <input
                    type="text"
                    value={version}
                    onChange={e => setVersion(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre del Archivo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. INFORME_ENSAYO_LAB_Q4.pdf"
                  value={fileName}
                  onChange={e => setFileName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Instalación Asociada</label>
                  <select
                    value={facilityId}
                    onChange={e => setFacilityId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Corporativo / General</option>
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vincular a Obligación Legal</label>
                  <select
                    value={obligationId}
                    onChange={e => setObligationId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Sin vinculación directa</option>
                    {obligations.map(ob => (
                      <option key={ob.id} value={ob.id}>{ob.title.slice(0, 40)}...</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-sm"
                >
                  Subir a Repositorio
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
              Evidencias Fotográficas Adjuntas ({evidences.length})
            </h3>
            <p className="text-xs text-stone-500">
              Fotografías, actas visuales e imágenes de custodia sin cuota artificial de almacenamiento.
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
          emptyMessage="No se registran fotografías en este módulo."
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
