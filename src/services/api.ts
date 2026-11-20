/**
 * API client for ECOINTELLIGENCE full-stack backend
 */
import type {
  CalendarEventItem,
  CalendarEventCategory,
  CalendarEventStatus
} from '../utils/calendar';
import type {
  GeotechProject,
  GisLayer,
  DemGrid,
  BoreholeRecord,
  OperationHistoryEntry,
  PlannedWorkflowStep
} from '../utils/geotechEngine';
import type { BatchJobRecord } from '../utils/batchJobEngine';
import type { ProjectVersionDiff } from '../utils/geotechTemplates3';
import type { BenchmarkRunRecord } from '../utils/stressBenchmarks3';
import type {
  GeoReproPackage,
  ReproAlgorithmId,
  ReproComparisonResult,
} from '../utils/reproducibility4';
import type {
  AdvancedVersionDiff4,
  AiWorkflow4Response,
  ProjectQualityReport4,
  PublicationStatus4,
} from '../utils/enterpriseOps4';
import type {
  EnvironmentalMonitoringStation,
  MonitoringAlertItem,
} from '../utils/reportingAndAtlas4';

export type {
  CalendarEventItem,
  CalendarEventCategory,
  CalendarEventStatus,
  GeotechProject,
  GisLayer,
  DemGrid,
  BoreholeRecord,
  OperationHistoryEntry,
  PlannedWorkflowStep
};

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'auditor' | 'operador' | 'lector';
  organizationId: string;
  facilityIds: string[];
}

export interface Organization {
  id: string;
  name: string;
  taxId: string;
  sector: string;
  country: string;
  plan: 'starter' | 'pro' | 'enterprise';
  createdAt: string;
}

export interface Facility {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  address: string;
  coordinates: { lat: number; lng: number };
  activity: string;
  environmentalPermitCode: string;
  status: 'activa' | 'en_mantenimiento' | 'inactiva';
}

export interface EvidenceImage {
  id: string;
  organizationId: string;
  facilityId?: string;
  module: string;
  entityId?: string;
  title: string;
  description?: string;
  category: string;
  observations?: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  dataUrl: string;
  thumbnailUrl: string;
  uploadedBy: {
    userId: string;
    email: string;
    name: string;
  };
  capturedAt?: string;
  uploadedAt: string;
}

export interface ComplianceDeclarationHistory {
  timestamp: string;
  previousStatus: string | null;
  newStatus: string;
  changedBy: {
    userId: string;
    email: string;
    name: string;
  };
  justification: string;
  evidenceCount: number;
}

export interface ComplianceDeclaration {
  id: string;
  organizationId: string;
  facilityId: string;
  facilityName: string;
  module: 'documentos' | 'residuos' | 'aire' | 'energia' | 'general';
  entityId?: string;
  requirementCode: string;
  requirementTitle: string;
  legalReference: string;
  currentStatus: 'cumple' | 'no_cumple' | 'cumplimiento_parcial' | 'pendiente_verificacion' | 'no_aplica';
  lastEvaluatedAt: string;
  lastEvaluatedBy: {
    userId: string;
    email: string;
    name: string;
  };
  technicalJustification: string;
  attachedEvidenceIds: string[];
  history: ComplianceDeclarationHistory[];
}

export interface ComplianceDashboardData {
  stats: {
    totalRequirements: number;
    evaluatedCount: number;
    cumple: number;
    noCumple: number;
    cumplimientoParcial: number;
    pendienteVerificacion: number;
    noAplica: number;
    compliancePercentage: number;
    actionableDeficiencies: number;
  };
  declarations: ComplianceDeclaration[];
  byModule: Record<string, { total: number; cumple: number; noCumple: number; parcial: number; pendiente: number; noAplica: number }>;
}

class ApiService {
  private activeOrgId: string = 'org-1';
  private currentUserEmail: string = 'admin@ecoinntelligence.com';

  public setContext(orgId: string, userEmail: string) {
    this.activeOrgId = orgId;
    this.currentUserEmail = userEmail;
  }

  public getOrgId(): string {
    return this.activeOrgId;
  }

  public getUserEmail(): string {
    return this.currentUserEmail;
  }

