export type OperationalAlertSeverity = 'CRITICAL' | 'WARNING';

export type OperationalAlertCode =
  | 'WORKER_DOWN'
  | 'POSTGIS_DOWN'
  | 'HIGH_ERROR_RATE'
  | 'HIGH_MEMORY'
  | 'QUEUE_SATURATED'
  | 'LOW_STORAGE'
  | 'STALLED_JOBS'
  | 'HIGH_LATENCY';

export interface OperationalAlert {
  code: OperationalAlertCode;
  severity: OperationalAlertSeverity;
  title: string;
  detail: string;
  metricValue: string;
  threshold: string;
  action: string;
}

export interface GeoOpsHealthInputs {
  workerConfigured: boolean;
  workerReachable: boolean;
  workerError?: string | null;
  postgisConfigured: boolean;
  postgisConnected: boolean;
  totalRequests: number;
  errorRatePct: number;
  avgLatencyMs: number;
  rssMb: number;
  sysTotalMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  runningJobs: number;
  failedJobs: number;
  stalledJobs: number;
  diskFreeMb: number | null;
  diskTotalMb: number | null;
}

export function sanitizeWorkerUrl(rawUrl?: string | null): string | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function evaluateGeoOpsAlerts(input: GeoOpsHealthInputs): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  if (!input.workerConfigured) {
    alerts.push({
      code: 'WORKER_DOWN',
      severity: 'WARNING',
      title: 'Worker Geoespacial no configurado',
      detail: 'GEOSPATIAL_WORKER_URL no está definida; formatos GDAL/PDAL (.gpkg, .laz, .gdb, .nc, .h5) permanecen no disponibles.',
      metricValue: 'NO CONFIGURADO',
      threshold: 'GEOSPATIAL_WORKER_URL activa',
      action: 'Configurar GEOSPATIAL_WORKER_URL y GEOSPATIAL_WORKER_TOKEN e iniciar el worker FastAPI.',
    });
  } else if (!input.workerReachable) {
    alerts.push({
      code: 'WORKER_DOWN',
      severity: 'CRITICAL',
      title: 'Worker Geoespacial caído o inaccesible',
      detail: input.workerError || 'El microservicio GDAL/PDAL no respondió al healthcheck en vivo.',
      metricValue: 'CAÍDO',
      threshold: 'HTTP 200 /health',
      action: 'Verificar proceso uvicorn/FastAPI en puerto 8081 o reiniciar contenedor gdal-worker.',
    });
  }

  if (input.workerConfigured && input.workerReachable && input.postgisConfigured && !input.postgisConnected) {
    alerts.push({
      code: 'POSTGIS_DOWN',
      severity: 'CRITICAL',
      title: 'Base de datos espacial PostgreSQL/PostGIS caída',
      detail: 'POSTGIS_DSN está configurada en el Worker pero SELECT PostGIS_Version() falló.',
      metricValue: 'DESCONECTADO',
      threshold: 'PostGIS conectado',
      action: 'Ejecutar pg_ctl status / pg_isready y revisar logs de PostgreSQL 18 + PostGIS.',
    });
  }

  if (input.totalRequests >= 5 && input.errorRatePct >= 15) {
    alerts.push({
      code: 'HIGH_ERROR_RATE',
      severity: input.errorRatePct >= 40 ? 'CRITICAL' : 'WARNING',
      title: 'Tasa de errores elevada en GeoAPI',
      detail: `${input.errorRatePct}% de las últimas ${input.totalRequests} solicitudes GeoAPI retornaron HTTP >= 400.`,
      metricValue: `${input.errorRatePct}%`,
      threshold: '< 15%',
      action: 'Inspeccionar Recent Traces por X-Trace-Id y validar cargas/permisos de clientes.',
    });
  }

  const sysMemRatio = input.sysTotalMb > 0 ? input.rssMb / input.sysTotalMb : 0;
  const heapRatio = input.heapTotalMb > 0 ? input.heapUsedMb / input.heapTotalMb : 0;
  if (sysMemRatio >= 0.85 || input.rssMb >= 1536 || (heapRatio >= 0.94 && input.heapTotalMb >= 256)) {
    alerts.push({
      code: 'HIGH_MEMORY',
      severity: sysMemRatio >= 0.92 || input.rssMb >= 2048 ? 'CRITICAL' : 'WARNING',
      title: 'Uso elevado de memoria Node.js',
      detail: `RSS=${input.rssMb} MB (sistema total ${input.sysTotalMb} MB), Heap=${input.heapUsedMb}/${input.heapTotalMb} MB.`,
      metricValue: `${input.rssMb} MB`,
      threshold: '< 1536 MB RSS / < 85% RAM',
      action: 'Invalidar caché ráster LRU, reducir lotes concurrentes o escalar memoria del contenedor.',
    });
  }

  if (input.runningJobs >= 8 || input.failedJobs >= 5) {
    alerts.push({
      code: 'QUEUE_SATURATED',
      severity: input.runningJobs >= 12 ? 'CRITICAL' : 'WARNING',
      title: 'Cola de trabajos Batch saturada o con fallos acumulados',
      detail: `${input.runningJobs} trabajos activos simultáneos y ${input.failedJobs} trabajos con error en cola.`,
      metricValue: `${input.runningJobs} activos / ${input.failedJobs} fallidos`,
      threshold: '< 8 activos',
      action: 'Revisar trabajos en cola, cancelar procesos duplicados o escalar workers.',
    });
  }

  if (input.diskFreeMb !== null && input.diskTotalMb !== null && input.diskTotalMb > 0) {
    const freePct = (input.diskFreeMb / input.diskTotalMb) * 100;
    if (input.diskFreeMb < 512 || freePct < 8) {
      alerts.push({
        code: 'LOW_STORAGE',
        severity: input.diskFreeMb < 128 || freePct < 3 ? 'CRITICAL' : 'WARNING',
        title: 'Almacenamiento libre insuficiente',
        detail: `Quedan ${input.diskFreeMb} MB libres (${freePct.toFixed(1)}% del volumen de datos).`,
        metricValue: `${input.diskFreeMb} MB`,
        threshold: '>= 512 MB y >= 8%',
        action: 'Ejecutar limpieza de artefactos expirados (/api/geotech/worker/cleanup) y revisar retención de backups.',
      });
    }
  }

  if (input.stalledJobs > 0) {
    alerts.push({
      code: 'STALLED_JOBS',
      severity: 'WARNING',
      title: 'Trabajos estancados detectados',
      detail: `${input.stalledJobs} trabajo(s) llevan > 5 minutos en estado RUNNING sin avance de checkpoint.`,
      metricValue: `${input.stalledJobs} estancado(s)`,
      threshold: '0 trabajos > 5 min',
      action: 'Reanudar desde checkpoint (/jobs/:id/resume) o cancelar el trabajo bloqueado.',
    });
  }

  if (input.totalRequests >= 3 && input.avgLatencyMs > 1500) {
    alerts.push({
      code: 'HIGH_LATENCY',
      severity: input.avgLatencyMs > 4000 ? 'CRITICAL' : 'WARNING',
      title: 'Latencia anormal en endpoints GeoAPI',
      detail: `Latencia promedio actual ${input.avgLatencyMs} ms supera el umbral operativo.`,
      metricValue: `${input.avgLatencyMs} ms`,
      threshold: '<= 1500 ms',
      action: 'Revisar índices GiST en PostGIS, carga del Worker C++ o tamaño de geometrías consultadas.',
    });
  }

  return alerts;
}

export function evaluateReadinessState(params: {
  dbWritable: boolean;
  workerConfigured: boolean;
  workerReachable: boolean;
  postgisConfigured: boolean;
  postgisConnected: boolean;
}) {
  const workerOk = !params.workerConfigured || params.workerReachable;
  const postgisOk = !params.workerConfigured || !params.postgisConfigured || params.postgisConnected;
  const ready = params.dbWritable && workerOk && postgisOk;
  return {
    ready,
    status: ready ? 'ready' : 'degraded',
    checks: {
      storageWritable: params.dbWritable,
      workerConfigured: params.workerConfigured,
      workerReachable: params.workerReachable,
      postgisConfigured: params.postgisConfigured,
      postgisConnected: params.postgisConnected,
    },
  };
}
