import React, { useState, useEffect, useCallback } from 'react';
import { Camera, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { api, EvidenceImage } from '../services/api';
import { EvidenceUploader } from './EvidenceUploader';
import { EvidenceGallery } from './EvidenceGallery';
import { useFeedback } from './FeedbackContext';

interface ModuleEvidencePanelProps {
  module: string;
  title?: string;
  description?: string;
  facilityId?: string;
  entityId?: string;
  activeOrgId?: string;
  userRole?: string;
  defaultExpanded?: boolean;
  defaultCategory?: string;
  categories?: string[];
  emptyMessage?: string;
  className?: string;
}

export const ModuleEvidencePanel: React.FC<ModuleEvidencePanelProps> = ({
  module,
  title = 'Evidencias Fotográficas del Módulo',
  description = 'Registro visual georreferenciado y con trazabilidad de usuario, fecha y archivo sin cuota artificial.',
  facilityId,
  entityId,
  activeOrgId,
  userRole = 'admin',
  defaultExpanded = false,
  defaultCategory,
  categories,
  emptyMessage = 'No se registran fotografías cargadas en este módulo.',
  className = ''
}) => {
  const { showToast } = useFeedback();
  const [evidences, setEvidences] = useState<EvidenceImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploader, setShowUploader] = useState(defaultExpanded);

  const canEdit = userRole !== 'lector';

  const loadEvidences = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getEvidences({
        module,
        facilityId: facilityId && facilityId !== 'all' ? facilityId : undefined,
        entityId
      });
      setEvidences(list);
    } catch (err) {
      console.error(`Error cargando evidencias para ${module}:`, err);
    } finally {
      setLoading(false);
    }
  }, [module, facilityId, entityId, activeOrgId]);

  useEffect(() => {
    loadEvidences();
  }, [loadEvidences]);

  const handleUploaded = (newEvidences: EvidenceImage[]) => {
    setEvidences(prev => [...newEvidences, ...prev]);
    setShowUploader(false);
    showToast(`${newEvidences.length} fotografía(s) registrada(s) como evidencia ambiental.`, 'success');
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteEvidence(id);
      setEvidences(prev => prev.filter(e => e.id !== id));
      showToast('Evidencia fotográfica eliminada del repositorio.', 'info');
    } catch (err: any) {
      showToast(err.message || 'No se pudo eliminar la evidencia.', 'error');
      throw err;
    }
  };

  return (
    <section
      className={`bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden ${className}`}
      data-testid={`module-evidence-panel-${module}`}
    >
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-700" />
            <span>{title}</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
              {evidences.length}
            </span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setShowUploader(prev => !prev)}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{showUploader ? 'Ocultar Cargador' : 'Adjuntar Fotografías'}</span>
            {showUploader ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        {canEdit && showUploader && (
          <EvidenceUploader
            module={module}
            facilityId={facilityId && facilityId !== 'all' ? facilityId : undefined}
            entityId={entityId}
            defaultCategory={defaultCategory}
            categories={categories}
            onUploaded={handleUploaded}
            onCancel={() => setShowUploader(false)}
          />
        )}

        {loading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
            <span>Cargando galería de evidencias...</span>
          </div>
        ) : (
          <EvidenceGallery
            evidences={evidences}
            onDelete={canEdit ? handleDelete : undefined}
            userRole={userRole}
            emptyMessage={emptyMessage}
            showFilters={evidences.length > 0}
          />
        )}
      </div>
    </section>
  );
};
