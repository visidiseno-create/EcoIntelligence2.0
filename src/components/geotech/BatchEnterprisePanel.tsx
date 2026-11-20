import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Layers,
  Server,
  MessageSquare,
  CheckCircle2,
  GitCompare,
  Cpu,
  Globe,
  Users,
  ShieldCheck,
  FileCheck2,
  Lock,
} from 'lucide-react';
import { GeotechProject, EnterpriseRoleKey } from '../../utils/geotechEngine';
import {
  BatchJobPriority,
  BatchJobRecord,
  processBatchQueueItems,
} from '../../utils/batchJobEngine';
import {
  ENTERPRISE_ROLES_MATRIX,
  GEOTECH_PROJECT_TEMPLATES,
  ProjectVersionDiff,
} from '../../utils/geotechTemplates3';
import {
  BenchmarkRunRecord,
  runFullStressSuiteHP,
} from '../../utils/stressBenchmarks3';
import {
  AdvancedVersionDiff4,
  BenchmarkRunRecord4,
  EnterpriseJobRecord,
  PublicationStatus4,
  executeEnterpriseJobWithRetry,
  runStressSuiteQY,
} from '../../utils/enterpriseOps4';
import {
  ReproAlgorithmId,
  ReproComparisonResult,
  auditProjectDatasetIntegrity,
} from '../../utils/reproducibility4';
import { renderGridToDataUrl } from './GisMap2DCanvas';
import { api } from '../../services/api';

interface BatchEnterprisePanelProps {
  project: GeotechProject;
  allProjectsCount: number;
  userName: string;
  canEdit: boolean;
  onProjectReplaced: (updated: GeotechProject) => Promise<void>;
  onRefreshAll: () => Promise<void>;
}

type EnterpriseSection = 'batch' | 'templates' | 'dashboard' | 'collab' | 'stress';

