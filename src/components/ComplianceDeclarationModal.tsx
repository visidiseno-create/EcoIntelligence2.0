import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Slash,
  History,
  Camera,
  X,
  FileCheck,
  ShieldCheck,
  Building,
  Calendar,
  AlertOctagon,
  Save,
  Loader2
} from 'lucide-react';
import { ComplianceDeclaration, EvidenceImage, api } from '../services/api';
import { EvidenceUploader } from './EvidenceUploader';
import { EvidenceGallery } from './EvidenceGallery';

interface ComplianceDeclarationModalProps {
  declaration: ComplianceDeclaration;
  onClose: () => void;
  onSaved: (updated: ComplianceDeclaration) => void;
  userRole?: string;
  allEvidences?: EvidenceImage[];
}

export const STATUS_CONFIG: Record<
  ComplianceDeclaration['currentStatus'],
  { label: string; bg: string; text: string; border: string; icon: React.ComponentType<any>; desc: string }
> = {
  cumple: {
    label: 'Cumple Requisito',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
    icon: CheckCircle,
    desc: 'El requisito se encuentra plenamente satisfecho conforme a la normativa y evidencias registradas.'
  },
  no_cumple: {
    label: 'No Cumple (Incumplimiento)',
    bg: 'bg-red-50',
    text: 'text-red-800',
    border: 'border-red-300',
    icon: XCircle,
    desc: 'Existe desviación, omisión o superación de límites aplicables que constituye no conformidad.'
  },
  cumplimiento_parcial: {
    label: 'Cumplimiento Parcial',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-300',
    icon: AlertTriangle,
    desc: 'Se han implementado medidas o presentado partes del requisito, pero restan aspectos pendientes.'
  },
  pendiente_verificacion: {
    label: 'Pendiente de Verificación',
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-300',
    icon: Clock,
    desc: 'En espera de resultados de laboratorio, informe técnico, inspección en terreno o dictamen de autoridad.'
  },
  no_aplica: {
    label: 'No Aplica',
    bg: 'bg-stone-100',
    text: 'text-stone-700',
    border: 'border-stone-300',
    icon: Slash,
    desc: 'La instalación o proceso está legal o técnicamente exento de este requerimiento específico.'
  }
};

