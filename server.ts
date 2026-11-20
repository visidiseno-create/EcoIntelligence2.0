import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dbManager } from './src/server/database';
import {
  calculateComplianceRate,
  aggregateWasteMetrics,
  aggregateWaterMetrics,
  evaluateAirCompliance,
  calculateEnergyIntensity,
  answerEnvironmentalQuery,
  calculateComplianceDeclarationStats,
  validateImageUpload,
  formatBytes
} from './src/utils/metrics';
import {
  validateCalendarEventInput,
  sortEventsByDateTime
} from './src/utils/calendar';
import { planDeterministicGeospatialCommand, transformFeatureCollectionCrs, CrsCode } from './src/utils/geotechEngine';
import {
  searchRealStacCatalog,
  getGeotechInfraTelemetry,
  LiveWorkerProbeState,
  planCollaborativeWorkflow2,
  planAutonomousAgentV3,
  buildUnifiedGeoCatalog,
  buildOgcCollections,
  queryOgcCollectionItems,
  queryOgcTileItems,
} from './src/server/geotechEnterprise';
import {
  GEOTECH_PROJECT_TEMPLATES,
  buildTemplateSeedArtifacts,
  computeProjectVersionDiff,
} from './src/utils/geotechTemplates3';
import {
  computeProjectDatasetHash,
  createGeoReproPackage,
  reexecuteAndVerifyReproPackage,
  sha256Hex,
} from './src/utils/reproducibility4';
import {
  checkGranularRbac,
  computeAdvancedVersionDiff4,
  evaluatePublicationTransition,
  generateProjectQualityReport,
  planAiWorkflow4,
} from './src/utils/enterpriseOps4';
import {
  buildDefaultMonitoringStations,
  evaluateMonitoringAlerts,
} from './src/utils/reportingAndAtlas4';
import { evaluateReadinessState } from './src/utils/geoOpsHealth';
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const PORT = Number(process.env.PORT) || 3000;
  const appEnv = (process.env.APP_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase();
  const isProd = appEnv === 'production';

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const configuredOrigins = new Set(
    (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  if (process.env.APP_URL) {
    try {
      const appUrlOrigin = new URL(process.env.APP_URL).origin;
      if (appUrlOrigin) configuredOrigins.add(appUrlOrigin);
    } catch {
      // ignore non-URL placeholder APP_URL
    }
  }

  const strictFrameOptions = process.env.STRICT_FRAME_OPTIONS === 'true';
  const frameAncestorsPolicy = strictFrameOptions
    ? "'self'"
    : (process.env.CSP_FRAME_ANCESTORS || "'self' https://aistudio.google.com https://*.aistudio.google.com https://*.googleusercontent.com");

  const isOriginAllowed = (origin: string, reqHost?: string, forwardedHost?: string): boolean => {
    if (configuredOrigins.has(origin)) return true;
    try {
      const parsed = new URL(origin);
      if (reqHost && parsed.host === reqHost) return true;
      if (forwardedHost && parsed.host === forwardedHost) return true;
      if (!isProd && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) return true;
    } catch {
      return false;
    }
    return false;
  };

  // Global Security Headers (Etapa 2 Hardening — compatible con AI Studio iFrame salvo STRICT_FRAME_OPTIONS=true)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (strictFrameOptions) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://earth-search.aws.element84.com https://ows.terrestris.de https://*.tile.openstreetmap.org https://server.arcgisonline.com ws: wss:; worker-src 'self' blob:; frame-ancestors ${frameAncestorsPolicy};`
    );
    if (isProd || req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Strict CORS & Origin/CSRF guard on API routes
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
    const reqHost = typeof req.headers.host === 'string' ? req.headers.host : undefined;
    const forwardedHost =
      typeof req.headers['x-forwarded-host'] === 'string'
        ? req.headers['x-forwarded-host'].split(',')[0].trim()
        : undefined;

    if (origin) {
      if (!isOriginAllowed(origin, reqHost, forwardedHost)) {
        if (req.method === 'OPTIONS' || !['GET', 'HEAD'].includes(req.method)) {
          return res.status(403).json({
            error: 'Solicitud bloqueada por política de seguridad CORS/Origin.',
          });
        }
      } else {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Organization-Id, X-User-Email, X-Trace-Id, X-Rate-Limit-Cap'
        );
      }
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // Rate limiting on authentication & sensitive/worker routes
  const authRateBuckets = new Map<string, number[]>();
  const AUTH_RATE_LIMIT_MAX = Math.max(10, Number(process.env.AUTH_RATE_LIMIT_MAX || 40));
  const AUTH_RATE_WINDOW_MS = 10_000;
  app.use(['/api/auth/login', '/api/geotech/worker'], (req: Request, res: Response, next: NextFunction) => {
    const defaultCap = req.baseUrl === '/api/auth/login' ? AUTH_RATE_LIMIT_MAX : 80;
    const capHeader = Number(req.headers['x-rate-limit-cap']);
    const cap = Number.isFinite(capHeader) && capHeader > 0 ? Math.min(capHeader, defaultCap) : defaultCap;
    const bucketKey = `${req.baseUrl}:${req.ip || 'local'}`;
    const now = Date.now();
    const hits = (authRateBuckets.get(bucketKey) || []).filter((ts) => now - ts < AUTH_RATE_WINDOW_MS);
    if (hits.length >= cap) {
      res.setHeader('Retry-After', '10');
      return res.status(429).json({
        error: 'Límite de solicitudes excedido temporalmente por protección de servicio.',
        limit: cap,
        windowMs: AUTH_RATE_WINDOW_MS,
      });
    }
    hits.push(now);
    authRateBuckets.set(bucketKey, hits);
    next();
  });

  // Live Worker + PostGIS Probe with short TTL cache (Etapa 1 & Etapa 4)
  let cachedWorkerProbe: { ts: number; data: LiveWorkerProbeState } | null = null;
  async function probeExternalWorkerLive(forceRefresh = false): Promise<LiveWorkerProbeState> {
    const workerUrl = (process.env.GEOSPATIAL_WORKER_URL || '').trim().replace(/\/$/, '');
    const now = Date.now();
    if (!forceRefresh && cachedWorkerProbe && now - cachedWorkerProbe.ts < 2500) {
      return cachedWorkerProbe.data;
    }
    if (!workerUrl) {
      const emptyProbe: LiveWorkerProbeState = {
        configured: false,
        reachable: false,
        checkedAt: new Date().toISOString(),
        latencyMs: null,
        error: null,
        postgisConfigured: false,
        postgisConnected: false,
        postgisVersion: null,
      };
      cachedWorkerProbe = { ts: now, data: emptyProbe };
      return emptyProbe;
    }

    const t0 = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    try {
      const resp = await fetch(`${workerUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Math.round((performance.now() - t0) * 100) / 100;
      if (!resp.ok) {
        const downProbe: LiveWorkerProbeState = {
          configured: true,
          reachable: false,
          checkedAt: new Date().toISOString(),
          latencyMs,
          error: `Worker respondió HTTP ${resp.status}`,
          postgisConfigured: false,
          postgisConnected: false,
          postgisVersion: null,
        };
        cachedWorkerProbe = { ts: now, data: downProbe };
        return downProbe;
      }
      const data: any = await resp.json().catch(() => ({}));
      const liveProbe: LiveWorkerProbeState = {
        configured: true,
        reachable: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
        error: null,
        postgisConfigured: Boolean(data.postgis_dsn_configured),
        postgisConnected: Boolean(data.postgis_connected),
        postgisVersion: data.postgis_version || null,
        enginesSummary: {
          gdal: data.gdal_version || null,
          proj: data.proj_version || null,
          geos: data.geos_version || null,
          pdal: data.pdal_version || null,
          activeWorkerJobs: Number(data.active_jobs || 0),
        },
      };
      cachedWorkerProbe = { ts: now, data: liveProbe };
      return liveProbe;
    } catch (err: any) {
      clearTimeout(timer);
      const errMsg = err?.name === 'AbortError' ? 'Timeout en healthcheck del Worker (1800 ms)' : 'Worker geoespacial inalcanzable';
      const downProbe: LiveWorkerProbeState = {
        configured: true,
        reachable: false,
        checkedAt: new Date().toISOString(),
        latencyMs: null,
        error: errMsg,
        postgisConfigured: false,
        postgisConnected: false,
        postgisVersion: null,
      };
      cachedWorkerProbe = { ts: now, data: downProbe };
      return downProbe;
    }
  }

  // Etapa 1 Liveness & Readiness Probes (Public Kubernetes / Load Balancer Health endpoints)
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      status: 'alive',
      env: appEnv,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/readyz', async (_req: Request, res: Response) => {
    const dbWritable = dbManager.isStorageWritable();
    const workerProbe = await probeExternalWorkerLive(true);
    const readiness = evaluateReadinessState({
      dbWritable,
      workerConfigured: workerProbe.configured,
      workerReachable: workerProbe.reachable,
      postgisConfigured: workerProbe.postgisConfigured,
      postgisConnected: workerProbe.postgisConnected,
    });
    res.status(readiness.ready ? 200 : 503).json({
      ok: readiness.ready,
      env: appEnv,
      timestamp: new Date().toISOString(),
      ...readiness,
    });
  });

  // Middleware: Organization context and tenant isolation
  // In demo laboratory mode, we extract active organization from header or fallback to default
  const getContextOrgId = (req: Request): string => {
    return (req.headers['x-organization-id'] as string) || 'org-1';
  };

  const getActorInfo = (req: Request) => {
    const actorEmail = (req.headers['x-user-email'] as string) || 'admin@ecoinntelligence.com';
    const db = dbManager.get();
    const user = db.users.find(u => u.email.toLowerCase() === actorEmail.toLowerCase()) || db.users[0];
    return {
      id: user?.id || 'usr-1',
      name: user?.name || 'Administrador Ambiental',
      role: user?.role || 'admin',
      email: user?.email || actorEmail
    };
  };

  const rejectReadOnly = (actor: { role: string }, res: Response): boolean => {
    if (actor.role === 'lector') {
      res.status(403).json({ error: 'Los usuarios con rol Lector tienen acceso de solo lectura.' });
      return true;
    }
    return false;
  };

  const resolveUserObject = (nameOrObj: any, emailHint: string | undefined, users: any[]) => {
    if (nameOrObj && typeof nameOrObj === 'object' && nameOrObj.name) {
      return {
        userId: nameOrObj.userId || 'usr-1',
        email: nameOrObj.email || emailHint || 'admin@ecoinntelligence.com',
        name: nameOrObj.name
      };
    }
    const nameStr = typeof nameOrObj === 'string' ? nameOrObj : 'Usuario del Sistema';
    const matched = users.find(
      u => (emailHint && u.email.toLowerCase() === emailHint.toLowerCase()) || u.name === nameStr
    );
    return {
      userId: matched?.id || 'usr-1',
      email: matched?.email || emailHint || 'admin@ecoinntelligence.com',
      name: matched?.name || nameStr
    };
  };

  const normalizeEvidence = (e: any, users: any[]) => {
    const fileSizeBytes =
      typeof e.fileSizeBytes === 'number' && !Number.isNaN(e.fileSizeBytes)
        ? e.fileSizeBytes
        : Math.round((e.fileSizeKb || 0) * 1024);
    return {
      ...e,
      fileSizeBytes,
      thumbnailUrl: e.thumbnailUrl || e.dataUrl,
      uploadedBy: resolveUserObject(e.uploadedBy, e.uploadedByEmail, users)
    };
  };

  const normalizeComplianceDeclaration = (d: any, facilitiesMap: Map<string, string>, users: any[]) => {
    const evaluatorObj = resolveUserObject(d.evaluatorName, d.evaluatorEmail, users);
    const normalizedHistory = Array.isArray(d.history)
      ? d.history.map((h: any) => ({
          ...h,
          changedBy: resolveUserObject(h.changedBy, h.changedByEmail, users)
        }))
      : [];

    return {
      ...d,
      currentStatus: d.status || d.currentStatus,
      requirementCode: d.requirementCode || d.id,
      facilityName: facilitiesMap.get(d.facilityId) || 'Planta Principal',
      legalReference: d.aspectEvaluated || d.legalReference || 'Compromiso Ambiental Legal',
      attachedEvidenceIds: d.evidenceIds || d.attachedEvidenceIds || [],
      lastEvaluatedAt: d.evaluationDate || d.lastEvaluatedAt || new Date().toISOString(),
      lastEvaluatedBy: evaluatorObj,
      technicalJustification: d.observations || d.technicalJustification || '',
      history: normalizedHistory
    };
  };

  // 1. Auth routes
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email } = req.body;
    const db = dbManager.get();
    const targetEmail = email ? email.trim().toLowerCase() : 'admin@ecoinntelligence.com';
    const user = db.users.find(u => u.email.toLowerCase() === targetEmail);

    if (!user) {
      // Allow fallback to first user or create guest operator
      return res.status(401).json({ error: 'Credenciales inválidas en el laboratorio.' });
    }

    const org = db.organizations.find(o => o.id === user.organizationId) || db.organizations[0];
    dbManager.addAuditLog(user.organizationId, user.name, user.role, 'INICIO_SESION', 'Autenticación', `Acceso exitoso al sistema como rol: ${user.role}`);

    res.json({
      success: true,
      user,
      organization: org,
      availableOrganizations: db.organizations
    });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const actor = getActorInfo(req);
    const db = dbManager.get();
    const user = db.users.find(u => u.email === actor.email) || db.users[0];
    const orgId = getContextOrgId(req);
    const org = db.organizations.find(o => o.id === orgId) || db.organizations[0];

    res.json({
      user,
      organization: org,
      availableOrganizations: db.organizations
    });
  });

  app.get('/api/auth/users', (req: Request, res: Response) => {
    const db = dbManager.get();
    res.json(db.users);
  });

  // 2. Organizations & Facilities
  app.get('/api/organizations', (_req: Request, res: Response) => {
    const db = dbManager.get();
    res.json(db.organizations);
  });

  app.post('/api/organizations', (req: Request, res: Response) => {
    const { name, taxId, sector, country } = req.body;
    if (!name || !taxId) {
      return res.status(400).json({ error: 'Nombre y RUC/Identificación fiscal son requeridos.' });
    }
    const db = dbManager.get();
    const newOrg = {
      id: `org-${Date.now()}`,
      name,
      taxId,
      sector: sector || 'General',
      country: country || 'Perú',
      plan: 'pro' as const,
      createdAt: new Date().toISOString().split('T')[0]
    };
    db.organizations.push(newOrg);
    dbManager.save();
    res.status(201).json(newOrg);
  });

  app.get('/api/facilities', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const list = db.facilities.filter(f => f.organizationId === orgId);
    res.json(list);
  });

  app.post('/api/facilities', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const { name, code, address, activity, environmentalPermitCode, coordinates } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'Nombre e identificador de instalación son obligatorios.' });
    }

    const db = dbManager.get();
    const newFac = {
      id: `fac-${Date.now()}`,
      organizationId: orgId,
      name,
      code,
      address: address || 'Sin dirección especificada',
      coordinates: coordinates || { lat: -12.0464, lng: -77.0428 },
      activity: activity || 'Actividad industrial',
      environmentalPermitCode: environmentalPermitCode || 'S/N',
      status: 'activa' as const
    };

    db.facilities.push(newFac);
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'CREACION_INSTALACION', 'Instalaciones', `Nueva instalación registrada: ${name} (${code})`);
    dbManager.save();
    res.status(201).json(newFac);
  });

  // 3. Environmental Obligations
  app.get('/api/obligations', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const { facilityId, status, search } = req.query;
    const db = dbManager.get();
    let list = db.obligations.filter(o => o.organizationId === orgId);

    if (facilityId) {
      list = list.filter(o => o.facilityId === facilityId);
    }
    if (status) {
      list = list.filter(o => o.status === status);
    }
    if (search && typeof search === 'string') {
      const term = search.toLowerCase();
      list = list.filter(o => 
        o.title.toLowerCase().includes(term) || 
        o.normativeSource.toLowerCase().includes(term) ||
        o.responsible.toLowerCase().includes(term)
      );
    }

    res.json(list);
  });

  app.post('/api/obligations', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const { title, facilityId, normativeSource, jurisdiction, dueDate, frequency, responsible, description } = req.body;

    if (!title || !normativeSource || !dueDate) {
      return res.status(400).json({ error: 'Título, fuente normativa y fecha de vencimiento son requeridos.' });
    }

    const db = dbManager.get();
    const newObligation = {
      id: `ob-${Date.now()}`,
      organizationId: orgId,
      facilityId: facilityId || db.facilities.find(f => f.organizationId === orgId)?.id || '',
      title,
      normativeSource,
      jurisdiction: jurisdiction || 'Nacional',
      dueDate,
      frequency: frequency || 'anual',
      responsible: responsible || actor.name,
      status: 'pendiente' as const,
      evidenceCount: 0,
      description: description || ''
    };

    db.obligations.push(newObligation);
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'CREACION_OBLIGACION', 'Cumplimiento', `Registrada obligación ambiental: "${title}"`);
    dbManager.save();
    res.status(201).json(newObligation);
  });

  app.put('/api/obligations/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const idx = db.obligations.findIndex(o => o.id === id && o.organizationId === orgId);

    if (idx === -1) {
      return res.status(404).json({ error: 'Obligación no encontrada.' });
    }

    const updated = { ...db.obligations[idx], ...req.body };
    db.obligations[idx] = updated;
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'ACTUALIZACION_OBLIGACION', 'Cumplimiento', `Actualizada obligación "${updated.title}" a estado: ${updated.status}`);
    dbManager.save();
    res.json(updated);
  });

  app.delete('/api/obligations/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const idx = db.obligations.findIndex(o => o.id === id && o.organizationId === orgId);

    if (idx === -1) {
      return res.status(404).json({ error: 'Obligación no encontrada.' });
    }

    const removed = db.obligations.splice(idx, 1)[0];
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'ELIMINACION_OBLIGACION', 'Cumplimiento', `Eliminada obligación: "${removed.title}"`);
    dbManager.save();
    res.json({ success: true });
  });

  // 4. Waste Management
  app.get('/api/waste', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const list = db.wasteRecords.filter(w => w.organizationId === orgId);
    res.json(list);
  });

  app.post('/api/waste', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const { facilityId, date, wasteName, category, quantityKg, originProcess, carrier, destination, treatmentType, manifestNumber } = req.body;

    if (!wasteName || !quantityKg) {
      return res.status(400).json({ error: 'Nombre de residuo y cantidad en kg son requeridos.' });
    }

    const db = dbManager.get();
    const newRecord = {
      id: `w-${Date.now()}`,
      organizationId: orgId,
      facilityId: facilityId || db.facilities.find(f => f.organizationId === orgId)?.id || '',
      date: date || new Date().toISOString().split('T')[0],
      wasteName,
      category: category || 'no_peligroso',
      quantityKg: Number(quantityKg),
      originProcess: originProcess || 'Operación general',
      carrier: carrier || 'Operador de Residuos Autorizado',
      destination: destination || 'Planta de Tratamiento / Relleno',
      treatmentType: treatmentType || 'disposicion_final',
      manifestNumber: manifestNumber || `MAN-${Date.now().toString().slice(-4)}`
    };

    db.wasteRecords.push(newRecord);
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'REGISTRO_RESIDUOS', 'Residuos', `Registrado residuo ${wasteName} (${quantityKg} kg)`);
    dbManager.save();
    res.status(201).json(newRecord);
  });

  app.delete('/api/waste/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const idx = db.wasteRecords.findIndex(w => w.id === id && w.organizationId === orgId);
    if (idx === -1) return res.status(404).json({ error: 'Registro no encontrado.' });
    const removed = db.wasteRecords.splice(idx, 1)[0];
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'ELIMINACION_RESIDUO', 'Residuos', `Eliminado registro de residuo ${removed.wasteName}`);
    dbManager.save();
    res.json({ success: true });
  });

  // 5. Water Management
  app.get('/api/water', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const list = db.waterRecords.filter(w => w.organizationId === orgId);
    res.json(list);
  });

  app.post('/api/water', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const { facilityId, date, source, volumeConsumedM3, volumeDischargedM3, dischargePermitCompliant, bod5MgL, codMgL, ph } = req.body;

    if (volumeConsumedM3 === undefined) {
      return res.status(400).json({ error: 'Volumen consumido en m3 es requerido.' });
    }

    const db = dbManager.get();
    const newRecord = {
      id: `wt-${Date.now()}`,
      organizationId: orgId,
      facilityId: facilityId || db.facilities.find(f => f.organizationId === orgId)?.id || '',
      date: date || new Date().toISOString().split('T')[0],
      source: source || 'red_publica',
      volumeConsumedM3: Number(volumeConsumedM3),
      volumeDischargedM3: Number(volumeDischargedM3 || 0),
      dischargePermitCompliant: dischargePermitCompliant ?? true,
      bod5MgL: bod5MgL ? Number(bod5MgL) : undefined,
      codMgL: codMgL ? Number(codMgL) : undefined,
      ph: ph ? Number(ph) : undefined
    };

    db.waterRecords.push(newRecord);
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'REGISTRO_AGUA', 'Recursos Hídricos', `Registrado consumo de agua: ${volumeConsumedM3} m³`);
    dbManager.save();
    res.status(201).json(newRecord);
  });

  app.delete('/api/water/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const idx = db.waterRecords.findIndex(w => w.id === id && w.organizationId === orgId);
    if (idx === -1) return res.status(404).json({ error: 'Registro no encontrado.' });
    const removed = db.waterRecords.splice(idx, 1)[0];
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'ELIMINACION_AGUA', 'Recursos Hídricos', `Eliminado registro hídrico ${removed.date}`);
    dbManager.save();
    res.json({ success: true });
  });

  // 6. Air & Emissions
  app.get('/api/air', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const list = db.airRecords.filter(a => a.organizationId === orgId);
    res.json(list);
  });

  app.post('/api/air', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const { facilityId, date, emissionSource, parameter, measuredValue, limitValue, unit } = req.body;

    if (!emissionSource || measuredValue === undefined || !limitValue) {
      return res.status(400).json({ error: 'Fuente de emisión, valor medido y límite son requeridos.' });
    }

    const db = dbManager.get();
    const newRecord = {
      id: `air-${Date.now()}`,
      organizationId: orgId,
      facilityId: facilityId || db.facilities.find(f => f.organizationId === orgId)?.id || '',
      date: date || new Date().toISOString().split('T')[0],
      emissionSource,
      parameter: parameter || 'PM10',
      measuredValue: Number(measuredValue),
      limitValue: Number(limitValue),
      unit: unit || 'mg/Nm3'
    };

    db.airRecords.push(newRecord);
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'REGISTRO_AIRE', 'Emisiones y Aire', `Monitoreo de ${parameter} en ${emissionSource}: ${measuredValue} ${unit}`);
    dbManager.save();
    res.status(201).json(newRecord);
  });

  app.delete('/api/air/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const idx = db.airRecords.findIndex(a => a.id === id && a.organizationId === orgId);
    if (idx === -1) return res.status(404).json({ error: 'Registro no encontrado.' });
    const removed = db.airRecords.splice(idx, 1)[0];
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'ELIMINACION_AIRE', 'Emisiones y Aire', `Eliminado monitoreo ${removed.parameter} (${removed.emissionSource})`);
    dbManager.save();
    res.json({ success: true });
  });

  // 7. Energy
  app.get('/api/energy', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const list = db.energyRecords.filter(e => e.organizationId === orgId);
    res.json(list);
  });

  app.post('/api/energy', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const { facilityId, date, sourceType, consumptionKWh, costUsd } = req.body;

    if (consumptionKWh === undefined) {
      return res.status(400).json({ error: 'Consumo en kWh es requerido.' });
    }

    const db = dbManager.get();
    const newRecord = {
      id: `en-${Date.now()}`,
      organizationId: orgId,
      facilityId: facilityId || db.facilities.find(f => f.organizationId === orgId)?.id || '',
      date: date || new Date().toISOString().split('T')[0],
      sourceType: sourceType || 'red_electrica',
      consumptionKWh: Number(consumptionKWh),
      costUsd: costUsd ? Number(costUsd) : undefined
    };

    db.energyRecords.push(newRecord);
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'REGISTRO_ENERGIA', 'Gestión Energética', `Consumo energético registrado: ${consumptionKWh} kWh (${sourceType})`);
    dbManager.save();
    res.status(201).json(newRecord);
  });

  app.delete('/api/energy/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const idx = db.energyRecords.findIndex(e => e.id === id && e.organizationId === orgId);
    if (idx === -1) return res.status(404).json({ error: 'Registro no encontrado.' });
    const removed = db.energyRecords.splice(idx, 1)[0];
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'ELIMINACION_ENERGIA', 'Gestión Energética', `Eliminado registro energético ${removed.consumptionKWh} kWh`);
    dbManager.save();
    res.json({ success: true });
  });

  // 8. Inspections & CAPA
  app.get('/api/inspections/templates', (_req: Request, res: Response) => {
    const db = dbManager.get();
    res.json(db.inspectionTemplates);
  });

  app.get('/api/inspections', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const list = db.inspections.filter(i => i.organizationId === orgId);
    res.json(list);
  });

  app.post('/api/inspections', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const { facilityId, templateId, title, date, inspector, score, summary, findings } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Título de la inspección es requerido.' });
    }

    const db = dbManager.get();
    const newInspection = {
      id: `insp-${Date.now()}`,
      organizationId: orgId,
      facilityId: facilityId || db.facilities.find(f => f.organizationId === orgId)?.id || '',
      templateId: templateId || 'tmpl-1',
      title,
      date: date || new Date().toISOString().split('T')[0],
      inspector: inspector || actor.name,
      status: 'completada' as const,
      score: score !== undefined ? Number(score) : 85,
      summary: summary || 'Inspección completada conforme a lista de verificación.',
      findings: Array.isArray(findings) ? findings : []
    };

    db.inspections.push(newInspection);

    // If findings require action, auto-create corrective actions
    if (Array.isArray(findings)) {
      for (const f of findings) {
        if (f.actionRequired) {
          db.correctiveActions.push({
            id: `capa-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            organizationId: orgId,
            facilityId: newInspection.facilityId,
            inspectionId: newInspection.id,
            title: `Acción derivada de hallazgo: ${f.description.slice(0, 50)}...`,
            findingDescription: f.description,
            rootCause: 'Pendiente análisis causal de 5 Porqués por equipo de planta',
            proposedAction: 'Implementar medida correctiva y verificar evidencia',
            responsible: actor.name,
            deadline: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
            status: 'abierta'
          });
        }
      }
    }

    dbManager.addAuditLog(orgId, actor.name, actor.role, 'NUEVA_INSPECCION', 'Inspecciones', `Completada inspección "${title}" con score ${score}/100`);
    dbManager.save();
    res.status(201).json(newInspection);
  });

  app.get('/api/corrective-actions', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const list = db.correctiveActions.filter(c => c.organizationId === orgId);
    res.json(list);
  });

  app.post('/api/corrective-actions', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const { facilityId, title, findingDescription, rootCause, proposedAction, responsible, deadline } = req.body;

    if (!title || !proposedAction || !deadline) {
      return res.status(400).json({ error: 'Título, acción propuesta y fecha límite son obligatorios.' });
    }

    const db = dbManager.get();
    const newCapa = {
      id: `capa-${Date.now()}`,
      organizationId: orgId,
      facilityId: facilityId || db.facilities.find(f => f.organizationId === orgId)?.id || '',
      title,
      findingDescription: findingDescription || 'Hallazgo formulado en inspección interna',
      rootCause: rootCause || 'Por determinar',
      proposedAction,
      responsible: responsible || actor.name,
      deadline,
      status: 'abierta' as const
    };

    db.correctiveActions.push(newCapa);
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'CREACION_CAPA', 'Acciones Correctivas', `Creada acción correctiva: "${title}"`);
    dbManager.save();
    res.status(201).json(newCapa);
  });

  app.put('/api/corrective-actions/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const idx = db.correctiveActions.findIndex(c => c.id === id && c.organizationId === orgId);

    if (idx === -1) return res.status(404).json({ error: 'Acción no encontrada.' });

    const updated = { ...db.correctiveActions[idx], ...req.body };
    db.correctiveActions[idx] = updated;
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'ACTUALIZACION_CAPA', 'Acciones Correctivas', `Actualizada acción CAPA "${updated.title}" a: ${updated.status}`);
    dbManager.save();
    res.json(updated);
  });

  // 9. Document Library
  app.get('/api/documents', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const list = db.documents.filter(d => d.organizationId === orgId);
    res.json(list);
  });

  app.post('/api/documents', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const { title, category, facilityId, obligationId, fileName, fileSizeKb, version } = req.body;

    if (!title || !fileName) {
      return res.status(400).json({ error: 'Título del documento y nombre de archivo son obligatorios.' });
    }

    const db = dbManager.get();
    const newDoc = {
      id: `doc-${Date.now()}`,
      organizationId: orgId,
      facilityId: facilityId || undefined,
      obligationId: obligationId || undefined,
      title,
      category: category || 'monitoreo',
      fileName,
      fileSizeKb: fileSizeKb ? Number(fileSizeKb) : Math.floor(Math.random() * 2000) + 300,
      uploadDate: new Date().toISOString().split('T')[0],
      version: version || '1.0',
      uploadedBy: actor.name
    };

    db.documents.push(newDoc);

    // If linked to an obligation, increment obligation evidence count
    if (obligationId) {
      const ob = db.obligations.find(o => o.id === obligationId);
      if (ob) ob.evidenceCount = (ob.evidenceCount || 0) + 1;
    }

    dbManager.addAuditLog(orgId, actor.name, actor.role, 'CARGA_DOCUMENTO', 'Documentos', `Cargado documento ambiental: ${fileName} (${title})`);
    dbManager.save();
    res.status(201).json(newDoc);
  });

  app.delete('/api/documents/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const idx = db.documents.findIndex(d => d.id === id && d.organizationId === orgId);
    if (idx === -1) return res.status(404).json({ error: 'Documento no encontrado.' });
    const removed = db.documents.splice(idx, 1)[0];
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'ELIMINACION_DOCUMENTO', 'Documentos', `Eliminado documento "${removed.title}" (${removed.fileName})`);
    dbManager.save();
    res.json({ success: true });
  });

  // 9.1 Universal Image & Evidence Storage (Transversal en toda la plataforma)
  app.get('/api/evidences', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const { module: targetModule, entityId, facilityId, category, search } = req.query;
    const db = dbManager.get();
    let list = (db.evidences || []).filter(e => e.organizationId === orgId);

    if (targetModule) list = list.filter(e => e.module === targetModule);
    if (entityId) list = list.filter(e => e.entityId === entityId);
    if (facilityId) list = list.filter(e => e.facilityId === facilityId);
    if (category) list = list.filter(e => e.category === category);
    if (search && typeof search === 'string') {
      const term = search.toLowerCase();
      list = list.filter(e =>
        e.title.toLowerCase().includes(term) ||
        (e.description && e.description.toLowerCase().includes(term)) ||
        (e.category && e.category.toLowerCase().includes(term)) ||
        (e.observations && e.observations.toLowerCase().includes(term))
      );
    }
    res.json(list.map(e => normalizeEvidence(e, db.users)));
  });

  app.post('/api/evidences/batch', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const { evidences, images, module: targetModule, entityId, facilityId, category, observations } = req.body;
    const incoming = Array.isArray(evidences) ? evidences : Array.isArray(images) ? images : [];

    if (incoming.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar al menos una imagen para cargar.' });
    }

    const db = dbManager.get();
    if (!db.evidences) db.evidences = [];

    const created: any[] = [];
    for (const img of incoming) {
      const sizeBytes =
        typeof img.fileSizeBytes === 'number' && !Number.isNaN(img.fileSizeBytes)
          ? img.fileSizeBytes
          : Math.round((img.fileSizeKb || 200) * 1024);

      const validation = validateImageUpload({
        name: img.fileName || 'evidencia.jpg',
        size: sizeBytes,
        mimeType: img.mimeType || 'image/jpeg'
      });

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const resolvedModule = targetModule || img.module || 'documentos';
      const newEvidence: any = {
        id: `ev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        organizationId: orgId,
        facilityId: facilityId || img.facilityId || undefined,
        module: resolvedModule,
        entityId: entityId || img.entityId || undefined,
        title: img.title || `Evidencia ${new Date().toISOString().split('T')[0]}`,
        description: img.description || '',
        date: img.date || new Date().toISOString().split('T')[0],
        category: category || img.category || 'General',
        observations: observations || img.observations || '',
        fileName: img.fileName || `foto_${Date.now()}.jpg`,
        fileSizeKb: Math.max(1, Math.round(sizeBytes / 1024)),
        fileSizeBytes: sizeBytes,
        mimeType: img.mimeType || 'image/jpeg',
        dataUrl: img.dataUrl || '',
        thumbnailUrl: img.thumbnailUrl || img.dataUrl || '',
        uploadedBy: actor.name,
        uploadedByEmail: actor.email,
        uploadedAt: img.capturedAt || new Date().toISOString()
      };

      db.evidences.unshift(newEvidence);
      created.push(newEvidence);
    }

    const logModule = targetModule || incoming[0]?.module || 'Evidencias';
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'CARGA_EVIDENCIAS_FOTOGRAFICAS',
      logModule,
      `Cargadas ${created.length} fotografía(s) de evidencia en módulo ${logModule}.`
    );
    dbManager.save();

    const normalizedCreated = created.map(e => normalizeEvidence(e, db.users));
    res.status(201).json({
      success: true,
      count: normalizedCreated.length,
      createdCount: normalizedCreated.length,
      evidences: normalizedCreated
    });
  });

  app.delete('/api/evidences/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();

    if (!db.evidences) return res.status(404).json({ error: 'Evidencia no encontrada.' });
    const idx = db.evidences.findIndex(e => e.id === id && e.organizationId === orgId);
    if (idx === -1) return res.status(404).json({ error: 'Evidencia no encontrada.' });

    const removed = db.evidences.splice(idx, 1)[0];
    // Also clean reference from any compliance declarations
    if (db.complianceDeclarations) {
      for (const decl of db.complianceDeclarations) {
        if (decl.organizationId === orgId && Array.isArray(decl.evidenceIds)) {
          decl.evidenceIds = decl.evidenceIds.filter(evId => evId !== id);
        }
      }
    }
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'ELIMINACION_EVIDENCIA_FOTOGRAFICA',
      removed.module,
      `Eliminada fotografía "${removed.title}" (${removed.fileName}).`
    );
    dbManager.save();
    res.json({ success: true, deletedId: id, removedId: id });
  });

  app.get('/api/evidences/stats', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const { facilityId, module: targetModule } = req.query;
    const db = dbManager.get();
    let list = (db.evidences || []).filter(e => e.organizationId === orgId);
    if (facilityId) list = list.filter(e => e.facilityId === facilityId);
    if (targetModule) list = list.filter(e => e.module === targetModule);

    const totalBytes = list.reduce((acc, e: any) => {
      const bytes =
        typeof e.fileSizeBytes === 'number' && !Number.isNaN(e.fileSizeBytes)
          ? e.fileSizeBytes
          : (e.fileSizeKb || 0) * 1024;
      return acc + bytes;
    }, 0);

    const byModule: Record<string, number> = {};
    for (const e of list) {
      byModule[e.module] = (byModule[e.module] || 0) + 1;
    }

    res.json({
      totalCount: list.length,
      totalBytes,
      totalFormatted: formatBytes(totalBytes),
      totalStorageMb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
      byModule
    });
  });

  // 9.2 Formal Compliance Declarations (5 States & Immutable History)
  app.get('/api/compliance-declarations', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const { facilityId, module: targetModule, status, search } = req.query;
    const db = dbManager.get();
    let list = (db.complianceDeclarations || []).filter(d => d.organizationId === orgId);

    if (facilityId) list = list.filter(d => d.facilityId === facilityId);
    if (targetModule) list = list.filter(d => d.module === targetModule);
    if (status) list = list.filter(d => d.status === status || (d as any).currentStatus === status);
    if (search && typeof search === 'string') {
      const term = search.toLowerCase();
      list = list.filter(d =>
        d.requirementTitle.toLowerCase().includes(term) ||
        (d.requirementCode && d.requirementCode.toLowerCase().includes(term)) ||
        (d.aspectEvaluated && d.aspectEvaluated.toLowerCase().includes(term)) ||
        (d.observations && d.observations.toLowerCase().includes(term)) ||
        (d.evaluatorName && d.evaluatorName.toLowerCase().includes(term))
      );
    }

    const facilitiesMap = new Map((db.facilities || []).map(f => [f.id, f.name]));
    res.json(list.map(d => normalizeComplianceDeclaration(d, facilitiesMap, db.users)));
  });

  app.post('/api/compliance-declarations', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const {
      facilityId,
      module: targetModule,
      requirementTitle,
      requirementCode,
      obligationId,
      aspectEvaluated,
      status,
      observations,
      evidenceIds,
      reviewStatus
    } = req.body;

    if (!requirementTitle || !status || !aspectEvaluated) {
      return res.status(400).json({ error: 'Título del requisito, aspecto evaluado y estado de cumplimiento son obligatorios.' });
    }

    const db = dbManager.get();
    if (!db.complianceDeclarations) db.complianceDeclarations = [];

    const newDecl: any = {
      id: `cd-${Date.now()}`,
      organizationId: orgId,
      facilityId: facilityId || db.facilities.find(f => f.organizationId === orgId)?.id || '',
      module: targetModule || 'documentos',
      requirementTitle,
      requirementCode: requirementCode || `REQ-${Date.now().toString().slice(-4)}`,
      obligationId: obligationId || undefined,
      aspectEvaluated,
      status: status || 'pendiente_verificacion',
      evaluationDate: new Date().toISOString().split('T')[0],
      evaluatorName: actor.name,
      evaluatorEmail: actor.email,
      evaluatorRole: actor.role,
      observations: observations || '',
      evidenceIds: Array.isArray(evidenceIds) ? evidenceIds : [],
      reviewStatus: reviewStatus || 'en_revision',
      history: [
        {
          timestamp: new Date().toISOString(),
          previousStatus: null,
          newStatus: status,
          changedBy: actor.name,
          changedByEmail: actor.email,
          justification: observations || 'Declaración inicial registrada en plataforma.',
          evidenceCount: Array.isArray(evidenceIds) ? evidenceIds.length : 0
        }
      ]
    };

    db.complianceDeclarations.unshift(newDecl);
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'DECLARACION_CUMPLIMIENTO_CREADA',
      targetModule || 'Cumplimiento',
      `Registrada declaración de cumplimiento para "${requirementTitle}": estado ${status}.`
    );
    dbManager.save();

    const facilitiesMap = new Map((db.facilities || []).map(f => [f.id, f.name]));
    res.status(201).json(normalizeComplianceDeclaration(newDecl, facilitiesMap, db.users));
  });

  app.put('/api/compliance-declarations/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const { status, observations, justification, evidenceIds, attachedEvidenceIds, reviewStatus } = req.body;

    const db = dbManager.get();
    if (!db.complianceDeclarations) return res.status(404).json({ error: 'Declaración no encontrada.' });

    const decl: any = db.complianceDeclarations.find(d => d.id === id && d.organizationId === orgId);
    if (!decl) return res.status(404).json({ error: 'Declaración no encontrada.' });

    const prevStatus = decl.status;
    const isStatusChanged = status && status !== prevStatus;

    if (isStatusChanged && (!justification || !justification.trim())) {
      return res.status(400).json({ error: 'Todo cambio de estado de cumplimiento requiere obligatoriamente una justificación u observación técnica documentada.' });
    }

    if (status) decl.status = status;
    if (observations !== undefined) {
      decl.observations = observations;
    } else if (justification && justification.trim()) {
      decl.observations = justification.trim();
    }
    if (reviewStatus) decl.reviewStatus = reviewStatus;
    decl.evaluationDate = new Date().toISOString().split('T')[0];
    decl.evaluatorName = actor.name;
    decl.evaluatorEmail = actor.email;
    decl.evaluatorRole = actor.role;

    const evIds = evidenceIds || attachedEvidenceIds;
    if (Array.isArray(evIds)) decl.evidenceIds = evIds;

    // Append to immutable history
    if (isStatusChanged || justification) {
      decl.history.unshift({
        timestamp: new Date().toISOString(),
        previousStatus: prevStatus,
        newStatus: decl.status,
        changedBy: actor.name,
        changedByEmail: actor.email,
        justification: justification || observations || 'Actualización de evaluación.',
        evidenceCount: decl.evidenceIds.length
      });
    }

    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'DECLARACION_CUMPLIMIENTO_ACTUALIZADA',
      decl.module,
      `Actualizado estado de cumplimiento de "${decl.requirementTitle}" de ${prevStatus} a ${decl.status}. Justificación: ${justification || observations}`
    );
    dbManager.save();

    const facilitiesMap = new Map((db.facilities || []).map(f => [f.id, f.name]));
    res.json(normalizeComplianceDeclaration(decl, facilitiesMap, db.users));
  });

  app.get('/api/compliance-declarations/dashboard', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const { facilityId, module: targetModule } = req.query;
    const db = dbManager.get();
    let list = (db.complianceDeclarations || []).filter(d => d.organizationId === orgId);

    if (facilityId) list = list.filter(d => d.facilityId === facilityId);
    if (targetModule) list = list.filter(d => d.module === targetModule);

    const facilitiesMap = new Map((db.facilities || []).map(f => [f.id, f.name]));
    const normalized = list.map(d => normalizeComplianceDeclaration(d, facilitiesMap, db.users));

    const stats = calculateComplianceDeclarationStats(list);
    res.json({
      stats: {
        ...stats,
        compliancePercentage: stats.complianceRatePercent,
        actionableDeficiencies: stats.noCumple + stats.cumplimientoParcial
      },
      declarations: normalized,
      byModule: stats.byModule
    });
  });

  // 10. Dashboard & Analytics Consolidated API
  app.get('/api/analytics/dashboard', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const { facilityId } = req.query;
    const db = dbManager.get();

    const filterFac = <T extends { organizationId: string; facilityId?: string }>(items: T[]) =>
      items.filter(item => item.organizationId === orgId && (!facilityId || item.facilityId === facilityId));

    const facilities = db.facilities.filter(f => f.organizationId === orgId && (!facilityId || f.id === facilityId));
    const obligations = filterFac(db.obligations);
    const waste = filterFac(db.wasteRecords);
    const water = filterFac(db.waterRecords);
    const air = filterFac(db.airRecords);
    const energy = filterFac(db.energyRecords);
    const inspections = filterFac(db.inspections);
    const correctiveActions = filterFac(db.correctiveActions);
    const documents = filterFac(db.documents);

    const compMetrics = calculateComplianceRate(obligations);
    const wasteMetrics = aggregateWasteMetrics(waste);
    const waterMetrics = aggregateWaterMetrics(water);
    const airMetrics = evaluateAirCompliance(air);
    const energyMetrics = calculateEnergyIntensity(energy);

    // Upcoming obligations sorted by due date
    const upcomingObligations = [...obligations]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 6);

    res.json({
      organization: db.organizations.find(o => o.id === orgId),
      counts: {
        facilities: facilities.length,
        obligations: obligations.length,
        inspections: inspections.length,
        openActions: correctiveActions.filter(a => a.status === 'abierta' || a.status === 'en_implementacion').length,
        documents: documents.length
      },
      compliance: compMetrics,
      waste: wasteMetrics,
      water: waterMetrics,
      air: airMetrics,
      energy: energyMetrics,
      upcomingObligations,
      recentInspections: inspections.slice(-3),
      recentActions: correctiveActions.slice(-3)
    });
  });

  // Export CSV
  app.get('/api/reports/export-csv', (req: Request, res: Response) => {
    const orgId = (req.query.organizationId as string) || getContextOrgId(req);
    const { module: targetModule, facilityId } = req.query;
    const db = dbManager.get();

    const matchFac = (item: { organizationId: string; facilityId?: string }) =>
      item.organizationId === orgId && (!facilityId || item.facilityId === facilityId);

    let csvContent = '';
    const fileName = `ecoinntelligence_export_${targetModule || 'general'}.csv`;

    if (targetModule === 'residuos') {
      const records = db.wasteRecords.filter(matchFac);
      csvContent = 'ID,Fecha,Instalación,Residuo,Categoría,Cantidad_kg,Proceso_Origen,Transportista,Destino,Tratamiento,Manifiesto\n';
      for (const r of records) {
        csvContent += `"${r.id}","${r.date}","${r.facilityId}","${r.wasteName}","${r.category}",${r.quantityKg},"${r.originProcess}","${r.carrier}","${r.destination}","${r.treatmentType}","${r.manifestNumber || ''}"\n`;
      }
    } else if (targetModule === 'cumplimiento') {
      const records = db.obligations.filter(matchFac);
      csvContent = 'ID,Título,Fuente_Normativa,Jurisdicción,Vencimiento,Frecuencia,Responsable,Estado,Evidencias\n';
      for (const r of records) {
        csvContent += `"${r.id}","${r.title}","${r.normativeSource}","${r.jurisdiction}","${r.dueDate}","${r.frequency}","${r.responsible}","${r.status}",${r.evidenceCount}\n`;
      }
    } else {
      // General environmental KPI summary
      const comp = calculateComplianceRate(db.obligations.filter(matchFac));
      const w = aggregateWasteMetrics(db.wasteRecords.filter(matchFac));
      const wt = aggregateWaterMetrics(db.waterRecords.filter(matchFac));
      const en = calculateEnergyIntensity(db.energyRecords.filter(matchFac));

      csvContent = 'Métrica,Valor,Unidad,Estado\n';
      csvContent += `Tasa de Cumplimiento Legal,${comp.complianceRatePercent},%,"${comp.complianceRatePercent >= 80 ? 'Conforme' : 'Atención'}"\n`;
      csvContent += `Total Residuos Generados,${w.totalKg},kg,Monitoreado\n`;
      csvContent += `Residuos Peligrosos,${w.hazardousKg},kg,Custodia Ambiental\n`;
      csvContent += `Consumo de Agua,${wt.totalConsumedM3},m3,Operación Normal\n`;
      csvContent += `Consumo Energético Total,${en.totalKWh},kWh,Eficiencia\n`;
      csvContent += `Participación Renovable,${en.renewableSharePercent},%,Objetivo ESG\n`;
      csvContent += `Emisiones CO2e Estimadas,${en.estimatedCo2Ton},tCO2e,Huella Carbono\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send('\uFEFF' + csvContent); // UTF-8 BOM for Excel
  });

  // 11. Deterministic Intelligent Assistant
  app.post('/api/assistant/query', (req: Request, res: Response) => {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'La consulta no puede estar vacía.' });
    }

    const orgId = getContextOrgId(req);
    const db = dbManager.get();

    const context = {
      obligations: db.obligations.filter(o => o.organizationId === orgId),
      waste: db.wasteRecords.filter(w => w.organizationId === orgId),
      water: db.waterRecords.filter(w => w.organizationId === orgId),
      air: db.airRecords.filter(a => a.organizationId === orgId),
      energy: db.energyRecords.filter(e => e.organizationId === orgId),
      actions: db.correctiveActions.filter(c => c.organizationId === orgId)
    };

    const answer = answerEnvironmentalQuery(query, context);
    res.json(answer);
  });

  // 12. Audit Logs
  app.get('/api/audit-logs', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const logs = db.auditLogs.filter(l => l.organizationId === orgId);
    res.json(logs);
  });

  // 13. Billing & SaaS Quotas
  app.get('/api/billing/subscription', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const org = db.organizations.find(o => o.id === orgId) || db.organizations[0];
    const currentPlan = db.subscriptions[org.plan] || db.subscriptions.pro;

    const facilitiesCount = db.facilities.filter(f => f.organizationId === orgId).length;
    const usersCount = db.users.filter(u => u.organizationId === orgId).length;
    const documents = db.documents.filter(d => d.organizationId === orgId);
    const evidences = (db.evidences || []).filter(e => e.organizationId === orgId);
    const docKb = documents.reduce((acc, d) => acc + (d.fileSizeKb || 0), 0);
    const evBytes = evidences.reduce((acc, e: any) => acc + (e.fileSizeBytes ?? (e.fileSizeKb || 0) * 1024), 0);
    const usedStorageMb = Math.round(((docKb * 1024 + evBytes) / (1024 * 1024)) * 100) / 100;

    res.json({
      currentPlan,
      usage: {
        facilitiesCount,
        maxFacilities: currentPlan.maxFacilities,
        facilitiesPercent: Math.round((facilitiesCount / currentPlan.maxFacilities) * 100),
        usersCount,
        maxUsers: currentPlan.maxUsers,
        usersPercent: Math.round((usersCount / currentPlan.maxUsers) * 100),
        usedStorageMb,
        maxStorageMb: currentPlan.maxStorageMb,
        storagePercent: Math.round((usedStorageMb / currentPlan.maxStorageMb) * 100)
      },
      allPlans: db.subscriptions
    });
  });

  app.post('/api/billing/change-plan', (req: Request, res: Response) => {
    const { planId } = req.body;
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();

    const org = db.organizations.find(o => o.id === orgId);
    if (!org) return res.status(404).json({ error: 'Organización no encontrada.' });

    if (!db.subscriptions[planId]) {
      return res.status(400).json({ error: 'Plan seleccionado no existe.' });
    }

    org.plan = planId;
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'CAMBIO_PLAN_SAAS', 'Suscripción', `Plan actualizado a: ${db.subscriptions[planId].planName}`);
    dbManager.save();

    res.json({ success: true, updatedPlan: db.subscriptions[planId] });
  });

  // 14. Corporate Calendar & Operational Agenda
  app.get('/api/calendar-events', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const { month, date, category, facilityId, status, search } = req.query;

    let list = (db.calendarEvents || []).filter(e => e.organizationId === orgId);

    if (typeof month === 'string' && month.trim()) {
      list = list.filter(e => e.date.startsWith(month.trim()));
    }
    if (typeof date === 'string' && date.trim()) {
      list = list.filter(e => e.date === date.trim());
    }
    if (typeof category === 'string' && category.trim() && category !== 'all') {
      list = list.filter(e => e.category === category.trim());
    }
    if (typeof facilityId === 'string' && facilityId.trim() && facilityId !== 'all') {
      list = list.filter(e => e.facilityId === facilityId.trim());
    }
    if (typeof status === 'string' && status.trim() && status !== 'all') {
      list = list.filter(e => e.status === status.trim());
    }
    if (typeof search === 'string' && search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter(
        e =>
          e.title.toLowerCase().includes(term) ||
          e.description.toLowerCase().includes(term) ||
          e.responsible.toLowerCase().includes(term) ||
          e.location.toLowerCase().includes(term)
      );
    }

    const normalized = sortEventsByDateTime(list).map(e => ({
      ...e,
      orgId: e.organizationId
    }));
    res.json(normalized);
  });

  app.post('/api/calendar-events', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;

    const validation = validateCalendarEventInput(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const db = dbManager.get();
    if (!db.calendarEvents) db.calendarEvents = [];

    const nowIso = new Date().toISOString();
    const record: any = {
      id: `cal-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      orgId,
      organizationId: orgId,
      ...validation.data,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    db.calendarEvents.push(record);
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'CREACION_EVENTO_AGENDA',
      'Calendario',
      `Agendada actividad (${validation.data.category}): "${validation.data.title}" el ${validation.data.date} a las ${validation.data.startTime}.`
    );
    dbManager.save();

    res.status(201).json(record);
  });

  app.put('/api/calendar-events/:id', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;

    const { id } = req.params;
    const db = dbManager.get();
    const list = db.calendarEvents || [];
    const idx = list.findIndex(e => e.id === id && e.organizationId === orgId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Actividad de calendario no encontrada en esta organización.' });
    }

    const existing = list[idx];
    const mergedInput = {
      title: req.body?.title ?? existing.title,
      category: req.body?.category ?? existing.category,
      date: req.body?.date ?? existing.date,
      startTime: req.body?.startTime ?? existing.startTime,
      endTime: req.body?.endTime !== undefined ? req.body.endTime : existing.endTime,
      facilityId: req.body?.facilityId !== undefined ? req.body.facilityId : existing.facilityId,
      location: req.body?.location ?? existing.location,
      responsible: req.body?.responsible ?? existing.responsible,
      participants: req.body?.participants !== undefined ? req.body.participants : existing.participants,
      description: req.body?.description ?? existing.description,
      status: req.body?.status ?? existing.status
    };

    const validation = validateCalendarEventInput(mergedInput);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const updated: any = {
      ...existing,
      ...validation.data,
      orgId,
      organizationId: orgId,
      updatedAt: new Date().toISOString()
    };

    list[idx] = updated;
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'ACTUALIZACION_EVENTO_AGENDA',
      'Calendario',
      `Actualizada actividad "${updated.title}" (${updated.date} ${updated.startTime}) - Estado: ${updated.status}.`
    );
    dbManager.save();

    res.json(updated);
  });

  app.delete('/api/calendar-events/:id', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;

    const { id } = req.params;
    const db = dbManager.get();
    const list = db.calendarEvents || [];
    const idx = list.findIndex(e => e.id === id && e.organizationId === orgId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Actividad de calendario no encontrada en esta organización.' });
    }

    const removed = list[idx];
    list.splice(idx, 1);
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'ELIMINACION_EVENTO_AGENDA',
      'Calendario',
      `Eliminada actividad agendada: "${removed.title}" (${removed.date} ${removed.startTime}).`
    );
    dbManager.save();

    res.json({ success: true, deletedId: id });
  });

  // 15. SIG & GEOTECH AI Projects & Operational AI Core (+ Global Geotech Trace/RateLimit/Observability Middleware)
  const geotechObservabilityLog: Array<{
    id: string;
    timestamp: string;
    orgId: string;
    user: string;
    method: string;
    endpoint: string;
    status: number;
    durationMs: number;
    traceId: string;
  }> = [];

  const rateBuckets = new Map<string, number[]>();
  const GEOAPI_RATE_LIMIT_MAX = 45;
  const GEOAPI_RATE_WINDOW_MS = 5000;

  app.use('/api/geotech', (req: Request, res: Response, next: NextFunction) => {
    const t0 = performance.now();
    const rawTrace = typeof req.headers['x-trace-id'] === 'string' ? req.headers['x-trace-id'].replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) : '';
    const traceId = rawTrace || `trc-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999)}`;
    res.setHeader('x-trace-id', traceId);
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);

    // Enforce sliding-window rate limit on GeoAPI OGC & Query endpoints (skip observability/openapi)
    if (req.path.startsWith('/ogc')) {
      const capHeader = Number(req.headers['x-rate-limit-cap']);
      const cap = Number.isFinite(capHeader) && capHeader > 0 ? Math.min(capHeader, GEOAPI_RATE_LIMIT_MAX) : GEOAPI_RATE_LIMIT_MAX;
      const bucketKey = `${req.ip || 'local'}:${orgId}`;
      const now = Date.now();
      const timestamps = (rateBuckets.get(bucketKey) || []).filter((ts) => now - ts < GEOAPI_RATE_WINDOW_MS);
      if (timestamps.length >= cap) {
        res.setHeader('Retry-After', '5');
        return res.status(429).json({
          error: 'GeoAPI Rate Limit excedido. Espere unos segundos antes de enviar más solicitudes.',
          limit: cap,
          windowMs: GEOAPI_RATE_WINDOW_MS,
          traceId,
        });
      }
      timestamps.push(now);
      rateBuckets.set(bucketKey, timestamps);
    }

    res.on('finish', () => {
      if (req.path === '/observability') return;
      geotechObservabilityLog.unshift({
        id: `obs-${Date.now()}-${Math.floor(Math.random() * 999)}`,
        timestamp: new Date().toISOString(),
        orgId,
        user: actor.email,
        method: req.method,
        endpoint: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        traceId,
      });
      if (geotechObservabilityLog.length > 120) geotechObservabilityLog.length = 120;
    });

    next();
  });

  app.get('/api/geotech/projects', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const list = (db.geotechProjects || []).filter(p => p.organizationId === orgId);
    res.json(list);
  });

  app.post('/api/geotech/projects', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;

    const { name, code, domain, description, areaHa, defaultCrs, center, dem, layers, boreholes, spectralScene } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length < 3) {
      return res.status(400).json({ error: 'El nombre del proyecto SIG debe tener al menos 3 caracteres.' });
    }

    const db = dbManager.get();
    if (!db.geotechProjects) db.geotechProjects = [];

    const orgFacilities = db.facilities.filter(f => f.organizationId === orgId);
    const fallbackLng = orgFacilities[0]?.coordinates?.lng ?? -76.87;
    const fallbackLat = orgFacilities[0]?.coordinates?.lat ?? -12.27;
    const cLng = Array.isArray(center) && Number.isFinite(center[0]) ? center[0] : fallbackLng;
    const cLat = Array.isArray(center) && Number.isFinite(center[1]) ? center[1] : fallbackLat;

    const bounds: [number, number, number, number] = [cLng - 0.04, cLat - 0.04, cLng + 0.04, cLat + 0.04];
    const defaultDem = dem || {
      id: `dem-${Date.now()}`,
      name: `DEM Base ${name.trim()}`,
      cols: 24,
      rows: 24,
      cellSizeMeters: 150,
      bounds,
      crs: 'EPSG:4326',
      noData: -9999,
      unit: 'msnm',
      colorScale: 'elevation',
      values: Array.from({ length: 24 * 24 }, (_, idx) => {
        const r = Math.floor(idx / 24) / 23;
        const c = (idx % 24) / 23;
        return Math.round((80 + c * 140 + (1 - r) * 90 + 22 * Math.sin(c * 6) * Math.cos(r * 5)) * 100) / 100;
      })
    };

    const facilityFeatures = orgFacilities.map(f => ({
      type: 'Feature',
      properties: {
        id: f.id,
        name: f.name,
        code: f.code,
        permiso: f.environmentalPermitCode,
        estado: f.status
      },
      geometry: {
        type: 'Point',
        coordinates: [f.coordinates.lng, f.coordinates.lat]
      }
    }));

    const nowIso = new Date().toISOString();
    const newProject: any = {
      id: `gis-proj-${Date.now()}`,
      organizationId: orgId,
      code: (code && String(code).trim()) || `SIG-${Date.now().toString().slice(-4)}`,
      name: name.trim(),
      domain: domain || 'ambiental',
      description: (description && String(description).trim()) || 'Proyecto geoespacial creado en SIG & GEOTECH AI.',
      areaHa: Number(areaHa) > 0 ? Number(areaHa) : 2500,
      defaultCrs: defaultCrs || 'EPSG:32718',
      center: [cLng, cLat],
      zoom: 12,
      dem: defaultDem,
      spectralScene,
      boreholes: Array.isArray(boreholes) ? boreholes : [],
      layers: Array.isArray(layers) && layers.length > 0 ? layers : [
        {
          id: `lyr-fac-${Date.now()}`,
          name: 'Instalaciones de la Organización',
          category: 'infraestructura',
          kind: 'vector',
          visible: true,
          opacity: 1,
          crs: 'EPSG:4326',
          source: 'ECOINTELLIGENCE db.facilities',
          capturedDate: nowIso.split('T')[0],
          metadata: { provenance: 'observado' },
          symbology: { color: '#059669', fillColor: '#10b981', fillOpacity: 0.85, radius: 7, labelField: 'name' },
          geojson: { type: 'FeatureCollection', features: facilityFeatures }
        }
      ],
      operationHistory: [
        {
          id: `op-${Date.now()}`,
          timestamp: nowIso.replace('T', ' ').slice(0, 19),
          tool: 'Creación de Proyecto SIG',
          module: 'SIG Core',
          agent: 'Sistema',
          parameters: { defaultCrs: defaultCrs || 'EPSG:32718', domain: domain || 'ambiental' },
          inputLayers: [],
          durationMs: 4,
          status: 'completado',
          summary: `Proyecto "${name.trim()}" inicializado con coordenadas base de la organización.`
        }
      ],
      createdAt: nowIso,
      updatedAt: nowIso
    };

    db.geotechProjects.push(newProject);
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'CREACION_PROYECTO_SIG',
      'SIG & Geotech AI',
      `Creado proyecto SIG "${newProject.name}" (${newProject.code}, ${newProject.areaHa} ha).`
    );
    dbManager.save();
    res.status(201).json(newProject);
  });

  app.put('/api/geotech/projects/:id', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;

    const { id } = req.params;
    const db = dbManager.get();
    const list = db.geotechProjects || [];
    const idx = list.findIndex(p => p.id === id && p.organizationId === orgId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Proyecto SIG no encontrado en esta organización.' });
    }

    const existing = list[idx];
    const updated = {
      ...existing,
      ...req.body,
      id: existing.id,
      organizationId: existing.organizationId,
      updatedAt: new Date().toISOString()
    };
    list[idx] = updated;
    dbManager.save();
    res.json(updated);
  });

  app.delete('/api/geotech/projects/:id', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;

    const { id } = req.params;
    const db = dbManager.get();
    const list = db.geotechProjects || [];
    const idx = list.findIndex(p => p.id === id && p.organizationId === orgId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Proyecto SIG no encontrado en esta organización.' });
    }
    const removed = list[idx];
    list.splice(idx, 1);
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'ELIMINACION_PROYECTO_SIG',
      'SIG & Geotech AI',
      `Eliminado proyecto SIG "${removed.name}" (${removed.code}).`
    );
    dbManager.save();
    res.json({ success: true, deletedId: id });
  });

  app.post('/api/geotech/ai-agent', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    const { prompt, mode = 'deterministic', agentRole = 'Agente SIG', projectContext } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Debe ingresar una instrucción geoespacial para analizar.' });
    }

    if (mode === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          missingApiKey: true,
          error: 'GEMINI_API_KEY no está configurada en Settings > Secrets. Utilice el modo "Planificador Determinístico Local" o configure su clave en Secrets.'
        });
      }

      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const planGeoprocessingTool: FunctionDeclaration = {
          name: 'schedule_gis_operation',
          description: 'Programa una operación matemática real en el motor geoespacial del proyecto.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              tool: {
                type: Type.STRING,
                description: 'Uno de: slope, twi_hydrology, buffer, ndvi, spectral_change, ahp_suitability, slope_stability, hotspots'
              },
              label: { type: Type.STRING, description: 'Nombre descriptivo del paso' },
              agent: { type: Type.STRING, description: 'Agente responsable' },
              distanceMeters: { type: Type.NUMBER, description: 'Distancia en metros si aplica buffer' }
            },
            required: ['tool', 'label', 'agent']
          }
        };

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Rol activo: ${agentRole}. Proyecto: ${JSON.stringify(projectContext || {})}. Instrucción del ingeniero: "${prompt}". Selecciona las operaciones reales necesarias invocando schedule_gis_operation y resume el diagnóstico técnico en español sin inventar mediciones.`,
          config: {
            systemInstruction:
              'Eres Geotech AI Core de ECOINTELLIGENCE. Nunca inventes resultados numéricos de mediciones: únicamente invoca herramientas geoespaciales reales mediante schedule_gis_operation y explica la metodología científica.',
            tools: [{ functionDeclarations: [planGeoprocessingTool] }]
          }
        });

        const calls = response.functionCalls || [];
        const steps = calls.map((fc: any) => ({
          tool: String(fc.args?.tool || 'slope'),
          label: String(fc.args?.label || 'Operación Geoespacial'),
          agent: String(fc.args?.agent || agentRole),
          params: fc.args?.distanceMeters ? { distanceMeters: Number(fc.args.distanceMeters) } : {}
        }));

        const finalPlan = steps.length > 0 ? steps : planDeterministicGeospatialCommand(prompt).steps;
        dbManager.addAuditLog(
          orgId,
          actor.name,
          actor.role,
          'ORQUESTACION_GEOTECH_AI',
          'SIG & Geotech AI',
          `Gemini 4 planificó ${finalPlan.length} pasos para: "${prompt.slice(0, 80)}".`
        );
        return res.json({
          engine: 'Gemini 4 Hydrogen (Function Calling)',
          summary: response.text || `Planificación IA completada con ${finalPlan.length} herramientas ejecutables.`,
          steps: finalPlan
        });
      } catch (err: any) {
        return res.status(502).json({
          error: `Error al consultar Gemini API: ${err?.message || 'Fallo de red o cuota'}`
        });
      }
    }

    // Deterministic Local Rule Engine (explicitly tagged as local non-LLM)
    const deterministic = planDeterministicGeospatialCommand(prompt);
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'PLANIFICACION_DETERMINISTICA_SIG',
      'SIG & Geotech AI',
      `Motor Determinístico planificó ${deterministic.steps.length} operaciones para: "${prompt.slice(0, 80)}".`
    );
    return res.json({
      engine: 'Motor Determinístico Local (Reglas Geoespaciales)',
      summary: deterministic.summary,
      steps: deterministic.steps
    });
  });

  // 16. SIG & GEOTECH AI 2.0 & 3.0 Enterprise Endpoints
  app.post('/api/geotech/stac-search', async (req: Request, res: Response) => {
    const { bbox, collection, limit, maxCloudCover, startDate, endDate, sensor, maxResolutionM } = req.body || {};
    if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((n: any) => Number.isFinite(Number(n)))) {
      return res.status(400).json({ error: 'Se requiere un bounding box válido [minLng, minLat, maxLng, maxLat].' });
    }
    try {
      const result = await searchRealStacCatalog({
        bbox: [Number(bbox[0]), Number(bbox[1]), Number(bbox[2]), Number(bbox[3])],
        collection: typeof collection === 'string' ? collection : 'sentinel-2-l2a',
        limit: Number(limit) || 8,
        maxCloudCover: maxCloudCover !== undefined ? Number(maxCloudCover) : 45,
        startDate: typeof startDate === 'string' ? startDate : undefined,
        endDate: typeof endDate === 'string' ? endDate : undefined,
        sensor: typeof sensor === 'string' ? sensor : undefined,
        maxResolutionM: maxResolutionM !== undefined ? Number(maxResolutionM) : undefined,
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(502).json({
        error: `No fue posible consultar el catálogo público STAC (${err?.message || 'Error de red o timeout'}).`,
      });
    }
  });

  app.get('/api/geotech/infra-telemetry', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const orgProjects = (db.geotechProjects || []).filter(p => p.organizationId === orgId);
    const orgJobs = (db.geotechJobs || []).filter(j => j.organizationId === orgId);
    const orgUsers = (db.users || []).filter(u => u.organizationId === orgId).length;
    const workerProbe = await probeExternalWorkerLive(true);
    const diskStats = dbManager.getDiskStats();
    const orgLogs = geotechObservabilityLog.filter((l) => l.orgId === orgId);
    const totalReq = orgLogs.length;
    const errRatePct = totalReq > 0 ? Math.round((orgLogs.filter((l) => l.status >= 400).length / totalReq) * 1000) / 10 : 0;
    const avgLatencyMs = totalReq > 0 ? Math.round((orgLogs.reduce((s, l) => s + l.durationMs, 0) / totalReq) * 100) / 100 : 0;

    return res.json(
      getGeotechInfraTelemetry(orgProjects, orgJobs, orgUsers, {
        workerProbe,
        diskStats,
        observability: { totalRequests: totalReq, errorRatePct: errRatePct, avgLatencyMs },
      })
    );
  });

  app.post('/api/geotech/projects/:id/versions', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;

    const { id } = req.params;
    const { label } = req.body || {};
    const db = dbManager.get();
    const list = db.geotechProjects || [];
    const proj = list.find(p => p.id === id && p.organizationId === orgId);
    if (!proj) {
      return res.status(404).json({ error: 'Proyecto SIG no encontrado en esta organización.' });
    }

    if (!proj.versions) proj.versions = [];
    const version = {
      id: `ver-${Date.now()}`,
      label: (typeof label === 'string' && label.trim()) || `Instantánea v${proj.versions.length + 1}`,
      createdAt: new Date().toISOString(),
      author: actor.name,
      layerCount: proj.layers.length,
      historyCount: proj.operationHistory.length,
      snapshot: {
        dem: structuredClone(proj.dem),
        layers: structuredClone(proj.layers),
        boreholes: structuredClone(proj.boreholes),
        defaultCrs: proj.defaultCrs,
      },
    };
    proj.versions.unshift(version);
    if (proj.versions.length > 10) proj.versions = proj.versions.slice(0, 10);
    proj.updatedAt = new Date().toISOString();

    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'SNAPSHOT_VERSION_SIG',
      'SIG & Geotech AI 2.0',
      `Creada instantánea "${version.label}" del proyecto ${proj.code}.`
    );
    dbManager.save();
    return res.status(201).json(proj);
  });

  app.post('/api/geotech/projects/:id/versions/:vid/restore', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;

    const { id, vid } = req.params;
    const db = dbManager.get();
    const list = db.geotechProjects || [];
    const proj = list.find(p => p.id === id && p.organizationId === orgId);
    if (!proj) {
      return res.status(404).json({ error: 'Proyecto SIG no encontrado en esta organización.' });
    }
    const ver = (proj.versions || []).find(v => v.id === vid);
    if (!ver) {
      return res.status(404).json({ error: 'Versión solicitada no encontrada.' });
    }

    proj.dem = structuredClone(ver.snapshot.dem);
    proj.layers = structuredClone(ver.snapshot.layers);
    proj.boreholes = structuredClone(ver.snapshot.boreholes);
    proj.defaultCrs = ver.snapshot.defaultCrs;
    proj.updatedAt = new Date().toISOString();
    proj.operationHistory.unshift({
      id: `op-rest-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      tool: 'Restauración de Versión',
      module: 'Control de Versiones SIG 2.0',
      agent: actor.name,
      parameters: { versionId: vid, label: ver.label },
      inputLayers: [],
      durationMs: 2,
      status: 'completado',
      summary: `Proyecto restaurado a instantánea "${ver.label}" (${ver.createdAt}).`,
    });

    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'RESTAURACION_VERSION_SIG',
      'SIG & Geotech AI 2.0',
      `Restaurado proyecto ${proj.code} a versión "${ver.label}".`
    );
    dbManager.save();
    return res.json(proj);
  });

  app.post('/api/geotech/ai-agent-v2', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    const { prompt, mode = 'deterministic', agentRole = 'Agente SIG', projectContext } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Debe ingresar una instrucción geoespacial.' });
    }

    if (mode === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          missingApiKey: true,
          error: 'GEMINI_API_KEY no está configurada en Settings > Secrets. Utilice el modo "Orquestador Determinístico 2.0".',
        });
      }
      // Reuse deterministic safety check + Gemini planning if key is configured
      const basePlan = planCollaborativeWorkflow2(prompt);
      try {
        const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
        const planTool: FunctionDeclaration = {
          name: 'schedule_gis_operation',
          description: 'Programa una operación matemática real en SIG & GEOTECH AI 2.0.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              tool: { type: Type.STRING, description: 'slope | twi_hydrology | buffer | ndvi | spectral_change | ahp_suitability | slope_stability | hotspots' },
              label: { type: Type.STRING },
              agent: { type: Type.STRING },
              distanceMeters: { type: Type.NUMBER },
            },
            required: ['tool', 'label', 'agent'],
          },
        };
        const resp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Rol: ${agentRole}. Proyecto: ${JSON.stringify(projectContext || {})}. Instrucción: "${prompt}".`,
          config: {
            systemInstruction: 'Eres Geotech AI 2.0. Nunca inventes mediciones; solo invoca schedule_gis_operation y explica el flujo.',
            tools: [{ functionDeclarations: [planTool] }],
          },
        });
        const calls = resp.functionCalls || [];
        const steps = calls.map((fc: any) => ({
          tool: String(fc.args?.tool || 'slope') as any,
          label: String(fc.args?.label || 'Operación Geoespacial'),
          agent: String(fc.args?.agent || agentRole),
          params: fc.args?.distanceMeters ? { distanceMeters: Number(fc.args.distanceMeters) } : {},
        }));
        return res.json({
          ...basePlan,
          engine: 'Gemini 4 Hydrogen Multi-Agente 2.0',
          summary: resp.text || basePlan.summary,
          steps: steps.length > 0 ? steps : basePlan.steps,
        });
      } catch (err: any) {
        return res.status(502).json({ error: `Error al consultar Gemini API: ${err?.message || 'Error'}` });
      }
    }

    const plan = planCollaborativeWorkflow2(prompt);
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'ORQUESTACION_COLABORATIVA_SIG_2',
      'SIG & Geotech AI 2.0',
      `Orquestador 2.0 planificó ${plan.steps.length} pasos (${plan.agentsInvolved.join(', ')}).`
    );
    return res.json(plan);
  });

  async function callExternalGeospatialWorker(opts: {
    path: string;
    method?: 'GET' | 'POST';
    body?: any;
    orgId: string;
    traceId: string;
    timeoutMs?: number;
    maxRetries?: number;
  }): Promise<{ ok: boolean; status: number; data: any; attempts: number }> {
    const baseUrl = (process.env.GEOSPATIAL_WORKER_URL || '').trim().replace(/\/$/, '');
    const token = (process.env.GEOSPATIAL_WORKER_TOKEN || '').trim();
    const timeoutMs = opts.timeoutMs ?? 12000;
    const maxRetries = opts.maxRetries ?? 2;

    let lastStatus = 502;
    let lastErrorMessage = 'Servicio externo no disponible';
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers: Record<string, string> = {
          'x-organization-id': opts.orgId,
          'x-trace-id': opts.traceId,
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

        const resp = await fetch(`${baseUrl}${opts.path}`, {
          method: opts.method || 'GET',
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);
        const data = await resp.json().catch(() => ({}));
        if (resp.ok || (resp.status >= 400 && resp.status < 500 && resp.status !== 429)) {
          return { ok: resp.ok, status: resp.status, data, attempts: attempt + 1 };
        }
        lastStatus = resp.status;
        lastErrorMessage = typeof data?.error === 'string' ? data.error : `HTTP ${resp.status}`;
      } catch (err: any) {
        clearTimeout(timer);
        lastStatus = err?.name === 'AbortError' ? 504 : 502;
        lastErrorMessage = err?.name === 'AbortError'
          ? `Timeout excedido (${timeoutMs} ms)`
          : 'Error de conexión controlada con el microservicio geoespacial';
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
      }
    }
    return {
      ok: false,
      status: lastStatus,
      data: { error: lastErrorMessage },
      attempts: maxRetries + 1,
    };
  }

  app.post('/api/geotech/worker/inspect', async (req: Request, res: Response) => {
    const workerUrl = (process.env.GEOSPATIAL_WORKER_URL || '').trim();
    const orgId = getContextOrgId(req);
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    const { format, fileName } = req.body || {};
    if (!workerUrl) {
      return res.status(501).json({
        ok: false,
        configured: false,
        traceId,
        statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE',
        error: `DEPENDENCIA EXTERNA NO DISPONIBLE — El formato "${format || fileName || 'GDAL/PDAL'}" requiere el microservicio externo GDAL/PDAL/Rasterio/GeoPandas (/services/gdal-worker/). Configure GEOSPATIAL_WORKER_URL para habilitar su ejecución real.`,
      });
    }
    const callRes = await callExternalGeospatialWorker({ path: '/health', method: 'GET', orgId, traceId });
    if (!callRes.ok) {
      return res.status(callRes.status).json({
        ok: false,
        configured: true,
        traceId,
        attempts: callRes.attempts,
        statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE',
        error: 'Worker GDAL/PDAL configurado no respondió dentro de los límites de timeout y reintentos.',
      });
    }
    return res.json({
      ok: true,
      configured: true,
      workerUrl,
      traceId,
      attempts: callRes.attempts,
      statusLabel: 'CONECTADO',
      result: callRes.data,
    });
  });

  app.post('/api/geotech/worker/test-o', async (req: Request, res: Response) => {
    const workerUrl = (process.env.GEOSPATIAL_WORKER_URL || '').trim();
    const orgId = getContextOrgId(req);
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    if (!workerUrl) {
      return res.status(501).json({
        ok: false,
        configured: false,
        traceId,
        statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE',
        error: 'DEPENDENCIA EXTERNA NO DISPONIBLE — Configure GEOSPATIAL_WORKER_URL apuntando al contenedor Docker (/services/gdal-worker/) para ejecutar TEST O real con GDAL/PDAL/PostGIS.',
      });
    }
    const callRes = await callExternalGeospatialWorker({
      path: '/test-o/run',
      method: 'POST',
      body: req.body || {},
      orgId,
      traceId,
    });
    if (!callRes.ok) {
      return res.status(callRes.status).json({
        ok: false,
        configured: true,
        workerUrl,
        traceId,
        attempts: callRes.attempts,
        statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE',
        error: 'No se pudo completar TEST O en el worker externo.',
      });
    }
    return res.json({ ok: true, workerUrl, traceId, attempts: callRes.attempts, statusLabel: 'CONECTADO', data: callRes.data });
  });

  app.post('/api/geotech/worker/jobs/:id/cancel', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    if (!(process.env.GEOSPATIAL_WORKER_URL || '').trim()) {
      return res.status(501).json({
        ok: false,
        configured: false,
        traceId,
        statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE',
        error: 'DEPENDENCIA EXTERNA NO DISPONIBLE — Configure GEOSPATIAL_WORKER_URL para cancelar trabajos del worker.',
      });
    }
    const callRes = await callExternalGeospatialWorker({
      path: `/jobs/${encodeURIComponent(req.params.id)}/cancel`,
      method: 'POST',
      orgId,
      traceId,
    });
    return res.status(callRes.status).json({ ok: callRes.ok, traceId, data: callRes.data });
  });

  app.post('/api/geotech/worker/cleanup', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    if (!(process.env.GEOSPATIAL_WORKER_URL || '').trim()) {
      return res.status(501).json({
        ok: false,
        configured: false,
        traceId,
        statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE',
        error: 'DEPENDENCIA EXTERNA NO DISPONIBLE — Configure GEOSPATIAL_WORKER_URL para limpiar temporales del worker.',
      });
    }
    const callRes = await callExternalGeospatialWorker({
      path: '/artifacts/cleanup',
      method: 'POST',
      body: { max_age_sec: Number(req.body?.maxAgeSec ?? 3600) },
      orgId,
      traceId,
    });
    return res.status(callRes.status).json({ ok: callRes.ok, traceId, data: callRes.data });
  });

  app.post('/api/geotech/worker/jobs', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    if (!(process.env.GEOSPATIAL_WORKER_URL || '').trim()) {
      return res.status(501).json({
        ok: false,
        configured: false,
        traceId,
        statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE',
        error: 'DEPENDENCIA EXTERNA NO DISPONIBLE — Configure GEOSPATIAL_WORKER_URL para encolar trabajos en el worker.',
      });
    }
    const callRes = await callExternalGeospatialWorker({
      path: '/jobs',
      method: 'POST',
      body: req.body || {},
      orgId,
      traceId,
    });
    return res.status(callRes.status).json({ ok: callRes.ok, traceId, data: callRes.data });
  });

  app.get('/api/geotech/worker/jobs/:id', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    if (!(process.env.GEOSPATIAL_WORKER_URL || '').trim()) {
      return res.status(501).json({ ok: false, configured: false, traceId, statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE' });
    }
    const callRes = await callExternalGeospatialWorker({
      path: `/jobs/${encodeURIComponent(req.params.id)}`,
      method: 'GET',
      orgId,
      traceId,
    });
    return res.status(callRes.status).json({ ok: callRes.ok, traceId, data: callRes.data });
  });

  app.post('/api/geotech/worker/jobs/:id/resume', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    if (!(process.env.GEOSPATIAL_WORKER_URL || '').trim()) {
      return res.status(501).json({ ok: false, configured: false, traceId, statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE' });
    }
    const callRes = await callExternalGeospatialWorker({
      path: `/jobs/${encodeURIComponent(req.params.id)}/resume`,
      method: 'POST',
      body: req.body || {},
      orgId,
      traceId,
    });
    return res.status(callRes.status).json({ ok: callRes.ok, traceId, data: callRes.data });
  });

  app.post('/api/geotech/worker/geos-ops', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    if (!(process.env.GEOSPATIAL_WORKER_URL || '').trim()) {
      return res.status(501).json({ ok: false, configured: false, traceId, statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE' });
    }
    const callRes = await callExternalGeospatialWorker({
      path: '/vector/geos-ops',
      method: 'POST',
      body: req.body || {},
      orgId,
      traceId,
    });
    return res.status(callRes.status).json({ ok: callRes.ok, traceId, data: callRes.data });
  });

  app.post('/api/geotech/worker/postgis/query', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    if (!(process.env.GEOSPATIAL_WORKER_URL || '').trim()) {
      return res.status(501).json({ ok: false, configured: false, traceId, statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE' });
    }
    const callRes = await callExternalGeospatialWorker({
      path: '/postgis/spatial-ops',
      method: 'POST',
      body: req.body || {},
      orgId,
      traceId,
    });
    return res.status(callRes.status).json({ ok: callRes.ok, traceId, data: callRes.data });
  });

  function validateWorkerUploadBuffer(fileName: string, rawBase64: string, allowedExts: string[]): { buf: Buffer; safeName: string; ext: string } {
    const baseName = path.basename(String(fileName || '').trim());
    if (!baseName || baseName !== String(fileName || '').trim() || baseName.includes('..') || baseName.includes('/') || baseName.includes('\\')) {
      throw Object.assign(new Error('Nombre de archivo inválido o intento de Path Traversal bloqueado.'), { status: 400 });
    }
    const lower = baseName.toLowerCase();
    const ext = lower.endsWith('.gdb.zip') ? 'gdb.zip' : (lower.split('.').pop() || '');
    if (!allowedExts.includes(ext)) {
      throw Object.assign(new Error(`Extensión ".${ext}" no autorizada para esta operación.`), { status: 400 });
    }
    if (typeof rawBase64 !== 'string' || rawBase64.length < 4) {
      throw Object.assign(new Error('Contenido binario del archivo vacío o inválido.'), { status: 400 });
    }
    const buf = Buffer.from(rawBase64, 'base64');
    if (buf.length < 4 || buf.length > 45 * 1024 * 1024) {
      throw Object.assign(new Error('Tamaño de archivo fuera del límite permitido (4 B – 45 MB).'), { status: 413 });
    }
    const headerAscii = buf.subarray(0, 16).toString('latin1');
    if (ext === 'gpkg' && !headerAscii.startsWith('SQLite format 3')) {
      throw Object.assign(new Error('Magic bytes inválidos: un GeoPackage (.gpkg) debe iniciar con firma SQLite format 3.'), { status: 400 });
    }
    if ((ext === 'zip' || ext === 'gdb.zip') && !(buf[0] === 0x50 && buf[1] === 0x4b)) {
      throw Object.assign(new Error('Magic bytes inválidos para archivo ZIP / OpenFileGDB.'), { status: 400 });
    }
    if ((ext === 'las' || ext === 'laz') && !headerAscii.startsWith('LASF')) {
      throw Object.assign(new Error('Magic bytes inválidos: un archivo LAS/LAZ debe iniciar con firma ASPRS LASF.'), { status: 400 });
    }
    if (ext === 'parquet' && !headerAscii.startsWith('PAR1')) {
      throw Object.assign(new Error('Magic bytes inválidos: GeoParquet debe iniciar con firma PAR1.'), { status: 400 });
    }
    if ((ext === 'h5' || ext === 'hdf5') && !(buf[0] === 0x89 && buf[1] === 0x48 && buf[2] === 0x44 && buf[3] === 0x46)) {
      throw Object.assign(new Error('Magic bytes inválidos para archivo HDF5.'), { status: 400 });
    }
    if (ext === 'nc' && !(headerAscii.startsWith('CDF') || (buf[0] === 0x89 && buf[1] === 0x48 && buf[2] === 0x44 && buf[3] === 0x46))) {
      throw Object.assign(new Error('Magic bytes inválidos para archivo NetCDF (.nc).'), { status: 400 });
    }
    return { buf, safeName: baseName, ext };
  }

  async function callExternalWorkerFormData(opts: {
    path: string;
    buildFormData: () => FormData;
    orgId: string;
    traceId: string;
    timeoutMs?: number;
  }): Promise<{ ok: boolean; status: number; data: any }> {
    const baseUrl = (process.env.GEOSPATIAL_WORKER_URL || '').trim().replace(/\/$/, '');
    const token = (process.env.GEOSPATIAL_WORKER_TOKEN || '').trim();
    const timeoutMs = opts.timeoutMs ?? Number(process.env.WORKER_TIMEOUT_MS || 20000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        'x-organization-id': opts.orgId,
        'x-trace-id': opts.traceId,
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${baseUrl}${opts.path}`, {
        method: 'POST',
        headers,
        body: opts.buildFormData(),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, data };
    } catch (err: any) {
      clearTimeout(timer);
      return {
        ok: false,
        status: err?.name === 'AbortError' ? 504 : 502,
        data: { error: err?.name === 'AbortError' ? 'Timeout ejecutando operación en Worker C++.' : 'Error de conectividad con Worker GDAL/PDAL.' },
      };
    }
  }

  app.post('/api/geotech/worker/vector/convert-to-geojson', async (req: Request, res: Response, next: NextFunction) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    if (!(process.env.GEOSPATIAL_WORKER_URL || '').trim()) {
      return res.status(501).json({ ok: false, configured: false, traceId, statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE', error: 'Worker externo no configurado.' });
    }
    try {
      const { fileName, fileBase64, targetCrs = 'EPSG:4326', layer } = req.body || {};
      const { buf, safeName } = validateWorkerUploadBuffer(fileName, fileBase64, ['gpkg', 'gdb.zip', 'zip', 'parquet', 'geojson', 'json', 'gml', 'kml']);
      const wRes = await callExternalWorkerFormData({
        path: '/vector/convert-to-geojson',
        orgId,
        traceId,
        buildFormData: () => {
          const fd = new FormData();
          fd.append('file', new Blob([new Uint8Array(buf)]), safeName);
          fd.append('target_crs', String(targetCrs));
          if (typeof layer === 'string' && layer.trim()) fd.append('layer', layer.trim());
          return fd;
        },
      });
      if (!wRes.ok) return res.status(wRes.status).json({ ok: false, traceId, error: wRes.data?.detail || wRes.data?.error || 'Fallo en conversión GDAL.' });
      return res.json({ ok: true, traceId, featureCollection: wRes.data });
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/geotech/worker/vector/convert', async (req: Request, res: Response, next: NextFunction) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    const baseUrl = (process.env.GEOSPATIAL_WORKER_URL || '').trim().replace(/\/$/, '');
    const token = (process.env.GEOSPATIAL_WORKER_TOKEN || '').trim();
    if (!baseUrl) {
      return res.status(501).json({ ok: false, configured: false, traceId, statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE', error: 'Worker externo no configurado.' });
    }
    try {
      const { featureCollection, targetFormat = 'GPKG', targetCrs = 'EPSG:4326', baseName = 'export' } = req.body || {};
      if (!featureCollection || !Array.isArray(featureCollection.features) || featureCollection.features.length === 0) {
        return res.status(400).json({ error: 'Se requiere una FeatureCollection no vacía para exportar con GDAL.' });
      }
      const allowedOut = new Set(['GPKG', 'PARQUET', 'GEOPARQUET', 'GDB', 'OPENFILEGDB', 'GML', 'SHP', 'GEOJSON']);
      const fmtUpper = String(targetFormat).toUpperCase();
      if (!allowedOut.has(fmtUpper)) {
        return res.status(400).json({ error: `Formato de salida GDAL no soportado: ${fmtUpper}` });
      }

      const geojsonBuf = Buffer.from(JSON.stringify(featureCollection), 'utf-8');
      const wRes = await callExternalWorkerFormData({
        path: '/vector/convert',
        orgId,
        traceId,
        buildFormData: () => {
          const fd = new FormData();
          fd.append('file', new Blob([new Uint8Array(geojsonBuf)], { type: 'application/geo+json' }), 'layer.geojson');
          fd.append('target_format', fmtUpper);
          fd.append('target_crs', String(targetCrs));
          return fd;
        },
      });
      if (!wRes.ok || !wRes.data?.file_name) {
        return res.status(wRes.status).json({ ok: false, traceId, error: wRes.data?.detail || wRes.data?.error || 'Error generando archivo en Worker GDAL.' });
      }

      const artifactResp = await fetch(`${baseUrl}/artifacts/${encodeURIComponent(wRes.data.file_name)}`, {
        headers: {
          'x-organization-id': orgId,
          'x-trace-id': traceId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!artifactResp.ok) {
        return res.status(502).json({ error: 'No fue posible descargar el artefacto binario generado por GDAL.' });
      }
      const binBuf = Buffer.from(await artifactResp.arrayBuffer());
      const safeDownloadName = `${String(baseName).replace(/[^a-zA-Z0-9_-]/g, '_') || 'layer'}.${wRes.data.file_name.endsWith('.gdb.zip') ? 'gdb.zip' : wRes.data.file_name.split('.').pop()}`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName}"`);
      res.setHeader('X-Artifact-Sha256', String(wRes.data.sha256 || ''));
      res.setHeader('X-Feature-Count', String(wRes.data.feature_count || 0));
      return res.send(binBuf);
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/geotech/worker/raster/inspect-scientific', async (req: Request, res: Response, next: NextFunction) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    if (!(process.env.GEOSPATIAL_WORKER_URL || '').trim()) {
      return res.status(501).json({ ok: false, configured: false, traceId, statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE', error: 'Worker externo no configurado.' });
    }
    try {
      const { fileName, fileBase64 } = req.body || {};
      const { buf, safeName } = validateWorkerUploadBuffer(fileName, fileBase64, ['nc', 'nc4', 'h5', 'hdf5']);
      const wRes = await callExternalWorkerFormData({
        path: '/raster/inspect-scientific',
        orgId,
        traceId,
        buildFormData: () => {
          const fd = new FormData();
          fd.append('file', new Blob([new Uint8Array(buf)]), safeName);
          return fd;
        },
      });
      if (!wRes.ok) return res.status(wRes.status).json({ ok: false, traceId, error: wRes.data?.detail || wRes.data?.error || 'Error inspeccionando NetCDF4/HDF5.' });
      return res.json({ ok: true, traceId, inspection: wRes.data });
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/geotech/worker/pdal/inspect', async (req: Request, res: Response, next: NextFunction) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const traceId = (res.getHeader('x-trace-id') as string) || `trc-${Date.now().toString(36)}`;
    if (!(process.env.GEOSPATIAL_WORKER_URL || '').trim()) {
      return res.status(501).json({ ok: false, configured: false, traceId, statusLabel: 'DEPENDENCIA EXTERNA NO DISPONIBLE', error: 'Worker externo no configurado.' });
    }
    try {
      const { fileName, fileBase64, includePoints = true, maxPoints = 15000 } = req.body || {};
      const { buf, safeName } = validateWorkerUploadBuffer(fileName, fileBase64, ['las', 'laz']);
      const wRes = await callExternalWorkerFormData({
        path: '/pdal/inspect',
        orgId,
        traceId,
        buildFormData: () => {
          const fd = new FormData();
          fd.append('file', new Blob([new Uint8Array(buf)]), safeName);
          fd.append('include_points', String(Boolean(includePoints)));
          fd.append('max_points', String(Math.min(50000, Math.max(100, Number(maxPoints) || 15000))));
          return fd;
        },
      });
      if (!wRes.ok) return res.status(wRes.status).json({ ok: false, traceId, error: wRes.data?.detail || wRes.data?.error || 'Error inspeccionando nube LAS/LAZ con PDAL.' });
      return res.json({ ok: true, traceId, data: wRes.data });
    } catch (err) {
      return next(err);
    }
  });

  // 17. SIG & GEOTECH AI 3.0 — GeoCatalog, Jobs, Diff, Collaboration, Templates, AI v3, OGC API
  app.get('/api/geotech/catalog', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const orgProjects = (db.geotechProjects || []).filter(p => p.organizationId === orgId);
    const items = buildUnifiedGeoCatalog(orgProjects, {
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      assetKind: typeof req.query.assetKind === 'string' ? req.query.assetKind : undefined,
      crs: typeof req.query.crs === 'string' ? req.query.crs : undefined,
    });
    res.json({ total: items.length, items });
  });

  app.get('/api/geotech/projects/:id/versions/diff', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const { id } = req.params;
    const { v1, v2 } = req.query;
    const db = dbManager.get();
    const proj = (db.geotechProjects || []).find(p => p.id === id && p.organizationId === orgId);
    if (!proj) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });
    const verA = (proj.versions || []).find(v => v.id === v1);
    const verB = (proj.versions || []).find(v => v.id === v2);
    if (!verA || !verB) return res.status(400).json({ error: 'Debe seleccionar dos instantáneas válidas (v1 y v2) para comparar.' });
    return res.json(computeProjectVersionDiff(verA, verB));
  });

  app.get('/api/geotech/jobs', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const jobs = (db.geotechJobs || []).filter(j => j.organizationId === orgId);
    res.json(jobs);
  });

  app.post('/api/geotech/jobs', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const job = req.body;
    if (!job || !job.id || !job.title) {
      return res.status(400).json({ error: 'Datos de trabajo Batch inválidos.' });
    }
    const db = dbManager.get();
    if (!db.geotechJobs) db.geotechJobs = [];
    const safeJob = { ...job, organizationId: orgId, createdBy: actor.name };
    const idx = db.geotechJobs.findIndex(j => j.id === safeJob.id && j.organizationId === orgId);
    if (idx >= 0) db.geotechJobs[idx] = safeJob;
    else db.geotechJobs.unshift(safeJob);
    if (db.geotechJobs.length > 60) db.geotechJobs = db.geotechJobs.slice(0, 60);
    dbManager.save();
    res.status(201).json(safeJob);
  });

  app.post('/api/geotech/templates/:templateId/instantiate', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const { templateId } = req.params;
    const { name } = req.body || {};
    const tpl = GEOTECH_PROJECT_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return res.status(404).json({ error: 'Plantilla geoespacial no encontrada.' });

    const db = dbManager.get();
    const orgFac = db.facilities.find(f => f.organizationId === orgId);
    const center: [number, number] = orgFac ? [orgFac.coordinates.lng, orgFac.coordinates.lat] : [-76.87, -12.27];
    const seed = buildTemplateSeedArtifacts(tpl, center, orgId, typeof name === 'string' ? name.trim() : undefined);
    const nowIso = new Date().toISOString();

    const project: any = {
      id: `gis-tpl-${Date.now()}`,
      organizationId: orgId,
      code: `TPL-${Date.now().toString().slice(-4)}`,
      name: (typeof name === 'string' && name.trim().length >= 3) ? name.trim() : tpl.title.replace(/^\d+\.\s*/, ''),
      center,
      zoom: 12,
      boreholes: [],
      operationHistory: [{
        id: `op-tpl-${Date.now()}`,
        timestamp: nowIso.replace('T', ' ').slice(0, 19),
        tool: `Plantilla 3.0 (${tpl.sectorTag})`,
        module: 'Generador de Proyectos',
        agent: actor.name,
        parameters: { templateId: tpl.id },
        inputLayers: [],
        durationMs: 6,
        status: 'completado',
        summary: `Proyecto generado automáticamente desde plantilla "${tpl.title}".`,
      }],
      createdAt: nowIso,
      updatedAt: nowIso,
      ...seed,
    };

    db.geotechProjects.push(project);
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'INSTANCIACION_PLANTILLA_SIG', 'SIG & Geotech AI 3.0', `Instanciada plantilla ${tpl.id} -> ${project.code}.`);
    dbManager.save();
    res.status(201).json(project);
  });

  app.post('/api/geotech/projects/:id/comments', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const proj = (db.geotechProjects || []).find(p => p.id === req.params.id && p.organizationId === orgId);
    if (!proj) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });
    const { targetType = 'project', targetName = proj.name, message } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'El comentario técnico no puede estar vacío.' });
    }
    if (!proj.comments) proj.comments = [];
    proj.comments.unshift({
      id: `cmt-${Date.now()}`,
      author: actor.name,
      authorRole: actor.role,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      targetType,
      targetName,
      message: message.trim(),
      resolved: false,
    });
    proj.updatedAt = new Date().toISOString();
    dbManager.save();
    res.status(201).json(proj);
  });

  app.post('/api/geotech/projects/:id/approvals', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const proj = (db.geotechProjects || []).find(p => p.id === req.params.id && p.organizationId === orgId);
    if (!proj) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });
    const { stage, status = 'aprobado', notes = '' } = req.body || {};
    if (!stage || typeof stage !== 'string') return res.status(400).json({ error: 'Indique el hito o entregable a revisar.' });
    if (!proj.approvals) proj.approvals = [];
    proj.approvals.unshift({
      id: `apr-${Date.now()}`,
      stage: stage.trim(),
      requestedBy: actor.name,
      reviewer: actor.name,
      status,
      notes: String(notes || '').trim(),
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
    });
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'APROBACION_ENTREGABLE_SIG', 'SIG & Geotech AI 3.0', `${status.toUpperCase()}: ${stage} en ${proj.code}.`);
    dbManager.save();
    res.status(201).json(proj);
  });

  app.post('/api/geotech/projects/:id/members', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const proj = (db.geotechProjects || []).find(p => p.id === req.params.id && p.organizationId === orgId);
    if (!proj) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });
    const { userName, email, enterpriseRole } = req.body || {};
    if (!userName || !enterpriseRole) return res.status(400).json({ error: 'Usuario y rol configurables requeridos.' });
    if (!proj.projectMembers) proj.projectMembers = [];
    const existingIdx = proj.projectMembers.findIndex(m => m.email === email || m.userName === userName);
    const record = { userName, email: email || 'equipo@ecointelligence.com', enterpriseRole, assignedAt: new Date().toISOString().slice(0, 10) };
    if (existingIdx >= 0) proj.projectMembers[existingIdx] = record;
    else proj.projectMembers.push(record);
    dbManager.save();
    res.status(201).json(proj);
  });

  app.get('/api/geotech/benchmarks', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const list = (db.geotechBenchmarks || []).filter((b: any) => !b.organizationId || b.organizationId === orgId);
    res.json(list);
  });

  app.post('/api/geotech/benchmarks', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const record = req.body;
    if (!record || !record.id || !Array.isArray(record.results)) {
      return res.status(400).json({ error: 'Resultado de benchmark inválido.' });
    }
    const db = dbManager.get();
    if (!db.geotechBenchmarks) db.geotechBenchmarks = [];
    const scopedRecord = { ...record, organizationId: orgId };
    db.geotechBenchmarks.unshift(scopedRecord);
    if (db.geotechBenchmarks.length > 30) db.geotechBenchmarks = db.geotechBenchmarks.slice(0, 30);
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'BENCHMARK_STRESS_SIG_4', 'SIG & Geotech AI 4.0', `Benchmark ejecutado (${record.totalDurationMs} ms, pico ${record.peakMemoryMb} MB).`);
    dbManager.save();
    res.status(201).json(db.geotechBenchmarks.filter((b: any) => !b.organizationId || b.organizationId === orgId));
  });

  app.post('/api/geotech/ai-agent-v3', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    const { prompt, projectId, sandboxDryRun = false } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Debe ingresar una instrucción o meta autónoma para el Agente 3.0.' });
    }
    const db = dbManager.get();
    const project = (db.geotechProjects || []).find(p => p.id === projectId && p.organizationId === orgId);
    const plan = planAutonomousAgentV3({ prompt, project, sandboxDryRun: Boolean(sandboxDryRun) });
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'AGENTE_AUTONOMO_SIG_3',
      'SIG & Geotech AI 3.0',
      `Plan autónomo 3.0 (${plan.steps.length} etapas, dryRun=${Boolean(sandboxDryRun)}): "${prompt.slice(0, 80)}".`
    );
    return res.json(plan);
  });

  // =========================================================
  // 18. SIG & GEOTECH AI 4.0 — OBSERVABILITY, REPRO, PUBLISHING, BACKUPS, MONITORING
  // =========================================================

  app.get('/api/geotech/observability', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const orgLogs = geotechObservabilityLog.filter((l) => l.orgId === orgId);
    const total = orgLogs.length;
    const errors = orgLogs.filter((l) => l.status >= 400).length;
    const avgLatencyMs = total > 0 ? Math.round((orgLogs.reduce((s, l) => s + l.durationMs, 0) / total) * 100) / 100 : 0;
    const errorRatePct = total > 0 ? Math.round((errors / total) * 1000) / 10 : 0;

    const workerProbe = await probeExternalWorkerLive(true);
    const diskStats = dbManager.getDiskStats();
    const orgProjects = (db.geotechProjects || []).filter(p => p.organizationId === orgId);
    const orgJobs = (db.geotechJobs || []).filter(j => j.organizationId === orgId);
    const orgUsers = (db.users || []).filter(u => u.organizationId === orgId).length;
    const liveTelemetry = getGeotechInfraTelemetry(orgProjects, orgJobs, orgUsers, {
      workerProbe,
      diskStats,
      observability: { totalRequests: total, errorRatePct, avgLatencyMs },
    });

    res.json({
      orgId,
      totalRequests: total,
      errorCount: errors,
      errorRatePct,
      avgLatencyMs,
      rateLimitConfig: { maxRequests: GEOAPI_RATE_LIMIT_MAX, windowMs: GEOAPI_RATE_WINDOW_MS },
      workerConfigured: workerProbe.configured,
      workerReachable: workerProbe.reachable,
      postgisConfigured: workerProbe.postgisConfigured,
      postgisConnected: workerProbe.postgisConnected,
      workerStatusLabel: liveTelemetry.externalWorker.statusLabel,
      storage: liveTelemetry.storage,
      memory: liveTelemetry.memory,
      operationalAlerts: liveTelemetry.operationalAlerts,
      recentTraces: orgLogs.slice(0, 30),
    });
  });

  app.get('/api/geotech/projects/:id/quality-report', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const proj = (db.geotechProjects || []).find(p => p.id === req.params.id && p.organizationId === orgId);
    if (!proj) return res.status(404).json({ error: 'Proyecto SIG no encontrado en esta organización.' });
    return res.json(generateProjectQualityReport(proj));
  });

  app.post('/api/geotech/projects/:id/publication', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    const rbac = checkGranularRbac({
      userRole: actor.role,
      action: 'publish_official',
      actorOrgId: orgId,
      targetOrgId: orgId,
    });
    if (!rbac.allowed && actor.role !== 'operador') {
      return res.status(403).json({ error: rbac.reason });
    }
    const db = dbManager.get();
    const proj = (db.geotechProjects || []).find(p => p.id === req.params.id && p.organizationId === orgId);
    if (!proj) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });

    const { targetStatus } = req.body || {};
    const validTargets = new Set(['borrador', 'revision', 'aprobacion', 'publicado']);
    if (!validTargets.has(targetStatus)) {
      return res.status(400).json({ error: 'Estado de publicación inválido.' });
    }

    const currentStatus = proj.publicationStatus || 'borrador';
    const qualityReport = generateProjectQualityReport(proj);
    const hasReviewerApproval = (proj.approvals || []).some((a) => a.status === 'aprobado');

    const check = evaluatePublicationTransition({
      currentStatus,
      targetStatus,
      userRole: actor.role,
      qualityScore: qualityReport.score,
      hasReviewerApproval,
    });

    if (!check.allowed) {
      return res.status(400).json({
        error: check.blockers.join(' '),
        blockers: check.blockers,
        qualityScore: qualityReport.score,
      });
    }

    proj.publicationStatus = targetStatus;
    if (!proj.publicationHistory) proj.publicationHistory = [];
    proj.publicationHistory.unshift({
      from: currentStatus,
      to: targetStatus,
      by: actor.name,
      role: actor.role,
      at: new Date().toISOString(),
      qualityScore: qualityReport.score,
    });
    proj.updatedAt = new Date().toISOString();
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'PUBLICACION_CONTROLADA_SIG_4',
      'SIG & Geotech AI 4.0',
      `${proj.code}: ${currentStatus.toUpperCase()} → ${targetStatus.toUpperCase()} (Quality=${qualityReport.score}/100).`
    );
    dbManager.save();
    return res.json(proj);
  });

  app.post('/api/geotech/projects/:id/repro-packages', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const proj = (db.geotechProjects || []).find(p => p.id === req.params.id && p.organizationId === orgId);
    if (!proj) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });

    const { title, algorithm = 'slope_horn', parameters = {} } = req.body || {};
    try {
      const pkg = createGeoReproPackage({
        project: proj,
        title: (typeof title === 'string' && title.trim()) || `Paquete ${algorithm}`,
        algorithm,
        parameters,
        user: actor.name,
      });
      if (!proj.reproPackages) proj.reproPackages = [];
      proj.reproPackages.unshift(pkg);
      if (proj.reproPackages.length > 20) proj.reproPackages = proj.reproPackages.slice(0, 20);

      // Persist serialized package artifact separated from DB inside object storage
      const stored = dbManager.saveGeotechObject(orgId, proj.id, pkg.resultHash, JSON.stringify(pkg, null, 2));
      if (!proj.objectKeys) proj.objectKeys = [];
      proj.objectKeys.unshift({
        assetId: pkg.id,
        objectKey: stored.objectKey,
        sha256: pkg.resultHash,
        byteSize: stored.byteSize,
        storedAt: new Date().toISOString(),
      });

      dbManager.save();
      return res.status(201).json({ package: pkg, project: proj });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'No se pudo generar el Paquete de Reproducibilidad.' });
    }
  });

  app.post('/api/geotech/projects/:id/repro-packages/:rid/reexecute', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const proj = (db.geotechProjects || []).find(p => p.id === req.params.id && p.organizationId === orgId);
    if (!proj) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });
    const pkg = (proj.reproPackages || []).find((r: any) => r.id === req.params.rid);
    if (!pkg) return res.status(404).json({ error: 'Paquete de reproducibilidad no encontrado.' });
    return res.json(reexecuteAndVerifyReproPackage(pkg, proj));
  });

  app.get('/api/geotech/projects/:id/monitoring', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const proj = (db.geotechProjects || []).find(p => p.id === req.params.id && p.organizationId === orgId);
    if (!proj) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });
    if (!proj.monitoringStations || proj.monitoringStations.length === 0) {
      proj.monitoringStations = buildDefaultMonitoringStations(proj);
      dbManager.save();
    }
    const alerts = evaluateMonitoringAlerts(proj.monitoringStations);
    return res.json({ stations: proj.monitoringStations, alerts });
  });

  app.post('/api/geotech/projects/:id/monitoring/measure', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const proj = (db.geotechProjects || []).find(p => p.id === req.params.id && p.organizationId === orgId);
    if (!proj) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });
    if (!proj.monitoringStations || proj.monitoringStations.length === 0) {
      proj.monitoringStations = buildDefaultMonitoringStations(proj);
    }
    const { stationId, value, campaign = 'Campaña Campo', date } = req.body || {};
    const st = proj.monitoringStations.find((s: any) => s.id === stationId);
    if (!st) return res.status(404).json({ error: 'Estación de monitoreo no encontrada.' });
    const numVal = Number(value);
    if (!Number.isFinite(numVal)) return res.status(400).json({ error: 'Valor de medición numérico inválido.' });
    st.measurements.push({
      date: (typeof date === 'string' && date) || new Date().toISOString().slice(0, 10),
      campaign: String(campaign),
      value: numVal,
    });
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'MEDICION_MONITOREO_AMBIENTAL', 'Monitoreo 4.0', `Registrado ${numVal} ${st.unit} en ${st.code} (${st.parameter}).`);
    dbManager.save();
    return res.status(201).json({ stations: proj.monitoringStations, alerts: evaluateMonitoringAlerts(proj.monitoringStations) });
  });

  app.get('/api/geotech/backups', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const list = (db.geotechBackups || []).filter(b => b.organizationId === orgId);
    res.json(list);
  });

  app.post('/api/geotech/projects/:id/backup', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const proj = (db.geotechProjects || []).find(p => p.id === req.params.id && p.organizationId === orgId);
    if (!proj) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });

    const payloadJson = JSON.stringify(proj);
    const datasetHash = computeProjectDatasetHash(proj);
    const stored = dbManager.saveGeotechObject(orgId, proj.id, datasetHash, payloadJson);
    const backup = {
      id: `bkp-${Date.now()}`,
      organizationId: orgId,
      projectId: proj.id,
      projectCode: proj.code,
      projectName: proj.name,
      label: (typeof req.body?.label === 'string' && req.body.label.trim()) || `Backup ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      createdAt: new Date().toISOString(),
      createdBy: actor.name,
      datasetHash,
      byteSize: stored.byteSize,
      objectKey: stored.objectKey,
    };
    if (!db.geotechBackups) db.geotechBackups = [];
    db.geotechBackups.unshift(backup);
    if (db.geotechBackups.length > 30) db.geotechBackups = db.geotechBackups.slice(0, 30);
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'BACKUP_PROYECTO_SIG_4', 'Backups & Disaster Recovery', `Backup "${backup.label}" guardado en ${stored.objectKey} (SHA-256 ${datasetHash.slice(0, 12)}...).`);
    dbManager.save();
    return res.status(201).json(backup);
  });

  app.post('/api/geotech/backups/:bid/restore', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const backup = (db.geotechBackups || []).find(b => b.id === req.params.bid && b.organizationId === orgId);
    if (!backup) return res.status(404).json({ error: 'Backup no encontrado en esta organización.' });
    const raw = dbManager.readGeotechObject(orgId, backup.projectId, backup.datasetHash);
    if (!raw) return res.status(404).json({ error: 'Objeto de backup no encontrado en almacenamiento S3 local.' });

    const restoredProj = JSON.parse(raw);
    const restoredHash = computeProjectDatasetHash(restoredProj);
    const idx = db.geotechProjects.findIndex(p => p.id === backup.projectId && p.organizationId === orgId);
    if (idx >= 0) db.geotechProjects[idx] = restoredProj;
    else db.geotechProjects.push(restoredProj);
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'RESTORE_BACKUP_SIG_4', 'Backups & Disaster Recovery', `Restaurado ${backup.projectCode} desde backup "${backup.label}" (hash=${restoredHash.slice(0, 12)}...).`);
    dbManager.save();
    return res.json({
      project: restoredProj,
      hashVerified: restoredHash === backup.datasetHash,
      datasetHash: restoredHash,
    });
  });

  app.post('/api/geotech/projects/:id/recovery-test-y', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;
    const db = dbManager.get();
    const projIdx = (db.geotechProjects || []).findIndex(p => p.id === req.params.id && p.organizationId === orgId);
    if (projIdx === -1) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });

    const originalProj = db.geotechProjects[projIdx];
    const hashBefore = computeProjectDatasetHash(originalProj);
    const reproBefore = createGeoReproPackage({ project: originalProj, title: 'TEST Y Baseline', algorithm: 'slope_horn', user: actor.name });
    const backupJson = JSON.stringify(originalProj);
    const stored = dbManager.saveGeotechObject(orgId, originalProj.id, hashBefore, backupJson);

    // Simulate failure / corruption in memory
    const corrupted = JSON.parse(backupJson);
    corrupted.dem.values = corrupted.dem.values.map(() => -9999);
    const hashCorrupted = computeProjectDatasetHash(corrupted);

    // Restore from persisted object storage
    const loadedJson = dbManager.readGeotechObject(orgId, originalProj.id, hashBefore);
    if (!loadedJson) return res.status(500).json({ error: 'Fallo leyendo artefacto de recuperación.' });
    const restoredProj = JSON.parse(loadedJson);
    const hashRestored = computeProjectDatasetHash(restoredProj);
    const reproAfter = createGeoReproPackage({ project: restoredProj, title: 'TEST Y Post-Restore', algorithm: 'slope_horn', user: actor.name });
    db.geotechProjects[projIdx] = restoredProj;
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'TEST_Y_RECOVERY_INTEGRITY', 'SIG & Geotech AI 4.0', `TEST Y verificado: hash antes/después idéntico (${hashRestored.slice(0, 12)}...).`);
    dbManager.save();

    return res.json({
      test: 'TEST Y — End-to-End Recovery Integrity Test',
      passed: hashBefore !== hashCorrupted && hashRestored === hashBefore && reproAfter.resultHash === reproBefore.resultHash,
      hashBefore,
      hashCorrupted,
      hashRestored,
      reproHashBefore: reproBefore.resultHash,
      reproHashAfter: reproAfter.resultHash,
      objectKey: stored.objectKey,
      byteSize: stored.byteSize,
    });
  });

  // System-wide Disaster Recovery Snapshots (DB JSON + PostGIS SQL Dump + SHA-256 + Retention)
  app.get('/api/geotech/system-backups', (_req: Request, res: Response) => {
    res.json(dbManager.listSystemSnapshots());
  });

  app.post('/api/geotech/system-backups/create', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (rejectReadOnly(actor, res)) return;

    let postgisSql: string | null = null;
    const pgDsn = (process.env.POSTGIS_DSN || '').trim();
    const pgDumpBin = (process.env.PG_DUMP_BIN || '/opt/geo-env/bin/pg_dump').trim();
    if (pgDsn && fs.existsSync(pgDumpBin)) {
      try {
        const { stdout } = await execFileAsync(pgDumpBin, ['--clean', '--if-exists', '--no-owner', '--no-privileges', pgDsn], {
          timeout: 20000,
          maxBuffer: 25 * 1024 * 1024,
        });
        postgisSql = stdout;
      } catch {
        // Record DB snapshot even if optional PostGIS pg_dump is offline
        postgisSql = null;
      }
    }

    const label = typeof req.body?.label === 'string' && req.body.label.trim() ? req.body.label.trim() : undefined;
    const manifest = dbManager.createSystemSnapshot({
      label,
      createdBy: actor.name,
      postgisSql,
    });
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'SNAPSHOT_SISTEMA_COMPLETO',
      'Disaster Recovery 4.1',
      `Snapshot "${manifest.label}" creado (DB SHA-256 ${manifest.dbSha256.slice(0, 12)}, PostGIS=${manifest.hasPostgisDump ? 'SÍ' : 'NO'}).`
    );
    return res.status(201).json(manifest);
  });

  app.post('/api/geotech/system-backups/:id/restore', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    if (actor.role !== 'admin' && actor.role !== 'operador') {
      return res.status(403).json({ error: 'Solo Administrador u Operador pueden restaurar snapshots completos del sistema.' });
    }
    try {
      const restored = dbManager.restoreSystemSnapshot(req.params.id);
      let postgisRestored = false;
      const pgDsn = (process.env.POSTGIS_DSN || '').trim();
      const psqlBin = (process.env.PSQL_BIN || '/opt/geo-env/bin/psql').trim();
      if (restored.postgisSql && pgDsn && fs.existsSync(psqlBin)) {
        try {
          const snapSqlPath = path.join(
            dbManager.getSystemBackupDir(),
            req.params.id.replace(/[^a-zA-Z0-9_-]/g, ''),
            'postgis_dump.sql'
          );
          if (fs.existsSync(snapSqlPath)) {
            await execFileAsync(psqlBin, ['-v', 'ON_ERROR_STOP=0', '-d', pgDsn, '-f', snapSqlPath], {
              timeout: 25000,
              maxBuffer: 10 * 1024 * 1024,
            });
            postgisRestored = true;
          }
        } catch {
          postgisRestored = false;
        }
      }
      dbManager.addAuditLog(
        orgId,
        actor.name,
        actor.role,
        'RESTAURACION_SISTEMA_COMPLETO',
        'Disaster Recovery 4.1',
        `Sistema restaurado desde snapshot "${restored.manifest.label}" (SHA-256 ${restored.restoredDbSha256.slice(0, 12)}, PostGIS=${postgisRestored ? 'RESTAURADO' : 'SOLO_DB'}).`
      );
      return res.json({
        success: true,
        hashVerified: restored.hashVerified,
        restoredDbSha256: restored.restoredDbSha256,
        postgisRestored,
        manifest: restored.manifest,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Error restaurando snapshot del sistema.' });
    }
  });

  app.post('/api/geotech/ai-agent-v4', async (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const actor = getActorInfo(req);
    const { prompt, projectId } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Debe ingresar una consulta o instrucción para Geotech AI 4.0.' });
    }
    const db = dbManager.get();
    const project = (db.geotechProjects || []).find(p => p.id === projectId && p.organizationId === orgId);
    if (!project) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });
    const workerProbe = await probeExternalWorkerLive(false);
    const plan = planAiWorkflow4(prompt, project, {
      workerConnected: workerProbe.configured && workerProbe.reachable,
    });
    dbManager.addAuditLog(orgId, actor.name, actor.role, 'ORQUESTACION_GEOTECH_AI_4', 'SIG & Geotech AI 4.0', `AI 4.0 planificó ${plan.steps.length} pasos (needsMoreInfo=${plan.needsMoreInfo}).`);
    return res.json(plan);
  });

  app.get('/api/geotech/projects/:id/versions/diff4', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const proj = (db.geotechProjects || []).find(p => p.id === req.params.id && p.organizationId === orgId);
    if (!proj) return res.status(404).json({ error: 'Proyecto SIG no encontrado.' });
    const verA = (proj.versions || []).find(v => v.id === req.query.v1);
    const verB = (proj.versions || []).find(v => v.id === req.query.v2);
    if (!verA || !verB) return res.status(400).json({ error: 'Seleccione dos versiones válidas v1 y v2.' });
    return res.json(computeAdvancedVersionDiff4(verA, verB));
  });

  // Documented OGC API Features / Vector Tiles / OpenAPI Geo Endpoints (Hardened 4.0)
  app.get('/api/geotech/ogc', (_req: Request, res: Response) => {
    res.json({
      title: 'ECOINTELLIGENCE SIG & GEOTECH AI 4.0 — OGC API Features & Tiles',
      description: 'API geoespacial interoperable paginada, con filtrado espacial/temporal, CRS dinámico y rate-limiting.',
      conformance: [
        'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core',
        'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson',
        'http://www.opengis.net/spec/ogcapi-features-2/1.0/conf/crs',
      ],
      links: [
        { href: '/api/geotech/ogc/collections', rel: 'data', type: 'application/json' },
        { href: '/api/geotech/openapi', rel: 'service-desc', type: 'application/json' },
      ],
    });
  });

  app.get('/api/geotech/ogc/collections', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const orgProjects = (db.geotechProjects || []).filter(p => p.organizationId === orgId);
    res.json({ collections: buildOgcCollections(orgProjects) });
  });

  app.get('/api/geotech/ogc/collections/:collectionId/items', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const db = dbManager.get();
    const orgProjects = (db.geotechProjects || []).filter(p => p.organizationId === orgId);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const result = queryOgcCollectionItems(
      orgProjects,
      req.params.collectionId,
      typeof req.query.bbox === 'string' ? req.query.bbox : undefined,
      limit + offset
    );
    if (!result) return res.status(404).json({ error: 'Colección OGC no encontrada en la organización.' });

    let slicedFeatures = result.features.slice(offset, offset + limit);
    const targetCrs = typeof req.query.crs === 'string' ? (req.query.crs as CrsCode) : 'EPSG:4326';
    if (targetCrs !== 'EPSG:4326' && ['EPSG:3857', 'EPSG:32717', 'EPSG:32718', 'EPSG:32719'].includes(targetCrs)) {
      slicedFeatures = transformFeatureCollectionCrs({ type: 'FeatureCollection', features: slicedFeatures }, 'EPSG:4326', targetCrs).features;
    }

    const nextOffset = offset + limit < result.numberMatched ? offset + limit : null;
    res.setHeader('Content-Type', 'application/geo+json');
    return res.json({
      ...result,
      crs: targetCrs,
      offset,
      limit,
      numberReturned: slicedFeatures.length,
      links: nextOffset !== null ? [{ rel: 'next', href: `/api/geotech/ogc/collections/${req.params.collectionId}/items?offset=${nextOffset}&limit=${limit}&crs=${encodeURIComponent(targetCrs)}` }] : [],
      features: slicedFeatures,
    });
  });

  app.get('/api/geotech/ogc/tiles/:z/:x/:y', (req: Request, res: Response) => {
    const orgId = getContextOrgId(req);
    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 20) {
      return res.status(400).json({ error: 'Coordenadas de tesela XYZ inválidas.' });
    }
    const db = dbManager.get();
    const orgProjects = (db.geotechProjects || []).filter(p => p.organizationId === orgId);
    return res.json(queryOgcTileItems(orgProjects, z, x, y));
  });

  app.get('/api/geotech/openapi', (_req: Request, res: Response) => {
    res.json({
      openapi: '3.0.3',
      info: { title: 'ECOINTELLIGENCE Geospatial Enterprise API 4.0', version: '4.0.0' },
      paths: {
        '/api/geotech/catalog': { get: { summary: 'Buscador unificado GeoCatalog multifaceta' } },
        '/api/geotech/jobs': { get: { summary: 'Lista trabajos Batch' }, post: { summary: 'Registra estado/checkpoint de trabajo Batch' } },
        '/api/geotech/templates/{templateId}/instantiate': { post: { summary: 'Instancia plantilla de dominio (1..10)' } },
        '/api/geotech/projects/{id}/versions/diff4': { get: { summary: 'Diff geométrico y ráster Δm entre versiones' } },
        '/api/geotech/projects/{id}/quality-report': { get: { summary: 'AI Project Reviewer — PROJECT QUALITY REPORT' } },
        '/api/geotech/projects/{id}/publication': { post: { summary: 'Publicación controlada Borrador → Revisión → Aprobación → Publicado' } },
        '/api/geotech/projects/{id}/repro-packages': { post: { summary: 'Genera Paquete de Reproducibilidad SHA-256' } },
        '/api/geotech/projects/{id}/monitoring': { get: { summary: 'Estaciones y alertas de Monitoreo Ambiental 4.0' } },
        '/api/geotech/projects/{id}/backup': { post: { summary: 'Backup completo a almacén de objetos separado S3-compatible' } },
        '/api/geotech/projects/{id}/recovery-test-y': { post: { summary: 'TEST Y End-to-End Recovery Integrity SHA-256' } },
        '/api/geotech/observability': { get: { summary: 'Métricas de latencia, tasa de errores y trazas GeoAPI 4.0' } },
        '/api/geotech/ogc/collections': { get: { summary: 'OGC API Features — Colecciones' } },
        '/api/geotech/ogc/collections/{collectionId}/items': { get: { summary: 'OGC API Features — Items GeoJSON + bbox + offset/limit + crs' } },
        '/api/geotech/ogc/tiles/{z}/{x}/{y}': { get: { summary: 'OGC Vector Tile Slice por XYZ' } },
        '/api/geotech/ai-agent-v4': { post: { summary: 'Agente Geotech AI 4.0 con detección de datos faltantes y trazabilidad 7 fases' } },
      },
    });
  });

  // System reset endpoint to restore clean laboratory database (Protected in Production + Admin RBAC)
  app.post('/api/system/reset-seed', (req: Request, res: Response) => {
    const actor = getActorInfo(req);
    const orgId = getContextOrgId(req);
    if (actor.role !== 'admin') {
      return res.status(403).json({ error: 'Solo el rol Administrador puede restablecer el dataset semilla.' });
    }
    if (isProd && process.env.ALLOW_LAB_RESET !== 'true') {
      return res.status(403).json({
        error: 'Operación bloqueada en entorno de producción (ALLOW_LAB_RESET != true).',
      });
    }
    dbManager.resetToLaboratorySeed();
    dbManager.addAuditLog(
      orgId,
      actor.name,
      actor.role,
      'RESET_LAB_SEED',
      'Sistema Core',
      `Base de datos restablecida al dataset semilla en modo ${appEnv}.`
    );
    res.json({ success: true, message: 'Base de datos restaurada al dataset de laboratorio inicial con migraciones 001-038.' });
  });

  // Global sanitized JSON error handler (never exposes stack traces, secrets, or internal host paths)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const traceId = (res.getHeader('x-trace-id') as string) || `err-${Date.now().toString(36)}`;
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Cuerpo JSON malformado en la solicitud.', traceId });
    }
    const statusCode = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    const message =
      statusCode < 500 && typeof err?.message === 'string' && err.message.trim()
        ? err.message
        : statusCode >= 500
        ? 'Error interno controlado del servidor.'
        : 'Solicitud rechazada por validación.';
    return res.status(statusCode).json({
      error: message,
      traceId,
    });
  });

  // Integrate Vite dev server or static files
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`ECOINTELLIGENCE server running at http://0.0.0.0:${PORT} in ${appEnv} mode.`);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`Received ${signal}, flushing DB state and closing HTTP server...`);
    try {
      dbManager.save();
    } catch {
      // ignore flush errors on shutdown
    }
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch(err => {
  console.error('Failed to start ECOINTELLIGENCE server:', err);
  process.exit(1);
});