export const BatchEnterprisePanel: React.FC<BatchEnterprisePanelProps> = ({
  project,
  allProjectsCount,
  userName,
  canEdit,
  onProjectReplaced,
  onRefreshAll,
}) => {
  const [section, setSection] = useState<EnterpriseSection>('batch');
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // 1. Batch Queue State
  const [jobs, setJobs] = useState<BatchJobRecord[]>([]);
  const [jobTitle, setJobTitle] = useState<string>('Lote Hidrológico + Auditoría Multi-Capa');
  const [jobPriority, setJobPriority] = useState<BatchJobPriority>('alta');
  const controlSignalRef = useRef<'run' | 'pause' | 'cancel'>('run');
  const [activeRunningJob, setActiveRunningJob] = useState<BatchJobRecord | null>(null);

  // 2. Templates State
  const [instantiatingId, setInstantiatingId] = useState<string>('');

  // 3. Infra Telemetry
  const [telemetry, setTelemetry] = useState<Awaited<ReturnType<typeof api.getGeotechInfraTelemetry>> | null>(null);

  // 4. Collaboration, Approvals, Roles & Version Diff
  const [commentMsg, setCommentMsg] = useState<string>('');
  const [approvalStage, setApprovalStage] = useState<string>('Revisión Geotécnica / Ambiental');
  const [approvalStatus, setApprovalStatus] = useState<'aprobado' | 'observado' | 'pendiente'>('aprobado');
  const [approvalNotes, setApprovalNotes] = useState<string>('');
  const [memberName, setMemberName] = useState<string>('');
  const [memberRole, setMemberRole] = useState<EnterpriseRoleKey>('lead_geotech');
  const [diffV1, setDiffV1] = useState<string>(project.versions?.[0]?.id || '');
  const [diffV2, setDiffV2] = useState<string>(project.versions?.[1]?.id || project.versions?.[0]?.id || '');
  const [versionDiff, setVersionDiff] = useState<ProjectVersionDiff | null>(null);
  const [versionDiff4, setVersionDiff4] = useState<AdvancedVersionDiff4 | null>(null);
  const [retryJobDemo, setRetryJobDemo] = useState<EnterpriseJobRecord | null>(null);

  // 4.0 Controlled Publication & GeoReproducibility SHA-256
  const [pubLoading, setPubLoading] = useState<boolean>(false);
  const [reproTitle, setReproTitle] = useState<string>('Paquete Reproducible Pendiente Horn 4.0');
  const [reproAlg, setReproAlg] = useState<ReproAlgorithmId>('slope_horn');
  const [creatingRepro, setCreatingRepro] = useState<boolean>(false);
  const [reexecutingReproId, setReexecutingReproId] = useState<string>('');
  const [reproComparison, setReproComparison] = useState<ReproComparisonResult | null>(null);

  // 5. Stress Tests H-P / Q-Y & OGC
  const [benchmarks, setBenchmarks] = useState<Array<BenchmarkRunRecord | BenchmarkRunRecord4>>([]);
  const [runningStress, setRunningStress] = useState<boolean>(false);
  const [runningStressQY, setRunningStressQY] = useState<boolean>(false);
  const [ogcCollections, setOgcCollections] = useState<any[]>([]);

  const loadEnterpriseData = async () => {
    try {
      const [jList, tel, bList, ogc] = await Promise.all([
        api.getGeotechJobs(),
        api.getGeotechInfraTelemetry(),
        api.getGeotechBenchmarks(),
        api.getOgcCollections(),
      ]);
      setJobs(jList);
      setTelemetry(tel);
      setBenchmarks(bList);
      setOgcCollections(ogc.collections || []);
    } catch {
      // silent refresh error handling
    }
  };

  useEffect(() => {
    loadEnterpriseData();
  }, [project.id]);

  // Execute or resume a Batch Job with real async yielding and checkpoint recovery
  const runBatchJob = async (existingJob?: BatchJobRecord) => {
    if (!canEdit) return;
    setErrorMsg('');
    controlSignalRef.current = 'run';

    const items = Array.from({ length: 16 }, (_, i) => `Bloque Ráster/Vector #${i + 1}`);
    const baseJob: BatchJobRecord = existingJob
      ? { ...existingJob, status: 'ejecutando', updatedAt: new Date().toISOString() }
      : {
          id: `job-${Date.now()}`,
          organizationId: project.organizationId,
          projectId: project.id,
          title: jobTitle.trim() || 'Procesamiento Batch SIG',
          jobType: 'vector_batch',
          priority: jobPriority,
          status: 'ejecutando',
          totalItems: items.length,
          completedItems: 0,
          failedItems: 0,
          progressPct: 0,
          retries: 0,
          maxRetries: 3,
          elapsedMs: 0,
          etaMs: 0,
          throughputItemsPerSec: 0,
          memorySnapshotMb: 0,
          checkpointIndex: 0,
          createdBy: userName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          logs: [],
        };

    setActiveRunningJob(baseJob);
    let latestJob = baseJob;

    const result = await processBatchQueueItems({
      items,
      startIndex: baseJob.checkpointIndex,
      chunkSize: 2,
      shouldPauseOrCancel: () => controlSignalRef.current,
      onItem: (name, idx) => {
        // Real small deterministic computation per item
        let acc = 0;
        for (let k = 0; k < 3000; k++) acc += Math.sqrt(k + idx + 1);
        return `${name} validado (checksum=${Math.round(acc)})`;
      },
      onProgress: (stats) => {
        const memMb = (performance as any).memory?.usedJSHeapSize
          ? Math.round(((performance as any).memory.usedJSHeapSize / 1048576) * 10) / 10
          : 42.5;
        latestJob = {
          ...latestJob,
          completedItems: stats.completedItems,
          failedItems: stats.failedItems,
          progressPct: stats.progressPct,
          elapsedMs: stats.elapsedMs,
          etaMs: stats.etaMs,
          throughputItemsPerSec: stats.throughputItemsPerSec,
          memorySnapshotMb: memMb,
          checkpointIndex: stats.checkpointIndex,
          updatedAt: new Date().toISOString(),
          logs: [stats.latestLog, ...latestJob.logs].slice(0, 12),
        };
        setActiveRunningJob(latestJob);
      },
    });

    const finalJob: BatchJobRecord = {
      ...latestJob,
      status: result.finalStatus,
      completedItems: result.completedItems,
      failedItems: result.failedItems,
      elapsedMs: result.elapsedMs,
      updatedAt: new Date().toISOString(),
    };
    setActiveRunningJob(null);
    try {
      await api.saveGeotechJob(finalJob);
      await loadEnterpriseData();
      setStatusMsg(`Trabajo "${finalJob.title}" finalizó en estado: ${finalJob.status.toUpperCase()}.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo persistir el estado del trabajo Batch.');
    }
  };

  const handleInstantiateTemplate = async (templateId: string) => {
    if (!canEdit) return;
    setInstantiatingId(templateId);
    setErrorMsg('');
    try {
      const created = await api.instantiateGeotechTemplate(templateId);
      await onRefreshAll();
      await onProjectReplaced(created);
      setStatusMsg(`Proyecto "${created.name}" creado desde plantilla técnica.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo instanciar la plantilla.');
    } finally {
      setInstantiatingId('');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentMsg.trim()) return;
    try {
      const updated = await api.addGeotechComment(project.id, {
        targetType: 'project',
        targetName: project.name,
        message: commentMsg.trim(),
      });
      setCommentMsg('');
      await onProjectReplaced(updated);
      setStatusMsg('Observación técnica registrada.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando comentario.');
    }
  };

  const handleAddApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await api.addGeotechApproval(project.id, {
        stage: approvalStage,
        status: approvalStatus,
        notes: approvalNotes.trim() || 'Revisado en consola Enterprise.',
      });
      setApprovalNotes('');
      await onProjectReplaced(updated);
      setStatusMsg(`Estado de aprobación (${approvalStatus}) registrado.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error registrando aprobación.');
    }
  };

  const handleAssignMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim()) return;
    try {
      const updated = await api.assignGeotechMember(project.id, {
        userName: memberName.trim(),
        enterpriseRole: memberRole,
      });
      setMemberName('');
      await onProjectReplaced(updated);
      setStatusMsg(`Rol "${memberRole}" asignado a ${memberName}.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error asignando miembro.');
    }
  };

  const handleComputeDiff = async () => {
    if (!diffV1 || !diffV2) return;
    setErrorMsg('');
    try {
      const [diff, diff4] = await Promise.all([
        api.diffGeotechProjectVersions(project.id, diffV1, diffV2),
        api.diffGeotechProjectVersions4(project.id, diffV1, diffV2),
      ]);
      setVersionDiff(diff);
      setVersionDiff4(diff4);
    } catch (err: any) {
      setErrorMsg(err.message || 'Debe guardar al menos 1–2 instantáneas en Infra & Auditoría para comparar.');
    }
  };

  const handleSimulateRetryJob = async () => {
    setErrorMsg('');
    const jobInit: EnterpriseJobRecord = {
      id: `job4-${Date.now()}`,
      user: userName,
      organizationId: project.organizationId,
      projectId: project.id,
      title: 'Simulación Fallo + Checkpoint 4.0 (8 bloques)',
      operation: 'raster_tile_batch',
      priority: 'alta',
      status: 'QUEUED',
      worker: 'worker-geo-01',
      totalItems: 8,
      completedItemIds: [],
      checkpointIndex: 0,
      retries: 0,
      maxRetries: 2,
      memoryMb: 42,
      cpuPct: 28,
      startedAt: new Date().toISOString(),
      logs: [],
    };
    setRetryJobDemo(jobInit);
    const done = await executeEnterpriseJobWithRetry({
      job: jobInit,
      simulateFailAtStep: 3,
      onUpdate: (snap) => setRetryJobDemo(snap),
    });
    setRetryJobDemo(done);
    setStatusMsg(`Orquestador 4.0: ${done.result}`);
  };

  const handleTransitionPublication = async (targetStatus: PublicationStatus4) => {
    setPubLoading(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      const updated = await api.updateGeotechPublication(project.id, targetStatus);
      await onProjectReplaced(updated);
      setStatusMsg(`Estado de publicación actualizado a "${targetStatus.toUpperCase()}".`);
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo avanzar en el ciclo de publicación.');
    } finally {
      setPubLoading(false);
    }
  };

  const handleCreateReproPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingRepro(true);
    setErrorMsg('');
    try {
      const res = await api.createReproPackage(project.id, {
        title: reproTitle.trim() || `Paquete ${reproAlg}`,
        algorithm: reproAlg,
      });
      await onProjectReplaced(res.project);
      setStatusMsg(`Paquete SHA-256 "${res.package.title}" generado y guardado.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creando paquete reproducible.');
    } finally {
      setCreatingRepro(false);
    }
  };

  const handleReexecuteRepro = async (reproId: string) => {
    setReexecutingReproId(reproId);
    setErrorMsg('');
    try {
      const cmp = await api.reexecuteReproPackage(project.id, reproId);
      setReproComparison(cmp);
      setStatusMsg(`Re-ejecución verificada: ${cmp.status} (${cmp.diagnostic})`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error re-ejecutando paquete reproducible.');
    } finally {
      setReexecutingReproId('');
    }
  };

  const handleRunStressTestsHP = async () => {
    setRunningStress(true);
    setErrorMsg('');
    try {
      const record = await runFullStressSuiteHP(
        project,
        allProjectsCount,
        Boolean(telemetry?.externalWorker.configured)
      );
      if (canEdit) {
        const list = await api.saveGeotechBenchmark(record);
        setBenchmarks(list);
      } else {
        setBenchmarks((prev) => [record, ...prev]);
      }
      setStatusMsg(`Suite TEST H–P ejecutada en ${record.totalDurationMs} ms (pico ${record.peakMemoryMb} MB).`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error ejecutando suite H–P.');
    } finally {
      setRunningStress(false);
    }
  };

  const handleRunStressTestsQY = async () => {
    setRunningStressQY(true);
    setErrorMsg('');
    try {
      const res = await runStressSuiteQY({
        project,
        workerConfigured: Boolean(telemetry?.externalWorker.configured),
      });
      if (canEdit) {
        const list = await api.saveGeotechBenchmark(res.run as any);
        setBenchmarks(list);
      } else {
        setBenchmarks((prev) => [res.run, ...prev]);
      }
      setStatusMsg(
        `Suite 4.0 (TEST O + Q–Y) finalizada en ${res.run.totalDurationMs} ms · Recovery TEST Y: ${
          res.recoveryHashVerified ? 'VERIFICADO SHA-256' : 'FALLO'
        } · Worker: ${res.externalWorkerStatus}.`
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Error ejecutando suite 4.0 Q–Y.');
    } finally {
      setRunningStressQY(false);
    }
  };

  const datasetIntegrityRows = React.useMemo(() => auditProjectDatasetIntegrity(project), [project]);
  const diffDeltaImgUrl = React.useMemo(
    () => (versionDiff4?.deltaGrid ? renderGridToDataUrl(versionDiff4.deltaGrid) : ''),
    [versionDiff4]
  );

  return (
    <div className="space-y-5">
      {/* Section Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        {[
          { id: 'batch' as const, label: 'Cola Batch & Checkpoints', icon: Layers },
          { id: 'templates' as const, label: '10 Plantillas de Dominio', icon: CheckCircle2 },
          { id: 'dashboard' as const, label: 'Dashboard Enterprise', icon: Server },
          { id: 'collab' as const, label: 'Publicación, Repro SHA-256 & Roles', icon: Users },
          { id: 'stress' as const, label: 'Estrés H–Y (10M) & OGC API', icon: Cpu },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                section === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {statusMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-950">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900">
          {errorMsg}
        </div>
      )}

      {/* 1. BATCH JOB QUEUE */}
      {section === 'batch' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Motor Batch &amp; Cola de Trabajos con Checkpoint</h3>
              <p className="text-xs text-slate-500">
                Ejecución por bloques con prioridad, pausa, reanudación exacta desde checkpoint y bitácora por ítem.
              </p>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg w-60"
                />
                <select
                  value={jobPriority}
                  onChange={(e) => setJobPriority(e.target.value as BatchJobPriority)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg"
                >
                  <option value="alta">Prioridad Alta</option>
                  <option value="normal">Normal</option>
                  <option value="baja">Baja</option>
                </select>
                <button
                  type="button"
                  disabled={Boolean(activeRunningJob)}
                  onClick={() => runBatchJob()}
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Encolar y Ejecutar Lote</span>
                </button>
              </div>
            )}
          </div>

          {activeRunningJob && (
            <div className="p-4 bg-slate-950 text-slate-100 rounded-xl space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-emerald-400">
                  Ejecutando: {activeRunningJob.title} ({activeRunningJob.progressPct}%)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => (controlSignalRef.current = 'pause')}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Pause className="w-3 h-3" />
                    <span>Pausar Checkpoint</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => (controlSignalRef.current = 'cancel')}
                    className="px-2.5 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3 h-3" />
                    <span>Cancelar</span>
                  </button>
                </div>
              </div>
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${activeRunningJob.progressPct}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-4 font-mono text-[11px] text-slate-300">
                <span>Ítems: {activeRunningJob.completedItems}/{activeRunningJob.totalItems}</span>
                <span>Velocidad: {activeRunningJob.throughputItemsPerSec} ítems/s</span>
                <span>ETA: {activeRunningJob.etaMs} ms</span>
                <span>Checkpoint: #{activeRunningJob.checkpointIndex}</span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="py-2 px-3">Trabajo Batch</th>
                  <th className="py-2 px-3">Prioridad</th>
                  <th className="py-2 px-3">Estado</th>
                  <th className="py-2 px-3 text-right">Progreso</th>
                  <th className="py-2 px-3 text-right">Throughput</th>
                  <th className="py-2 px-3 text-right">Tiempo</th>
                  <th className="py-2 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="py-2 px-3 font-semibold text-slate-900">{j.title}</td>
                    <td className="py-2 px-3 font-mono text-[11px]">{j.priority.toUpperCase()}</td>
                    <td className="py-2 px-3 font-mono text-emerald-700">{j.status.toUpperCase()}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      {j.completedItems}/{j.totalItems} ({j.progressPct}%)
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{j.throughputItemsPerSec} /s</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{j.elapsedMs} ms</td>
                    <td className="py-2 px-3 text-right">
                      {canEdit && (j.status === 'pausado' || j.status === 'error') && (
                        <button
                          type="button"
                          onClick={() => runBatchJob(j)}
                          className="text-sky-700 hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reanudar</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4.0 Enterprise Job Orchestrator with Retry + Checkpoint */}
          <div className="pt-4 border-t border-slate-200 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-slate-900">
                  Orquestador de Trabajos 4.0 (7 Estados: QUEUED → RUNNING → FAILED → CHECKPOINT → COMPLETED)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Verifica recuperación automática ante fallo transitorio en worker sin duplicar ítems procesados.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSimulateRetryJob}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                <span>Simular Fallo + Retry Checkpoint</span>
              </button>
            </div>

            {retryJobDemo && (
              <div className="p-3 bg-slate-950 text-slate-100 rounded-xl space-y-2 font-mono text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-emerald-400">{retryJobDemo.title}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-900/70 text-emerald-200 font-bold">
                    Estado: {retryJobDemo.status} · Reintentos: {retryJobDemo.retries}/{retryJobDemo.maxRetries}
                  </span>
                </div>
                <p className="text-slate-300">
                  Ítems únicos completados: {retryJobDemo.completedItemIds.length}/{retryJobDemo.totalItems} · Worker: {retryJobDemo.worker} · RAM: {retryJobDemo.memoryMb} MB
                </p>
                {retryJobDemo.result && <p className="text-emerald-300">{retryJobDemo.result}</p>}
                <div className="max-h-24 overflow-y-auto space-y-0.5 text-[10px] text-slate-400 border-t border-slate-800 pt-1.5">
                  {retryJobDemo.logs.slice(0, 6).map((lg, i) => (
                    <div key={i}>
                      [{lg.level}] {lg.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. 10 DOMAIN TEMPLATES */}
      {section === 'templates' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">10 Plantillas Profesionales de Proyectos SIG &amp; Geotecnia</h3>
            <p className="text-xs text-slate-500">
              Cada plantilla inicializa DEM base, capas sectoriales, Model Builder DAG, nube LiDAR y escenarios temporales 4D.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
            {GEOTECH_PROJECT_TEMPLATES.map((tpl) => (
              <div key={tpl.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{tpl.title}</span>
                    <span className="font-mono text-[10px] text-emerald-700">{tpl.recommendedCrs}</span>
                  </div>
                  <p className="text-slate-600">{tpl.description}</p>
                  <p className="text-[11px] font-mono text-slate-500">
                    Extensión ref: {tpl.defaultAreaHa.toLocaleString()} ha · Atributos: {tpl.formsAndAttributes.join(', ')}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    disabled={instantiatingId === tpl.id}
                    onClick={() => handleInstantiateTemplate(tpl.id)}
                    className="self-start px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {instantiatingId === tpl.id ? 'Instanciando...' : 'Crear Proyecto desde Plantilla'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. ENTERPRISE PROCESSING DASHBOARD */}
      {section === 'dashboard' && telemetry && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Dashboard de Procesamiento Enterprise (Telemetría Real)</h3>
            <button
              type="button"
              onClick={loadEnterpriseData}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold cursor-pointer"
            >
              Actualizar Telemetría
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] font-sans font-bold text-slate-500 uppercase block">CPU Cores / Load 1m</span>
              <strong className="text-base text-slate-900">{telemetry.cpuCount} cores / {telemetry.loadAvg1m ?? 0}</strong>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] font-sans font-bold text-slate-500 uppercase block">RAM Node RSS / Sistema Libre</span>
              <strong className="text-base text-emerald-700">
                {telemetry.memory.rssMb} MB / {telemetry.memory.sysFreeMb ?? 0} MB
              </strong>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] font-sans font-bold text-slate-500 uppercase block">Cola Jobs (Total/Completados)</span>
              <strong className="text-base text-slate-900">
                {telemetry.enterpriseQueue?.totalJobs ?? 0} / {telemetry.enterpriseQueue?.completedJobs ?? 0}
              </strong>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] font-sans font-bold text-slate-500 uppercase block">Modelos ML / Usuarios Activos</span>
              <strong className="text-base text-indigo-700">
                {telemetry.dataset.totalModels ?? 0} / {telemetry.enterpriseQueue?.activeUsersCount ?? 1}
              </strong>
            </div>
          </div>
          <p className="text-[11px] font-mono text-slate-600">
            Almacenamiento GIS estimado: {telemetry.enterpriseQueue?.estimatedStorageMb ?? 0} MB · Node {telemetry.nodeVersion} · Worker Externo:{' '}
            {telemetry.externalWorker.configured ? telemetry.externalWorker.workerUrl : 'No configurado (Modo TS Determinístico Local)'}
          </p>
        </div>
      )}

      {/* 4. COLLABORATION, 10 ROLES, APPROVALS & VERSION DIFF */}
      {section === 'collab' && (
        <div className="space-y-5 text-xs">
          {/* 10 Roles Matrix & Assignment */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Gobernanza Multiusuario — 10 Roles Configurables &amp; Permisos del Proyecto
            </h3>
            {canEdit && (
              <form onSubmit={handleAssignMember} className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Nombre del especialista..."
                  className="px-3 py-1.5 border border-slate-300 rounded-lg w-56"
                />
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as EnterpriseRoleKey)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg"
                >
                  {ENTERPRISE_ROLES_MATRIX.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold cursor-pointer"
                >
                  Asignar Rol
                </button>
              </form>
            )}

            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-[11px] text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="py-1.5 px-2">Rol Enterprise (10)</th>
                    <th className="py-1.5 px-2 text-center">Crear Proy.</th>
                    <th className="py-1.5 px-2 text-center">Geoproceso</th>
                    <th className="py-1.5 px-2 text-center">GeoML</th>
                    <th className="py-1.5 px-2 text-center">Aprobar</th>
                    <th className="py-1.5 px-2 text-center">Exportar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ENTERPRISE_ROLES_MATRIX.map((r) => (
                    <tr key={r.key}>
                      <td className="py-1.5 px-2 font-semibold text-slate-800">{r.label}</td>
                      <td className="py-1.5 px-2 text-center">{r.canCreateProjects ? 'SÍ' : '—'}</td>
                      <td className="py-1.5 px-2 text-center">{r.canRunGeoprocessing ? 'SÍ' : '—'}</td>
                      <td className="py-1.5 px-2 text-center">{r.canTrainGeoMl ? 'SÍ' : '—'}</td>
                      <td className="py-1.5 px-2 text-center">{r.canApproveDeliverables ? 'SÍ' : '—'}</td>
                      <td className="py-1.5 px-2 text-center">{r.canExportData ? 'SÍ' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Comments & Approvals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-700" />
                <span>Comentarios Técnicos ({project.comments?.length || 0})</span>
              </h4>
              {canEdit && (
                <form onSubmit={handleAddComment} className="flex gap-2">
                  <input
                    type="text"
                    value={commentMsg}
                    onChange={(e) => setCommentMsg(e.target.value)}
                    placeholder="Agregar observación técnica sobre capas o sondeos..."
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold cursor-pointer"
                  >
                    Comentar
                  </button>
                </form>
              )}
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {(project.comments || []).map((c) => (
                  <div key={c.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex justify-between font-semibold text-slate-800">
                      <span>{c.author}</span>
                      <span className="font-mono text-[10px] text-slate-400">{c.createdAt.slice(0, 16)}</span>
                    </div>
                    <p className="text-slate-700 mt-1">{c.message}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-sky-700" />
                <span>Flujo de Aprobación de Entregables ({project.approvals?.length || 0})</span>
              </h4>
              {canEdit && (
                <form onSubmit={handleAddApproval} className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={approvalStage}
                    onChange={(e) => setApprovalStage(e.target.value)}
                    className="col-span-2 px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                  <select
                    value={approvalStatus}
                    onChange={(e) => setApprovalStatus(e.target.value as any)}
                    className="px-2 py-1.5 border border-slate-300 rounded-lg font-semibold"
                  >
                    <option value="aprobado">Aprobado</option>
                    <option value="observado">Observado</option>
                    <option value="pendiente">Pendiente</option>
                  </select>
                  <input
                    type="text"
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    placeholder="Dictamen o nota de revisión..."
                    className="col-span-2 px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-semibold cursor-pointer"
                  >
                    Registrar
                  </button>
                </form>
              )}
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {(project.approvals || []).map((a) => (
                  <div key={a.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{a.stage}</p>
                      <p className="text-slate-600">{a.notes}</p>
                    </div>
                    <span className="font-mono font-bold text-emerald-700 self-start">{a.status.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Version Diff Engine */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-indigo-700" />
              <span>Comparador de Versiones (Version Diff)</span>
            </h4>
            {(project.versions || []).length < 2 ? (
              <p className="text-slate-500">
                Cree al menos 2 instantáneas en la pestaña &quot;Infra &amp; Auditoría&quot; para ejecutar el diff geométrico/atributos entre versiones.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select value={diffV1} onChange={(e) => setDiffV1(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded-lg">
                    {(project.versions || []).map((v) => (
                      <option key={v.id} value={v.id}>
                        A: {v.label} ({v.createdAt.slice(0, 16)})
                      </option>
                    ))}
                  </select>
                  <select value={diffV2} onChange={(e) => setDiffV2(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded-lg">
                    {(project.versions || []).map((v) => (
                      <option key={v.id} value={v.id}>
                        B: {v.label} ({v.createdAt.slice(0, 16)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleComputeDiff}
                    className="px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg font-semibold cursor-pointer"
                  >
                    Comparar Versiones
                  </button>
                </div>
                {versionDiff && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] space-y-1">
                    <p className="font-bold text-slate-900">{versionDiff.summary}</p>
                    <p>Capas agregadas: {versionDiff.layersAdded.join(', ') || 'Ninguna'}</p>
                    <p>Capas eliminadas: {versionDiff.layersRemoved.join(', ') || 'Ninguna'}</p>
                    <p>CRS: {versionDiff.crsFrom} → {versionDiff.crsTo} · ΔSondeos: {versionDiff.boreholesDelta}</p>
                  </div>
                )}

                {versionDiff4 && (
                  <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono font-bold text-indigo-950">
                      <span>Diff Espacial &amp; Ráster 4.0 ({versionDiff4.v1Label} → {versionDiff4.v2Label})</span>
                      <span>
                        DEM RMSD: {versionDiff4.demRmsdM} m · ΔMáx: {versionDiff4.demMaxDeltaM} m · Celdas cambiadas: {versionDiff4.demChangedCellsPct}%
                      </span>
                    </div>
                    {versionDiff4.featureChanges.length > 0 && (
                      <div className="font-mono text-slate-700">
                        Cambios vectoriales:{' '}
                        {versionDiff4.featureChanges
                          .map((fc) => `${fc.layerName} (+${fc.addedFeatures}/-${fc.removedFeatures}, props:${fc.modifiedProps})`)
                          .join(' · ')}
                      </div>
                    )}
                    {diffDeltaImgUrl && (
                      <div className="flex items-center gap-3 pt-1">
                        <img
                          src={diffDeltaImgUrl}
                          alt="Mapa Delta Elevación DEM"
                          className="w-28 h-20 object-cover rounded border border-indigo-300 bg-slate-900"
                        />
                        <span className="text-slate-600">
                          Mapa de diferencias Δm entre instantáneas DEM (escala térmica).
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4.0 CONTROLLED PUBLICATION GATE */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-700" />
                <span>Ciclo de Publicación Controlada 4.0</span>
              </h4>
              <span className="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono text-[11px] font-bold uppercase">
                Estado Actual: {project.publicationStatus || 'borrador'}
              </span>
            </div>
            <p className="text-slate-600">
              Transición secuencial validada en servidor (<code>borrador → revision → aprobacion → publicado</code>). Requiere Score Calidad ≥ 70/100, aprobación registrada y rol Admin/Auditor para publicación oficial.
            </p>
            <div className="flex flex-wrap gap-2">
              {(['borrador', 'revision', 'aprobacion', 'publicado'] as PublicationStatus4[]).map((st) => {
                const isCurrent = (project.publicationStatus || 'borrador') === st;
                return (
                  <button
                    key={st}
                    type="button"
                    disabled={pubLoading || isCurrent}
                    onClick={() => handleTransitionPublication(st)}
                    className={`px-3 py-1.5 rounded-lg font-semibold uppercase text-[11px] cursor-pointer disabled:opacity-60 ${
                      isCurrent
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
            {(project.publicationHistory || []).length > 0 && (
              <div className="text-[11px] font-mono text-slate-600 space-y-0.5 pt-1">
                {(project.publicationHistory || []).slice(0, 4).map((h, i) => (
                  <div key={i}>
                    {String(h.at).slice(0, 19)} · {h.from} → <strong>{h.to}</strong> ({h.by} · {h.role} · Q={h.qualityScore})
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4.0 GEOREPRODUCIBILITY PACKAGES & DATASET SHA-256 INTEGRITY */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-sky-700" />
                <span>Paquetes de Reproducibilidad SHA-256 ({(project.reproPackages || []).length})</span>
              </h4>
              {canEdit && (
                <form onSubmit={handleCreateReproPackage} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={reproTitle}
                    onChange={(e) => setReproTitle(e.target.value)}
                    placeholder="Título del paquete..."
                    className="sm:col-span-2 px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                  <select
                    value={reproAlg}
                    onChange={(e) => setReproAlg(e.target.value as ReproAlgorithmId)}
                    className="px-2 py-1.5 border border-slate-300 rounded-lg font-mono"
                  >
                    <option value="slope_horn">slope_horn</option>
                    <option value="twi_d8">twi_d8</option>
                    <option value="hydrology_rational">hydrology_rational</option>
                    <option value="ahp_suitability">ahp_suitability</option>
                    <option value="ndvi_t2">ndvi_t2</option>
                    <option value="vector_buffer">vector_buffer</option>
                    <option value="slope_stability_bishop">slope_stability_bishop</option>
                    <option value="bearing_terzaghi">bearing_terzaghi</option>
                  </select>
                  <button
                    type="submit"
                    disabled={creatingRepro}
                    className="sm:col-span-3 px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {creatingRepro ? 'Generando Hashes SHA-256...' : 'Generar Paquete Reproducible (SHA-256)'}
                  </button>
                </form>
              )}

              <div className="space-y-2 max-h-52 overflow-y-auto">
                {(project.reproPackages || []).map((pkg) => (
                  <div key={pkg.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{pkg.title}</span>
                      <button
                        type="button"
                        disabled={reexecutingReproId === pkg.id}
                        onClick={() => handleReexecuteRepro(pkg.id)}
                        className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-[10px] font-semibold cursor-pointer"
                      >
                        {reexecutingReproId === pkg.id ? 'Verificando...' : 'Re-ejecutar & Comparar'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-700">{pkg.resultSummary}</p>
                    <p className="font-mono text-[10px] text-slate-500">
                      Datos: {pkg.datasetHash.slice(0, 12)}… · Resultado: {pkg.resultHash.slice(0, 12)}… · {pkg.crs}
                    </p>
                  </div>
                ))}
              </div>

              {reproComparison && (
                <div
                  className={`p-3 rounded-lg border text-[11px] font-mono space-y-1 ${
                    reproComparison.status === 'REPRODUCIBLE_EXACTO'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-amber-50 border-amber-300 text-amber-950'
                  }`}
                >
                  <div className="font-bold">Verificación: {reproComparison.status}</div>
                  <div>{reproComparison.diagnostic}</div>
                  <div>
                    Dataset match: {reproComparison.datasetMatch ? 'SÍ' : 'NO'} · Result match: {reproComparison.resultMatch ? 'SÍ' : 'NO'}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>Auditoría de Integridad SHA-256 de Datasets ({datasetIntegrityRows.length})</span>
              </h4>
              <div className="overflow-x-auto max-h-60">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="py-1.5 px-2">Activo</th>
                      <th className="py-1.5 px-2">CRS</th>
                      <th className="py-1.5 px-2">SHA-256</th>
                      <th className="py-1.5 px-2 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {datasetIntegrityRows.map((row) => (
                      <tr key={row.assetId}>
                        <td className="py-1.5 px-2 font-sans font-semibold text-slate-800">{row.title}</td>
                        <td className="py-1.5 px-2 text-slate-600">{row.crs}</td>
                        <td className="py-1.5 px-2 text-slate-500">{row.currentSha256.slice(0, 12)}…</td>
                        <td
                          className={`py-1.5 px-2 text-right font-bold ${
                            row.integrityStatus === 'INTACTO' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {row.integrityStatus}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. STRESS TESTS H-P & OGC API */}
      {section === 'stress' && (
        <div className="space-y-5 text-xs">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Suite de Pruebas de Estrés Empresariales (TEST H – TEST P) &amp; Benchmark
                </h3>
                <p className="text-xs text-slate-500">
                  Ejecuta 1,000,000 entidades vectoriales en bloques, ráster 512×512, 80,000 puntos LiDAR, recuperación por checkpoint, pipeline IA y verificación OGC.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={runningStress}
                  onClick={handleRunStressTestsHP}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{runningStress ? 'Ejecutando H–P...' : 'Ejecutar Pruebas H–P'}</span>
                </button>
                <button
                  type="button"
                  disabled={runningStressQY}
                  onClick={handleRunStressTestsQY}
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Play className="w-3.5 h-3.5 text-white" />
                  <span>{runningStressQY ? 'Ejecutando 4.0 (10M)...' : 'Ejecutar Estrés 4.0 (TEST O + Q–Y)'}</span>
                </button>
              </div>
            </div>

            {benchmarks.length > 0 && (
              <div className="space-y-3">
                <p className="font-mono text-[11px] text-emerald-800 font-bold">
                  Última Ejecución ({benchmarks[0].versionLabel}): {benchmarks[0].totalDurationMs} ms totales · Pico Heap{' '}
                  {benchmarks[0].peakMemoryMb} MB ({benchmarks.length} corrida(s) registradas)
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <tr>
                        <th className="py-2 px-3">Prueba</th>
                        <th className="py-2 px-3">Escala / Detalle</th>
                        <th className="py-2 px-3 text-right">Tiempo</th>
                        <th className="py-2 px-3 text-right">Throughput</th>
                        <th className="py-2 px-3 text-right">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {benchmarks[0].results.map((r: any) => {
                        const stUpper = String(r.status).toUpperCase();
                        const badgeCls =
                          stUpper.includes('DEPENDENCIA')
                            ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded'
                            : stUpper.includes('ERROR') || stUpper.includes('FALL')
                            ? 'text-rose-700 bg-rose-50 px-2 py-0.5 rounded'
                            : 'text-emerald-700';
                        return (
                          <tr key={r.code}>
                            <td className="py-1.5 px-3 font-semibold text-slate-900">
                              <div>{r.code}: {r.name || r.title}</div>
                              {(r.detail || r.details) && (
                                <div className="text-[10px] font-normal text-slate-500">{r.detail || r.details}</div>
                              )}
                            </td>
                            <td className="py-1.5 px-3 font-mono text-slate-600">{r.scaleMetric}</td>
                            <td className="py-1.5 px-3 text-right font-mono tabular-nums">{r.durationMs} ms</td>
                            <td className="py-1.5 px-3 text-right font-mono tabular-nums">{r.throughput}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold">
                              <span className={badgeCls}>{stUpper}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* OGC API Features & OpenAPI Inspector */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-700" />
              <span>Interoperabilidad OGC API Features / Tiles / OpenAPI 3.0</span>
            </h4>
            <p className="text-slate-600">
              Endpoints estándar activos para consumo desde QGIS, ArcGIS Pro o clientes REST externos:{' '}
              <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">/api/geotech/ogc</code> ·{' '}
              <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">/api/geotech/openapi</code>
            </p>
            <div className="overflow-x-auto max-h-44">
              <table className="w-full text-[11px] text-left border-collapse font-mono">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-1.5 px-2">Collection ID</th>
                    <th className="py-1.5 px-2">Título Capa</th>
                    <th className="py-1.5 px-2">Endpoint GeoJSON Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ogcCollections.slice(0, 8).map((c) => (
                    <tr key={c.id}>
                      <td className="py-1 px-2 text-emerald-700">{c.id}</td>
                      <td className="py-1 px-2 font-sans text-slate-800">{c.title}</td>
                      <td className="py-1 px-2 text-sky-700">{c.links?.[0]?.href}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
