import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  AlertTriangle,
  Plus,
  CheckCircle2,
  Clock,
  UserCheck,
  Building2,
  FileText,
  Search,
  Filter,
  X,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { api, Facility } from '../services/api';
import { ModuleEvidencePanel } from '../components/ModuleEvidencePanel';
import { useFeedback } from '../components/FeedbackContext';

interface InspectionsViewProps {
  inspections: any[];
  correctiveActions: any[];
  templates: any[];
  facilities: Facility[];
  onRefresh: () => void;
  canEdit: boolean;
  userRole?: string;
  activeOrgId?: string;
  initialTab?: 'inspections' | 'capa';
}

export const InspectionsView: React.FC<InspectionsViewProps> = ({
  inspections,
  correctiveActions,
  templates,
  facilities,
  onRefresh,
  canEdit,
  userRole = 'admin',
  activeOrgId,
  initialTab = 'inspections'
}) => {
  const { showToast } = useFeedback();
  const [activeSubTab, setActiveSubTab] = useState<'inspections' | 'capa'>(initialTab);
  const [showNewInspModal, setShowNewInspModal] = useState(false);
  const [showNewCapaModal, setShowNewCapaModal] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<any | null>(null);
  const [selectedCapa, setSelectedCapa] = useState<any | null>(null);
  const [closureEvidenceInput, setClosureEvidenceInput] = useState('');

  useEffect(() => {
    setActiveSubTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setClosureEvidenceInput(selectedCapa?.closureEvidence || '');
  }, [selectedCapa]);

  // New Inspection Form
  const [inspTitle, setInspTitle] = useState('');
  const [inspFacilityId, setInspFacilityId] = useState('');
  const [inspTemplateId, setInspTemplateId] = useState(templates[0]?.id || 'tmpl-1');
  const [inspInspector, setInspInspector] = useState('');
  const [inspScore, setInspScore] = useState('85');
  const [inspSummary, setInspSummary] = useState('');
  const [inspFindingDesc, setInspFindingDesc] = useState('');
  const [inspFindingType, setInspFindingType] = useState<'no_conformidad_mayor' | 'no_conformidad_menor' | 'oportunidad_mejora'>('no_conformidad_menor');
  const [inspFindingArea, setInspFindingArea] = useState('');
  const [hasFinding, setHasFinding] = useState(false);
  const [formError, setFormError] = useState('');

  // New CAPA Form
  const [capaTitle, setCapaTitle] = useState('');
  const [capaFacilityId, setCapaFacilityId] = useState('');
  const [capaFindingDesc, setCapaFindingDesc] = useState('');
  const [capaRootCause, setCapaRootCause] = useState('');
  const [capaProposedAction, setCapaProposedAction] = useState('');
  const [capaResponsible, setCapaResponsible] = useState('');
  const [capaDeadline, setCapaDeadline] = useState('');

  const handleCreateInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!inspTitle.trim()) {
      setFormError('El título de la inspección es requerido.');
      return;
    }

    try {
      const findings = hasFinding && inspFindingDesc.trim() ? [
        {
          id: `fnd-${Date.now()}`,
          type: inspFindingType,
          description: inspFindingDesc,
          area: inspFindingArea || 'Área de planta',
          actionRequired: true
        }
      ] : [];

      await api.createInspection({
        title: inspTitle,
        facilityId: inspFacilityId || facilities[0]?.id || '',
        templateId: inspTemplateId,
        inspector: inspInspector || 'Auditor Ambiental',
        score: parseInt(inspScore) || 85,
        summary: inspSummary || 'Auditoría conforme a protocolo técnico.',
        findings
      });

      setShowNewInspModal(false);
      resetInspForm();
      showToast('Inspección de planta registrada correctamente.', 'success');
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar inspección');
    }
  };

  const handleCreateCapa = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!capaTitle.trim() || !capaProposedAction.trim() || !capaDeadline) {
      setFormError('Título, acción propuesta y fecha límite son obligatorios.');
      return;
    }

    try {
      await api.createCorrectiveAction({
        title: capaTitle,
        facilityId: capaFacilityId || facilities[0]?.id || '',
        findingDescription: capaFindingDesc,
        rootCause: capaRootCause,
        proposedAction: capaProposedAction,
        responsible: capaResponsible || 'Jefe de Planta',
        deadline: capaDeadline
      });
      setShowNewCapaModal(false);
      resetCapaForm();
      showToast('Acción correctiva (CAPA) creada correctamente.', 'success');
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Error al registrar CAPA');
    }
  };

  const handleUpdateCapaStatus = async (id: string, newStatus: string, evidenceText?: string) => {
    try {
      const updatedEvidence = evidenceText !== undefined ? evidenceText : closureEvidenceInput;
      await api.updateCorrectiveAction(id, {
        status: newStatus,
        closureEvidence: updatedEvidence || selectedCapa?.closureEvidence
      });
      onRefresh();
      if (selectedCapa && selectedCapa.id === id) {
        setSelectedCapa({ ...selectedCapa, status: newStatus, closureEvidence: updatedEvidence || selectedCapa.closureEvidence });
      }
      showToast(`Estado de CAPA actualizado a "${newStatus.replace('_', ' ')}".`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al actualizar acción CAPA.', 'error');
    }
  };

  const resetInspForm = () => {
    setInspTitle('');
    setInspFacilityId('');
    setInspInspector('');
    setInspScore('85');
    setInspSummary('');
    setInspFindingDesc('');
    setInspFindingType('no_conformidad_menor');
    setInspFindingArea('');
    setHasFinding(false);
    setFormError('');
  };

  const resetCapaForm = () => {
    setCapaTitle('');
    setCapaFacilityId('');
    setCapaFindingDesc('');
    setCapaRootCause('');
    setCapaProposedAction('');
    setCapaResponsible('');
    setCapaDeadline('');
    setFormError('');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <ClipboardCheck className="w-6 h-6 text-emerald-600" />
            Inspecciones en Planta & Acciones Correctivas (CAPA)
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Listas de verificación en terreno, auditorías cruzadas, formulación de hallazgos y cierre formal de no conformidades.
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
            {activeSubTab === 'inspections' ? (
              <button
                onClick={() => {
                  resetInspForm();
                  setShowNewInspModal(true);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva Inspección</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  resetCapaForm();
                  setShowNewCapaModal(true);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva Acción (CAPA)</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sub Tabs Toggle */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('inspections')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'inspections'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>Inspecciones Ejecutadas ({inspections.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('capa')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'capa'
              ? 'border-amber-600 text-amber-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Acciones Correctivas / CAPA ({correctiveActions.length})</span>
        </button>
      </div>

      {/* Tab 1: Inspections List */}
      {activeSubTab === 'inspections' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {inspections.map(insp => {
              const fac = facilities.find(f => f.id === insp.facilityId);
              const findingsCount = insp.findings ? insp.findings.length : 0;
              return (
                <div
                  key={insp.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-mono text-slate-500">{insp.date}</span>
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        insp.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        Score: {insp.score}/100
                      </span>
                    </div>

                    <h2 className="text-sm font-bold text-slate-900 mt-2 line-clamp-2">{insp.title}</h2>
                    <p className="text-[11px] text-slate-500 mt-1">Sede: {fac?.name || 'Sede'} • Inspector: {insp.inspector}</p>

                    <p className="text-xs text-slate-600 mt-3 line-clamp-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      {insp.summary}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      {findingsCount} hallazgo(s) formulado(s)
                    </span>
                    <button
                      onClick={() => setSelectedInspection(insp)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
                    >
                      <span>Ver Hallazgos</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Tab 2: Corrective Actions (CAPA) */
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Acción Correctiva & Causa Raíz</th>
                  <th className="py-3 px-4">Instalación</th>
                  <th className="py-3 px-4">Responsable</th>
                  <th className="py-3 px-4">Fecha Límite</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Gestión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {correctiveActions.map(capa => {
                  const fac = facilities.find(f => f.id === capa.facilityId);
                  const isClosed = capa.status === 'cerrada';
                  return (
                    <tr key={capa.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 max-w-md">
                        <p className="font-semibold text-slate-900">{capa.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          <strong>Causa raíz:</strong> {capa.rootCause}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">
                          <strong>Acción:</strong> {capa.proposedAction}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {fac?.name || 'Sede'}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {capa.responsible}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-800 whitespace-nowrap">
                        {capa.deadline}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                          isClosed
                            ? 'bg-emerald-100 text-emerald-800'
                            : capa.status === 'en_verificacion'
                            ? 'bg-blue-100 text-blue-800'
                            : capa.status === 'en_implementacion'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {capa.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedCapa(capa)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold transition-colors"
                        >
                          Auditar / Cerrar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Inspection Modal */}
      {showNewInspModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900">Registrar Inspección en Terreno</h2>
              <button onClick={() => setShowNewInspModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateInspection} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Título de la Inspección *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Inspección de PTAR y Almacén de Residuos Q4"
                  value={inspTitle}
                  onChange={e => setInspTitle(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Instalación Auditada *</label>
                  <select
                    value={inspFacilityId}
                    onChange={e => setInspFacilityId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
                  >
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Plantilla de Verificación</label>
                  <select
                    value={inspTemplateId}
                    onChange={e => setInspTemplateId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Auditor / Inspector</label>
                  <input
                    type="text"
                    placeholder="Nombre del auditor líder"
                    value={inspInspector}
                    onChange={e => setInspInspector(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Puntaje / Calificación (0 - 100)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={inspScore}
                    onChange={e => setInspScore(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Resumen Ejecutivo</label>
                <textarea
                  rows={2}
                  placeholder="Conclusiones generales del recorrido..."
                  value={inspSummary}
                  onChange={e => setInspSummary(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                ></textarea>
              </div>

              {/* Finding Section */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Formular Hallazgo / Desviación</span>
                  <input
                    type="checkbox"
                    checked={hasFinding}
                    onChange={e => setHasFinding(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300"
                  />
                </div>

                {hasFinding && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Severidad</label>
                        <select
                          value={inspFindingType}
                          onChange={e => setInspFindingType(e.target.value as any)}
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                        >
                          <option value="no_conformidad_mayor">No Conformidad Mayor</option>
                          <option value="no_conformidad_menor">No Conformidad Menor</option>
                          <option value="oportunidad_mejora">Oportunidad de Mejora</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Área Específica</label>
                        <input
                          type="text"
                          placeholder="Ej. Almacén de solventes"
                          value={inspFindingArea}
                          onChange={e => setInspFindingArea(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Descripción del Hallazgo</label>
                      <input
                        type="text"
                        placeholder="Evidencia observada..."
                        value={inspFindingDesc}
                        onChange={e => setInspFindingDesc(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewInspModal(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-sm"
                >
                  Guardar Inspección
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New CAPA Modal */}
      {showNewCapaModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900">Registrar Acción Correctiva (CAPA)</h2>
              <button onClick={() => setShowNewCapaModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCapa} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Título de la Acción *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Corrección de rotulado y contención secundaria"
                  value={capaTitle}
                  onChange={e => setCapaTitle(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Instalación *</label>
                  <select
                    value={capaFacilityId}
                    onChange={e => setCapaFacilityId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-500"
                  >
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha Límite *</label>
                  <input
                    type="date"
                    required
                    value={capaDeadline}
                    onChange={e => setCapaDeadline(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Causa Raíz Identificada (Metodología 5 Porqués)</label>
                <textarea
                  rows={2}
                  placeholder="Por qué ocurrió la desviación..."
                  value={capaRootCause}
                  onChange={e => setCapaRootCause(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500"
                ></textarea>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Acción Propuesta / Plan de Remediación *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Medida correctiva concreta a ejecutar..."
                  value={capaProposedAction}
                  onChange={e => setCapaProposedAction(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500"
                ></textarea>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Responsable de Implementación</label>
                <input
                  type="text"
                  placeholder="Ingeniero o jefe de área responsable"
                  value={capaResponsible}
                  onChange={e => setCapaResponsible(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewCapaModal(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg shadow-sm"
                >
                  Guardar Acción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CAPA Status / Audit Modal */}
      {selectedCapa && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900">Auditoría y Cierre de Acción CAPA</h2>
              <button onClick={() => setSelectedCapa(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Título</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">{selectedCapa.title}</p>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Causa Raíz</span>
                  <p className="text-slate-800">{selectedCapa.rootCause || 'Sin causa especificada'}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Acción Propuesta</span>
                  <p className="text-slate-800">{selectedCapa.proposedAction}</p>
                </div>
                <div className="flex justify-between pt-1 text-[11px]">
                  <span>Responsable: <strong>{selectedCapa.responsible}</strong></span>
                  <span>Plazo: <strong>{selectedCapa.deadline}</strong></span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">
                  Evidencia Documental de Cierre
                </label>
                <input
                  type="text"
                  placeholder="Referencia a informe, acta o número de orden de compra..."
                  value={closureEvidenceInput}
                  onChange={e => setClosureEvidenceInput(e.target.value)}
                  disabled={!canEdit}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg disabled:bg-slate-50"
                />
              </div>

              {canEdit && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Cambiar Estado</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleUpdateCapaStatus(selectedCapa.id, 'cerrada', closureEvidenceInput)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500"
                    >
                      ✓ Cerrar Acción
                    </button>
                    <button
                      onClick={() => handleUpdateCapaStatus(selectedCapa.id, 'en_verificacion')}
                      className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 font-semibold hover:bg-blue-50"
                    >
                      En Verificación
                    </button>
                    <button
                      onClick={() => handleUpdateCapaStatus(selectedCapa.id, 'en_implementacion')}
                      className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 font-semibold hover:bg-amber-50"
                    >
                      En Implementación
                    </button>
                    <button
                      onClick={() => handleUpdateCapaStatus(selectedCapa.id, 'abierta')}
                      className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-semibold hover:bg-rose-50"
                    >
                      Abierta
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-3 flex justify-end">
                <button
                  onClick={() => setSelectedCapa(null)}
                  className="px-4 py-1.5 bg-slate-800 text-white font-semibold rounded-lg text-xs"
                >
                  Cerrar Ventana
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inspection Detail Modal */}
      {selectedInspection && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900">Hallazgos de la Inspección</h2>
              <button onClick={() => setSelectedInspection(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">{selectedInspection.date} • {selectedInspection.inspector}</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">{selectedInspection.title}</p>
                <p className="text-slate-600 mt-1">{selectedInspection.summary}</p>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Hallazgos Registrados</span>
                {selectedInspection.findings && selectedInspection.findings.length > 0 ? (
                  selectedInspection.findings.map((f: any, idx: number) => (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase font-bold text-amber-700">{f.type.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-slate-500 font-semibold">{f.area}</span>
                      </div>
                      <p className="text-xs text-slate-800 font-medium mt-1">{f.description}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 py-3 text-center">No se detectaron no conformidades en esta inspección.</p>
                )}
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  onClick={() => setSelectedInspection(null)}
                  className="px-4 py-1.5 bg-slate-800 text-white font-semibold rounded-lg text-xs"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 5.1 Universal Evidence Panel for Inspections or CAPA */}
      <ModuleEvidencePanel
        key={activeSubTab}
        module={activeSubTab === 'capa' ? 'capa' : 'inspecciones'}
        title={
          activeSubTab === 'capa'
            ? 'Evidencias Fotográficas de Implementación y Cierre CAPA'
            : 'Evidencias Fotográficas de Inspecciones y Hallazgos en Terreno'
        }
        description={
          activeSubTab === 'capa'
            ? 'Fotografías comparativas de subsanación antes/después para verificación documental de cierre.'
            : 'Capturas en campo de recorridos de planta, condiciones operativas y desviaciones identificadas.'
        }
        activeOrgId={activeOrgId}
        userRole={userRole}
        defaultCategory="Inspección en Terreno"
        emptyMessage="No se registran fotografías cargadas en esta sección."
      />
    </div>
  );
};