  private toQueryString(params?: Record<string, any>): string {
    if (!params) return '';
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '' && value !== 'all' && value !== 'undefined') {
        clean[key] = String(value);
      }
    }
    const qs = new URLSearchParams(clean).toString();
    return qs ? `?${qs}` : '';
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-organization-id': this.activeOrgId,
      'x-user-email': this.currentUserEmail
    };
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        ...this.headers(),
        ...(options?.headers || {})
      }
    });

    if (!res.ok) {
      let errMsg = `Error ${res.status}: ${res.statusText}`;
      try {
        const data = await res.json();
        if (data?.error) errMsg = data.error;
      } catch {
        errMsg = `Error HTTP ${res.status}: ${res.statusText || 'Respuesta no JSON'}`;
      }
      throw new Error(errMsg);
    }

    return res.json();
  }

  // Auth
  async login(email: string) {
    const res = await this.request<{
      success: boolean;
      user: CurrentUser;
      organization: Organization;
      availableOrganizations: Organization[];
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    this.setContext(res.user.organizationId, res.user.email);
    return res;
  }

  async getMe() {
    return this.request<{
      user: CurrentUser;
      organization: Organization;
      availableOrganizations: Organization[];
    }>('/api/auth/me');
  }

  // Organizations & Facilities
  async getOrganizations() {
    return this.request<Organization[]>('/api/organizations');
  }

  async createOrganization(data: Partial<Organization>) {
    return this.request<Organization>('/api/organizations', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getFacilities() {
    return this.request<Facility[]>('/api/facilities');
  }

  async createFacility(data: Partial<Facility>) {
    return this.request<Facility>('/api/facilities', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Obligations
  async getObligations(params?: { facilityId?: string; status?: string; search?: string }) {
    const query = this.toQueryString(params);
    return this.request<any[]>(`/api/obligations${query}`);
  }

  async createObligation(data: any) {
    return this.request<any>('/api/obligations', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateObligation(id: string, data: any) {
    return this.request<any>(`/api/obligations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteObligation(id: string) {
    return this.request<any>(`/api/obligations/${id}`, {
      method: 'DELETE'
    });
  }

  // Environmental Records
  async getWaste() {
    return this.request<any[]>('/api/waste');
  }

  async createWaste(data: any) {
    return this.request<any>('/api/waste', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async deleteWaste(id: string) {
    return this.request<any>(`/api/waste/${id}`, { method: 'DELETE' });
  }

  async getWater() {
    return this.request<any[]>('/api/water');
  }

  async createWater(data: any) {
    return this.request<any>('/api/water', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async deleteWater(id: string) {
    return this.request<any>(`/api/water/${id}`, { method: 'DELETE' });
  }

  async getAir() {
    return this.request<any[]>('/api/air');
  }

  async createAir(data: any) {
    return this.request<any>('/api/air', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async deleteAir(id: string) {
    return this.request<any>(`/api/air/${id}`, { method: 'DELETE' });
  }

  async getEnergy() {
    return this.request<any[]>('/api/energy');
  }

  async createEnergy(data: any) {
    return this.request<any>('/api/energy', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async deleteEnergy(id: string) {
    return this.request<any>(`/api/energy/${id}`, { method: 'DELETE' });
  }

  // Inspections & CAPA
  async getInspectionTemplates() {
    return this.request<any[]>('/api/inspections/templates');
  }

  async getInspections() {
    return this.request<any[]>('/api/inspections');
  }

  async createInspection(data: any) {
    return this.request<any>('/api/inspections', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getCorrectiveActions() {
    return this.request<any[]>('/api/corrective-actions');
  }

  async createCorrectiveAction(data: any) {
    return this.request<any>('/api/corrective-actions', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateCorrectiveAction(id: string, data: any) {
    return this.request<any>(`/api/corrective-actions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  // Documents
  async getDocuments() {
    return this.request<any[]>('/api/documents');
  }

  async createDocument(data: any) {
    return this.request<any>('/api/documents', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async deleteDocument(id: string) {
    return this.request<any>(`/api/documents/${id}`, { method: 'DELETE' });
  }

  // Dashboard & Analytics
  async getDashboardAnalytics(facilityId?: string) {
    const query = this.toQueryString({ facilityId });
    return this.request<any>(`/api/analytics/dashboard${query}`);
  }

  async downloadReportCsv(module: string = 'general', facilityId?: string) {
    const query = this.toQueryString({ module, facilityId });
    const res = await fetch(`/api/reports/export-csv${query}`, {
      headers: {
        'x-organization-id': this.activeOrgId,
        'x-user-email': this.currentUserEmail
      }
    });
    if (!res.ok) {
      throw new Error(`Error ${res.status} al exportar CSV.`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ecoinntelligence_export_${module}_${this.activeOrgId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Assistant
  async askAssistant(query: string) {
    return this.request<any>('/api/assistant/query', {
      method: 'POST',
      body: JSON.stringify({ query })
    });
  }

  // Audit Logs
  async getAuditLogs() {
    return this.request<any[]>('/api/audit-logs');
  }

  // Subscription
  async getSubscription() {
    return this.request<any>('/api/billing/subscription');
  }

  async changeSubscriptionPlan(planId: string) {
    return this.request<any>('/api/billing/change-plan', {
      method: 'POST',
      body: JSON.stringify({ planId })
    });
  }

  // Reset database to initial seed
  async resetSeed() {
    return this.request<any>('/api/system/reset-seed', {
      method: 'POST'
    });
  }

  // ==========================================
  // SECTION 5.1: Universal Evidences & Photos
  // ==========================================
  async getEvidences(params?: {
    module?: string;
    entityId?: string;
    facilityId?: string;
    category?: string;
    search?: string;
  }) {
    const query = this.toQueryString(params);
    return this.request<EvidenceImage[]>(`/api/evidences${query}`);
  }

  async uploadEvidencesBatch(evidences: Array<{
    facilityId?: string;
    module: string;
    entityId?: string;
    title: string;
    description?: string;
    category?: string;
    observations?: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    dataUrl: string;
    thumbnailUrl?: string;
    capturedAt?: string;
  }>) {
    return this.request<{
      success: boolean;
      createdCount: number;
      evidences: EvidenceImage[];
    }>('/api/evidences/batch', {
      method: 'POST',
      body: JSON.stringify({ evidences })
    });
  }

  async deleteEvidence(id: string) {
    return this.request<{ success: boolean; deletedId: string }>(`/api/evidences/${id}`, {
      method: 'DELETE'
    });
  }

  async getEvidenceStats() {
    return this.request<{
      totalCount: number;
      totalBytes: number;
      totalFormatted: string;
      byModule: Record<string, number>;
    }>('/api/evidences/stats');
  }

  // ===================================================
  // SECTION 5.2 & 5.3: Formal Compliance Declarations
  // ===================================================
  async getComplianceDeclarations(params?: {
    facilityId?: string;
    module?: string;
    status?: string;
    search?: string;
  }) {
    const query = this.toQueryString(params);
    return this.request<ComplianceDeclaration[]>(`/api/compliance-declarations${query}`);
  }

  async createComplianceDeclaration(data: Partial<ComplianceDeclaration>) {
    return this.request<ComplianceDeclaration>('/api/compliance-declarations', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateComplianceDeclaration(id: string, data: {
    status: string;
    justification: string;
    attachedEvidenceIds?: string[];
  }) {
    return this.request<ComplianceDeclaration>(`/api/compliance-declarations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async getComplianceDashboard(params?: { facilityId?: string; module?: string }) {
    const query = this.toQueryString(params);
    return this.request<ComplianceDashboardData>(`/api/compliance-declarations/dashboard${query}`);
  }

  // ===================================================
  // Corporate Calendar & Operational Agenda
  // ===================================================
  async getCalendarEvents(params?: {
    month?: string;
    date?: string;
    category?: string;
    facilityId?: string;
    status?: string;
    search?: string;
  }) {
    const query = this.toQueryString(params);
    return this.request<CalendarEventItem[]>(`/api/calendar-events${query}`);
  }

  async createCalendarEvent(data: Partial<CalendarEventItem>) {
    return this.request<CalendarEventItem>('/api/calendar-events', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateCalendarEvent(id: string, data: Partial<CalendarEventItem>) {
    return this.request<CalendarEventItem>(`/api/calendar-events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteCalendarEvent(id: string) {
    return this.request<{ success: boolean; deletedId: string }>(`/api/calendar-events/${id}`, {
      method: 'DELETE'
    });
  }

  // ===================================================
  // SIG & GEOTECH AI Projects & Agent Core
  // ===================================================
  async getGeotechProjects() {
    return this.request<GeotechProject[]>('/api/geotech/projects');
  }

  async createGeotechProject(data: Partial<GeotechProject>) {
    return this.request<GeotechProject>('/api/geotech/projects', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateGeotechProject(id: string, data: Partial<GeotechProject>) {
    return this.request<GeotechProject>(`/api/geotech/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteGeotechProject(id: string) {
    return this.request<{ success: boolean; deletedId: string }>(`/api/geotech/projects/${id}`, {
      method: 'DELETE'
    });
  }

  async runGeotechAiAgent(payload: {
    prompt: string;
    mode: 'deterministic' | 'gemini';
    agentRole: string;
    projectContext: any;
  }) {
    return this.request<{
      engine: string;
      summary: string;
      steps: PlannedWorkflowStep[];
    }>('/api/geotech/ai-agent', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async searchStacCatalog(payload: {
    bbox: [number, number, number, number];
    collection?: string;
    limit?: number;
    maxCloudCover?: number;
    startDate?: string;
    endDate?: string;
    sensor?: string;
    maxResolutionM?: number;
  }) {
    return this.request<{
      provider: string;
      endpoint: string;
      queryApplied?: Record<string, any>;
      items: Array<{
        id: string;
        collection: string;
        datetime: string;
        cloudCover: number | null;
        platform: string;
        resolutionM?: number | null;
        bbox: [number, number, number, number];
        thumbnailUrl?: string;
        selfUrl?: string;
      }>;
    }>('/api/geotech/stac-search', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getGeotechInfraTelemetry() {
    return this.request<{
      timestamp: string;
      nodeVersion: string;
      platform: string;
      cpuCount: number;
      loadAvg1m?: number;
      uptimeSec: number;
      memory: {
        rssMb: number;
        heapUsedMb: number;
        heapTotalMb: number;
        externalMb: number;
        sysTotalMb?: number;
        sysFreeMb?: number;
      };
      dataset: {
        projectCount: number;
        totalLayers: number;
        totalFeatures: number;
        totalDemCells: number;
        totalLidarPoints: number;
        totalVersions: number;
        totalModels?: number;
      };
      enterpriseQueue?: {
        totalJobs: number;
        runningJobs: number;
        completedJobs: number;
        failedJobs: number;
        stalledJobs?: number;
        activeUsersCount: number;
        estimatedStorageMb: number;
      };
      storage?: {
        diskFreeMb: number | null;
        diskTotalMb: number | null;
      };
      externalWorker: {
        configured: boolean;
        reachable?: boolean;
        connected?: boolean;
        statusLabel?: string;
        checkedAt?: string;
        latencyMs?: number | null;
        error?: string | null;
        workerUrl: string | null;
        blueprintPath: string;
        postgisConfigured?: boolean;
        postgisConnected?: boolean;
        postgisVersion?: string | null;
        engines?: {
          gdal?: string | null;
          proj?: string | null;
          geos?: string | null;
          pdal?: string | null;
          activeWorkerJobs?: number;
        } | null;
      };
      operationalAlerts?: Array<{
        code: string;
        severity: 'CRITICAL' | 'WARNING';
        title: string;
        detail: string;
        metricValue: string;
        threshold: string;
        action: string;
      }>;
    }>('/api/geotech/infra-telemetry');
  }

  async createGeotechProjectVersion(projectId: string, label: string) {
    return this.request<GeotechProject>(`/api/geotech/projects/${projectId}/versions`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
  }

  async restoreGeotechProjectVersion(projectId: string, versionId: string) {
    return this.request<GeotechProject>(`/api/geotech/projects/${projectId}/versions/${versionId}/restore`, {
      method: 'POST',
    });
  }

  async diffGeotechProjectVersions(projectId: string, v1: string, v2: string) {
    return this.request<ProjectVersionDiff>(
      `/api/geotech/projects/${projectId}/versions/diff?v1=${encodeURIComponent(v1)}&v2=${encodeURIComponent(v2)}`
    );
  }

  async runGeotechAiAgentV2(payload: {
    prompt: string;
    mode: 'deterministic' | 'gemini';
    agentRole: string;
    projectContext: any;
  }) {
    return this.request<{
      engine: string;
      summary: string;
      agentsInvolved: string[];
      requiresApproval: boolean;
      approvalReason?: string;
      destructiveActionType?: 'overwrite_dem' | 'delete_layer';
      steps: PlannedWorkflowStep[];
    }>('/api/geotech/ai-agent-v2', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async runGeotechAiAgentV3(payload: {
    prompt: string;
    projectId: string;
    sandboxDryRun?: boolean;
  }) {
    return this.request<{
      engine: string;
      summary: string;
      agentsInvolved: string[];
      requiresApproval: boolean;
      approvalReason?: string;
      steps: PlannedWorkflowStep[];
      autonomousGoalDetected: boolean;
      explainability: {
        objective: string;
        dataUsed: string[];
        toolsUsed: string[];
        parameters: Record<string, any>;
        operationsTrace: Array<{ stepNo: number; agent: string; operation: string; purpose: string }>;
        expectedOutputs: string[];
        limitations: string[];
        safetyControls: {
          maxStepsCap: number;
          timeoutMsCap: number;
          sandboxDryRun: boolean;
          rollbackSnapshotAvailable: boolean;
          requiresApproval: boolean;
        };
        precisionEnvelope: any;
      };
    }>('/api/geotech/ai-agent-v3', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async inspectExternalGdalWorker(format: string, fileName: string) {
    return this.request<{
      ok: boolean;
      workerUrl?: string;
      result?: any;
      error?: string;
    }>('/api/geotech/worker/inspect', {
      method: 'POST',
      body: JSON.stringify({ format, fileName }),
    });
  }

  async getGeoCatalog(params?: { q?: string; assetKind?: string; crs?: string }) {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.assetKind) qs.set('assetKind', params.assetKind);
    if (params?.crs) qs.set('crs', params.crs);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<{ total: number; items: any[] }>(`/api/geotech/catalog${suffix}`);
  }

  async getGeotechJobs() {
    return this.request<BatchJobRecord[]>('/api/geotech/jobs');
  }

  async saveGeotechJob(job: BatchJobRecord) {
    return this.request<BatchJobRecord>('/api/geotech/jobs', {
      method: 'POST',
      body: JSON.stringify(job),
    });
  }

  async instantiateGeotechTemplate(templateId: string, name?: string) {
    return this.request<GeotechProject>(`/api/geotech/templates/${templateId}/instantiate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async addGeotechComment(projectId: string, payload: { targetType: string; targetName: string; message: string }) {
    return this.request<GeotechProject>(`/api/geotech/projects/${projectId}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async addGeotechApproval(projectId: string, payload: { stage: string; status: 'aprobado' | 'observado' | 'pendiente'; notes?: string }) {
    return this.request<GeotechProject>(`/api/geotech/projects/${projectId}/approvals`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async assignGeotechMember(projectId: string, payload: { userName: string; email?: string; enterpriseRole: string }) {
    return this.request<GeotechProject>(`/api/geotech/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getGeotechBenchmarks() {
    return this.request<BenchmarkRunRecord[]>('/api/geotech/benchmarks');
  }

  async saveGeotechBenchmark(record: BenchmarkRunRecord) {
    return this.request<BenchmarkRunRecord[]>('/api/geotech/benchmarks', {
      method: 'POST',
      body: JSON.stringify(record),
    });
  }

  async getOgcCollections() {
    return this.request<{ collections: any[] }>('/api/geotech/ogc/collections');
  }

  // ===================================================
  // SIG & GEOTECH AI 4.0 — ENTERPRISE PRODUCTION
  // ===================================================
  async runExternalWorkerTestO() {
    return this.request<{
      ok: boolean;
      configured?: boolean;
      statusLabel: string;
      workerUrl?: string;
      data?: any;
      error?: string;
    }>('/api/geotech/worker/test-o', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async getGeotechObservability() {
    return this.request<{
      orgId: string;
      totalRequests: number;
      errorCount: number;
      errorRatePct: number;
      avgLatencyMs: number;
      rateLimitConfig: { maxRequests: number; windowMs: number };
      workerConfigured: boolean;
      workerReachable?: boolean;
      postgisConfigured?: boolean;
      postgisConnected?: boolean;
      workerStatusLabel: string;
      storage?: { diskFreeMb: number | null; diskTotalMb: number | null };
      operationalAlerts?: Array<{
        code: string;
        severity: 'CRITICAL' | 'WARNING';
        title: string;
        detail: string;
        metricValue: string;
        threshold: string;
        action: string;
      }>;
      recentTraces: Array<{
        id: string;
        timestamp: string;
        orgId: string;
        user: string;
        method: string;
        endpoint: string;
        status: number;
        durationMs: number;
        traceId: string;
      }>;
    }>('/api/geotech/observability');
  }

  async getGeotechQualityReport(projectId: string) {
    return this.request<ProjectQualityReport4>(`/api/geotech/projects/${projectId}/quality-report`);
  }

  async updateGeotechPublication(projectId: string, targetStatus: PublicationStatus4) {
    return this.request<GeotechProject>(`/api/geotech/projects/${projectId}/publication`, {
      method: 'POST',
      body: JSON.stringify({ targetStatus }),
    });
  }

  async createReproPackage(
    projectId: string,
    payload: { title?: string; algorithm?: ReproAlgorithmId; parameters?: Record<string, any> }
  ) {
    return this.request<{ package: GeoReproPackage; project: GeotechProject }>(
      `/api/geotech/projects/${projectId}/repro-packages`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }

  async reexecuteReproPackage(projectId: string, reproId: string) {
    return this.request<ReproComparisonResult>(
      `/api/geotech/projects/${projectId}/repro-packages/${reproId}/reexecute`,
      { method: 'POST' }
    );
  }

  async getGeotechMonitoring(projectId: string) {
    return this.request<{
      stations: EnvironmentalMonitoringStation[];
      alerts: MonitoringAlertItem[];
    }>(`/api/geotech/projects/${projectId}/monitoring`);
  }

  async addMonitoringMeasurement(
    projectId: string,
    payload: { stationId: string; value: number; campaign?: string; date?: string }
  ) {
    return this.request<{
      stations: EnvironmentalMonitoringStation[];
      alerts: MonitoringAlertItem[];
    }>(`/api/geotech/projects/${projectId}/monitoring/measure`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getGeotechBackups() {
    return this.request<
      Array<{
        id: string;
        organizationId: string;
        projectId: string;
        projectCode: string;
        projectName: string;
        label: string;
        createdAt: string;
        createdBy: string;
        datasetHash: string;
        byteSize: number;
        objectKey: string;
      }>
    >('/api/geotech/backups');
  }

  async createGeotechBackup(projectId: string, label?: string) {
    return this.request<{
      id: string;
      organizationId: string;
      projectId: string;
      projectCode: string;
      projectName: string;
      label: string;
      createdAt: string;
      createdBy: string;
      datasetHash: string;
      byteSize: number;
      objectKey: string;
    }>(`/api/geotech/projects/${projectId}/backup`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
  }

  async restoreGeotechBackup(backupId: string) {
    return this.request<{
      project: GeotechProject;
      hashVerified: boolean;
      datasetHash: string;
    }>(`/api/geotech/backups/${backupId}/restore`, {
      method: 'POST',
    });
  }

  async runServerRecoveryTestY(projectId: string) {
    return this.request<{
      test: string;
      passed: boolean;
      hashBefore: string;
      hashCorrupted: string;
      hashRestored: string;
      reproHashBefore: string;
      reproHashAfter: string;
      objectKey: string;
      byteSize: number;
    }>(`/api/geotech/projects/${projectId}/recovery-test-y`, {
      method: 'POST',
    });
  }

  async runGeotechAiAgentV4(payload: { prompt: string; projectId: string }) {
    return this.request<AiWorkflow4Response>('/api/geotech/ai-agent-v4', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async diffGeotechProjectVersions4(projectId: string, v1: string, v2: string) {
    return this.request<AdvancedVersionDiff4>(
      `/api/geotech/projects/${projectId}/versions/diff4?v1=${encodeURIComponent(v1)}&v2=${encodeURIComponent(v2)}`
    );
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async convertVectorViaWorkerToGeoJson(fileName: string, bytes: Uint8Array, targetCrs: string = 'EPSG:4326') {
    return this.request<{ ok: boolean; traceId: string; featureCollection: GeoJSON.FeatureCollection }>(
      '/api/geotech/worker/vector/convert-to-geojson',
      {
        method: 'POST',
        body: JSON.stringify({
          fileName,
          fileBase64: this.bytesToBase64(bytes),
          targetCrs,
        }),
      }
    );
  }

  async exportVectorViaWorker(
    featureCollection: any,
    targetFormat: 'GPKG' | 'PARQUET' | 'GDB' | 'GML' | 'SHP' | 'GEOJSON',
    targetCrs: string,
    baseName: string
  ): Promise<{ blob: Blob; sha256: string; featureCount: number; fileName: string }> {
    const res = await fetch('/api/geotech/worker/vector/convert', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ featureCollection, targetFormat, targetCrs, baseName }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error || `Error HTTP ${res.status} exportando vía GDAL.`);
    }
    const blob = await res.blob();
    const disp = res.headers.get('content-disposition') || '';
    const match = /filename="([^"]+)"/.exec(disp);
    return {
      blob,
      sha256: res.headers.get('x-artifact-sha256') || '',
      featureCount: Number(res.headers.get('x-feature-count') || 0),
      fileName: match?.[1] || `${baseName}.${targetFormat.toLowerCase()}`,
    };
  }

  async inspectScientificRasterViaWorker(fileName: string, bytes: Uint8Array) {
    return this.request<{ ok: boolean; traceId: string; inspection: any }>(
      '/api/geotech/worker/raster/inspect-scientific',
      {
        method: 'POST',
        body: JSON.stringify({
          fileName,
          fileBase64: this.bytesToBase64(bytes),
        }),
      }
    );
  }

  async inspectLidarViaWorker(fileName: string, bytes: Uint8Array, includePoints: boolean = true) {
    return this.request<{
      ok: boolean;
      traceId: string;
      data: {
        format: string;
        engine: string;
        point_count: number;
        bounds: [number, number, number, number];
        z_range: [number, number];
        crs?: string | null;
        classification_counts: Record<string, number>;
        sha256: string;
        sample_points?: Array<{ x: number; y: number; z: number; classification: number; intensity: number }>;
      };
    }>('/api/geotech/worker/pdal/inspect', {
      method: 'POST',
      body: JSON.stringify({
        fileName,
        fileBase64: this.bytesToBase64(bytes),
        includePoints,
        maxPoints: 15000,
      }),
    });
  }

  async listSystemBackups() {
    return this.request<
      Array<{
        id: string;
        label: string;
        createdAt: string;
        createdBy: string;
        dbSha256: string;
        dbByteSize: number;
        hasPostgisDump: boolean;
        postgisSha256: string | null;
        projectCount: number;
      }>
    >('/api/geotech/system-backups');
  }

  async createSystemBackup(label?: string) {
    return this.request<{
      id: string;
      label: string;
      createdAt: string;
      createdBy: string;
      dbSha256: string;
      dbByteSize: number;
      hasPostgisDump: boolean;
      postgisSha256: string | null;
      projectCount: number;
    }>('/api/geotech/system-backups/create', {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
  }

  async restoreSystemBackup(snapshotId: string) {
    return this.request<{
      success: boolean;
      hashVerified: boolean;
      restoredDbSha256: string;
      postgisRestored: boolean;
      manifest: any;
    }>(`/api/geotech/system-backups/${encodeURIComponent(snapshotId)}/restore`, {
      method: 'POST',
    });
  }
}

export const api = new ApiService();