export const ComplianceDeclarationModal: React.FC<ComplianceDeclarationModalProps> = ({
  declaration,
  onClose,
  onSaved,
  userRole = 'admin',
  allEvidences = []
}) => {
  const [currentStatus, setCurrentStatus] = useState<ComplianceDeclaration['currentStatus']>(
    declaration.currentStatus
  );
  const [justification, setJustification] = useState<string>('');
  const [attachedIds, setAttachedIds] = useState<string[]>(declaration.attachedEvidenceIds || []);
  const [localEvidences, setLocalEvidences] = useState<EvidenceImage[]>(allEvidences);
  const [activeTab, setActiveTab] = useState<'evaluate' | 'evidences' | 'history'>('evaluate');
  const [showUploader, setShowUploader] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setLocalEvidences(allEvidences);
  }, [allEvidences]);

  const isStatusChanged = currentStatus !== declaration.currentStatus;
  const isReadOnly = userRole === 'lector';

  const parseSafeDate = (dateStr?: string): string => {
    if (!dateStr) return 'Fecha no disponible';
    const normalized = dateStr.includes(' ') && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleString('es-ES');
  };

  // Filter images attached to this declaration
  const attachedEvidences = localEvidences.filter((e) => attachedIds.includes(e.id));

  const handleSave = async () => {
    if (isReadOnly) return;
    setErrorMessage(null);

    // Mandatory justification validation on state change
    if (isStatusChanged && (!justification || justification.trim().length < 5)) {
      setErrorMessage(
        'Es obligatorio ingresar una justificación técnica detallada (mínimo 5 caracteres) para modificar el estado de cumplimiento.'
      );
      setActiveTab('evaluate');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await api.updateComplianceDeclaration(declaration.id, {
        status: currentStatus,
        justification: justification.trim() || 'Actualización de evidencias y verificación técnica.',
        attachedEvidenceIds: attachedIds
      });

      onSaved(updated);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al guardar la declaración de cumplimiento.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewEvidenceUploaded = (newImages: EvidenceImage[]) => {
    const newIds = newImages.map((img) => img.id);
    setLocalEvidences((prev) => [...newImages, ...prev]);
    setAttachedIds((prev) => [...prev, ...newIds]);
    setShowUploader(false);
  };

  const handleDeleteEvidence = async (id: string) => {
    try {
      await api.deleteEvidence(id);
      setAttachedIds((prev) => prev.filter((i) => i !== id));
      setLocalEvidences((prev) => prev.filter((e) => e.id !== id));
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al eliminar evidencia.');
    }
  };

  const currentCfg = STATUS_CONFIG[currentStatus];

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-lg border border-stone-300 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-50 flex items-start justify-between">
          <div className="pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-stone-200 text-stone-800 text-xs font-mono font-bold rounded">
                {declaration.requirementCode}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded">
                {declaration.module}
              </span>
              <span className="text-xs text-stone-500 flex items-center gap-1">
                <Building className="w-3.5 h-3.5" />
                {declaration.facilityName}
              </span>
            </div>
            <h2 className="text-base font-bold text-stone-900 leading-snug">
              {declaration.requirementTitle}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5 font-medium">
              Referencia Legal: <span className="text-stone-700">{declaration.legalReference}</span>
            </p>
          </div>

          <button
            type="button"
            aria-label="Cerrar modal"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1 rounded cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 border-b border-stone-200 bg-white flex items-center gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('evaluate')}
            className={`py-3 border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'evaluate'
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Evaluación y Estado
            {isStatusChanged && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('evidences')}
            className={`py-3 border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'evidences'
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Camera className="w-4 h-4" />
            Evidencias Fotográficas ({attachedIds.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-3 border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'history'
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <History className="w-4 h-4" />
            Trazabilidad Histórica ({declaration.history?.length || 0})
          </button>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5">
          {/* TAB 1: EVALUATE */}
          {activeTab === 'evaluate' && (
            <div className="space-y-5">
              {/* Status Selector */}
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-2 uppercase tracking-wider">
                  Seleccionar Estado de Cumplimiento (5 Estados Oficiales)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(Object.keys(STATUS_CONFIG) as Array<ComplianceDeclaration['currentStatus']>).map(
                    (stKey) => {
                      const cfg = STATUS_CONFIG[stKey];
                      const Icon = cfg.icon;
                      const isSelected = currentStatus === stKey;

                      return (
                        <button
                          key={stKey}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => !isReadOnly && setCurrentStatus(stKey)}
                          className={`p-3 rounded-lg border-2 text-left transition-all flex items-start gap-3 ${
                            isSelected
                              ? `${cfg.bg} ${cfg.border} ring-1 ring-emerald-600 shadow-xs`
                              : 'bg-white border-stone-200 hover:border-stone-300'
                          } ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div className={`mt-0.5 p-1 rounded-full ${cfg.bg} ${cfg.text}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-bold ${cfg.text}`}>{cfg.label}</span>
                              {declaration.currentStatus === stKey && (
                                <span className="text-[10px] text-stone-500 font-normal">
                                  (Estado Actual)
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                              {cfg.desc}
                            </p>
                          </div>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Status Change Notice */}
              {isStatusChanged && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Cambio de estado detectado:</span> pasará de{' '}
                    <span className="font-bold underline">{STATUS_CONFIG[declaration.currentStatus].label}</span>{' '}
                    a <span className="font-bold underline">{currentCfg.label}</span>.
                    <p className="mt-0.5 text-amber-800">
                      Debe documentar obligatoriamente la justificación técnica que sustenta este cambio.
                    </p>
                  </div>
                </div>
              )}

              {/* Justification Field */}
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1.5 flex items-center justify-between">
                  <span>
                    Justificación Técnica y Fundamento de Cumplimiento{' '}
                    {isStatusChanged ? (
                      <span className="text-red-600 font-bold">* (Obligatoria para cambios)</span>
                    ) : (
                      <span className="text-stone-400 font-normal">(Opcional si no cambia estado)</span>
                    )}
                  </span>
                  <span className="text-[11px] text-stone-500">Mínimo 5 caracteres</span>
                </label>
                <textarea
                  rows={4}
                  disabled={isReadOnly}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder={
                    isStatusChanged
                      ? 'Describa detalladamente el motivo técnico, inspección o documentación que justifica este cambio de estado...'
                      : 'Observaciones técnicas o actualización complementaria...'
                  }
                  className="w-full text-xs text-stone-900 bg-white border border-stone-300 rounded p-3 focus:outline-hidden focus:ring-2 focus:ring-emerald-600 disabled:bg-stone-50"
                />
              </div>

              {/* Evidence Summary preview */}
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-3.5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-stone-800">
                    Evidencias Fotográficas Vinculadas ({attachedIds.length})
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {attachedIds.length > 0
                      ? 'Fotografías asociadas como respaldo probatorio del estado declarado.'
                      : 'No se han vinculado fotografías aún a este requerimiento.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('evidences')}
                  className="px-3 py-1.5 bg-white border border-stone-300 hover:bg-stone-100 text-stone-700 text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-700" />
                  Gestionar Fotografías
                </button>
              </div>

              {/* Last Evaluation Metadata */}
              <div className="pt-2 border-t border-stone-200 text-xs text-stone-500 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Última evaluación:{' '}
                  <span className="font-medium text-stone-700">
                    {parseSafeDate(declaration.lastEvaluatedAt)}
                  </span>
                </span>
                <span>
                  Evaluador:{' '}
                  <span className="font-medium text-stone-700">
                    {typeof declaration.lastEvaluatedBy === 'string'
                      ? declaration.lastEvaluatedBy
                      : declaration.lastEvaluatedBy?.name || 'Administrador'}
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: EVIDENCES */}
          {activeTab === 'evidences' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                    Galería de Respaldo Fotográfico
                  </h3>
                  <p className="text-xs text-stone-500">
                    Fotografías tomadas en terreno, placas, rótulos o lecturas técnicas asociadas a este requisito.
                  </p>
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowUploader(!showUploader)}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {showUploader ? 'Ocultar Cargador' : 'Adjuntar Nueva Foto'}
                  </button>
                )}
              </div>

              {showUploader && (
                <EvidenceUploader
                  module={declaration.module}
                  facilityId={declaration.facilityId}
                  entityId={declaration.id}
                  defaultCategory="Inspección en Terreno"
                  onUploaded={handleNewEvidenceUploaded}
                  onCancel={() => setShowUploader(false)}
                />
              )}

              {/* Gallery */}
              <EvidenceGallery
                evidences={attachedEvidences}
                onDelete={isReadOnly ? undefined : handleDeleteEvidence}
                userRole={userRole}
                emptyMessage="No se han adjuntado fotografías a este requisito de cumplimiento."
                showFilters={false}
              />
            </div>
          )}

          {/* TAB 3: IMMUTABLE AUDIT HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                  Trazabilidad Histórica Inmutable
                </h3>
                <p className="text-xs text-stone-500">
                  Registro cronológico auditable de todas las declaraciones y modificaciones efectuadas sobre este requisito.
                </p>
              </div>

              {declaration.history && declaration.history.length > 0 ? (
                <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
                  {declaration.history.map((hist, idx) => {
                    const stCfg =
                      STATUS_CONFIG[hist.newStatus as ComplianceDeclaration['currentStatus']] ||
                      STATUS_CONFIG.cumple;
                    const prevCfg = hist.previousStatus
                      ? STATUS_CONFIG[hist.previousStatus as ComplianceDeclaration['currentStatus']]
                      : null;

                    return (
                      <div key={idx} className="relative group">
                        {/* Dot */}
                        <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-white border-2 border-emerald-600 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-emerald-700" />
                        </div>

                        {/* Card */}
                        <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-xs space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <div className="flex items-center gap-2">
                              {prevCfg && (
                                <>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${prevCfg.bg} ${prevCfg.text}`}>
                                    {prevCfg.label}
                                  </span>
                                  <span className="text-stone-400">→</span>
                                </>
                              )}
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${stCfg.bg} ${stCfg.text}`}>
                                {stCfg.label}
                              </span>
                            </div>

                            <span className="text-[11px] text-stone-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {parseSafeDate(hist.timestamp)}
                            </span>
                          </div>

                          <p className="text-stone-800 font-medium pt-1">
                            {hist.justification}
                          </p>

                          <div className="pt-2 border-t border-stone-200/60 flex items-center justify-between text-[11px] text-stone-500">
                            <span>
                              Registrado por:{' '}
                              <strong className="text-stone-700">
                                {typeof hist.changedBy === 'string' ? hist.changedBy : hist.changedBy?.name || 'Usuario'}
                              </strong>
                              {typeof hist.changedBy !== 'string' && hist.changedBy?.email ? ` (${hist.changedBy.email})` : ''}
                            </span>
                            <span>{hist.evidenceCount} evidencias adjuntas</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-stone-500 text-xs">
                  No hay registros históricos previos.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-stone-300 rounded text-xs font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
          >
            Cerrar
          </button>

          {!isReadOnly && (
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registrando Auditoría...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar Declaración Formal</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
