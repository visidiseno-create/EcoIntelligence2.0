import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { GeotechProject } from '../utils/geotechEngine';
import type { BatchJobRecord } from '../utils/batchJobEngine';
import type { BenchmarkRunRecord } from '../utils/stressBenchmarks3';
import { createInitialGeotechProjects } from './geotechSeed';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface Organization {
  id: string;
  name: string;
  taxId: string; // RUC / RFC / CIF
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

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'auditor' | 'operador' | 'lector';
  organizationId: string;
  facilityIds: string[];
}

export interface DocumentItem {
  id: string;
  organizationId: string;
  facilityId?: string;
  obligationId?: string;
  title: string;
  category: 'licencia' | 'monitoreo' | 'manifiesto' | 'politica' | 'auditoria';
  fileName: string;
  fileSizeKb: number;
  uploadDate: string;
  version: string;
  uploadedBy: string;
  fileContentBase64?: string;
}

export interface InspectionTemplate {
  id: string;
  title: string;
  sector: string;
  categories: Array<{
    name: string;
    items: string[];
  }>;
}

export interface Inspection {
  id: string;
  organizationId: string;
  facilityId: string;
  templateId: string;
  title: string;
  date: string;
  inspector: string;
  status: 'completada' | 'en_progreso' | 'programada';
  score: number;
  summary: string;
  findings: Array<{
    id: string;
    type: 'no_conformidad_mayor' | 'no_conformidad_menor' | 'oportunidad_mejora';
    description: string;
    area: string;
    actionRequired: boolean;
  }>;
}

export interface CorrectiveAction {
  id: string;
  organizationId: string;
  facilityId: string;
  inspectionId?: string;
  title: string;
  findingDescription: string;
  rootCause: string;
  proposedAction: string;
  responsible: string;
  deadline: string;
  status: 'abierta' | 'en_implementacion' | 'en_verificacion' | 'cerrada';
  closureEvidence?: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  timestamp: string;
  userName: string;
  userRole: string;
  action: string;
  module: string;
  details: string;
}

export interface SubscriptionQuota {
  planId: 'starter' | 'pro' | 'enterprise';
  planName: string;
  monthlyPriceUsd: number;
  maxFacilities: number;
  maxUsers: number;
  maxStorageMb: number;
  features: string[];
}

export interface EvidenceImage {
  id: string;
  organizationId: string;
  facilityId?: string;
  module: 'dashboard' | 'instalaciones' | 'cumplimiento' | 'residuos' | 'agua' | 'aire' | 'energia' | 'inspecciones' | 'capa' | 'documentos' | 'informes' | 'calendario' | 'geotech';
  entityId?: string;
  title: string;
  description?: string;
  date: string;
  category: string;
  observations?: string;
  fileName: string;
  fileSizeKb: number;
  mimeType: string;
  dataUrl: string;
  uploadedBy: string;
  uploadedAt: string;
}

export type ComplianceStatus = 'cumple' | 'no_cumple' | 'cumplimiento_parcial' | 'pendiente_verificacion' | 'no_aplica';

export interface ComplianceDeclaration {
  id: string;
  organizationId: string;
  facilityId: string;
  module: 'documentos' | 'residuos' | 'aire' | 'energia' | 'obligaciones';
  requirementTitle: string;
  requirementCode?: string;
  obligationId?: string;
  aspectEvaluated: string;
  status: ComplianceStatus;
  evaluationDate: string;
  evaluatorName: string;
  evaluatorRole: string;
  observations: string;
  evidenceIds: string[];
  reviewStatus: 'borrador' | 'en_revision' | 'aprobado_auditoria';
  history: Array<{
    timestamp: string;
    previousStatus: ComplianceStatus | null;
    newStatus: ComplianceStatus;
    changedBy: string;
    justification: string;
    evidenceCount: number;
  }>;
}

export interface CalendarEventRecord {
  id: string;
  organizationId: string;
  facilityId?: string;
  title: string;
  category: 'reunion' | 'visita_tecnica' | 'viaje' | 'inspeccion' | 'charla';
  date: string;
  startTime: string;
  endTime?: string;
  location: string;
  responsible: string;
  participants?: string;
  description: string;
  status: 'programada' | 'en_curso' | 'completada' | 'cancelada';
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseSchema {
  organizations: Organization[];
  facilities: Facility[];
  users: User[];
  obligations: any[];
  wasteRecords: any[];
  waterRecords: any[];
  airRecords: any[];
  energyRecords: any[];
  inspectionTemplates: InspectionTemplate[];
  inspections: Inspection[];
  correctiveActions: CorrectiveAction[];
  documents: DocumentItem[];
  evidences: EvidenceImage[];
  complianceDeclarations: ComplianceDeclaration[];
  calendarEvents: CalendarEventRecord[];
  geotechProjects: GeotechProject[];
  geotechJobs: BatchJobRecord[];
  geotechBenchmarks: BenchmarkRunRecord[];
  geotechBackups: Array<{
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
  }>;
  auditLogs: AuditLog[];
  subscriptions: Record<string, SubscriptionQuota>;
}

// Initial Seed Data representing migrations 001-038
const INITIAL_DATABASE: DatabaseSchema = {
  organizations: [
    {
      id: 'org-1',
      name: 'BioAndes Agroindustria S.A.C.',
      taxId: '20549812401',
      sector: 'Agroindustria y Procesamiento de Alimentos',
      country: 'Perú',
      plan: 'pro',
      createdAt: '2025-01-15'
    },
    {
      id: 'org-2',
      name: 'MetalMecánica del Pacífico S.A.',
      taxId: '20108745912',
      sector: 'Metalmecánica, Fundición y Galvanoplastia',
      country: 'Perú',
      plan: 'enterprise',
      createdAt: '2025-03-20'
    }
  ],
  facilities: [
    {
      id: 'fac-1',
      organizationId: 'org-1',
      name: 'Planta Principal Lurín',
      code: 'PLT-LUR-01',
      address: 'Km 37.5 Antigua Panamericana Sur, Lurín, Lima',
      coordinates: { lat: -12.2748, lng: -76.8711 },
      activity: 'Extracción de aceites esenciales y envasado de concentrados',
      environmentalPermitCode: 'DIA-PRODUCE-2023-049',
      status: 'activa'
    },
    {
      id: 'fac-2',
      organizationId: 'org-1',
      name: 'Complejo Agroindustrial Ica',
      code: 'CMP-ICA-02',
      address: 'Valle de Villacurí Sublote 14, Salas Guadalupe, Ica',
      coordinates: { lat: -13.9852, lng: -75.7612 },
      activity: 'Packing y deshidratado solar de frutas de exportación',
      environmentalPermitCode: 'EIA-sd-MIDAGRI-2022-118',
      status: 'activa'
    },
    {
      id: 'fac-3',
      organizationId: 'org-1',
      name: 'Centro de Distribución Huachipa',
      code: 'CD-HUA-03',
      address: 'Av. Las Torres 450, Huachipa, Lurigancho, Lima',
      coordinates: { lat: -12.0124, lng: -76.9205 },
      activity: 'Almacenamiento en frío y logística refrigerada',
      environmentalPermitCode: 'ITS-PRODUCE-2024-002',
      status: 'activa'
    },
    {
      id: 'fac-4',
      organizationId: 'org-2',
      name: 'Fundición y Laminación Callao',
      code: 'FND-CAL-01',
      address: 'Av. Néstor Gambetta Km 6.8, Callao',
      coordinates: { lat: -11.9984, lng: -77.1324 },
      activity: 'Fundición continua de piezas de bronce y aleaciones',
      environmentalPermitCode: 'EIA-d-MINEM-2021-085',
      status: 'activa'
    },
    {
      id: 'fac-5',
      organizationId: 'org-2',
      name: 'Planta de Galvanizado Ventanilla',
      code: 'GLV-VEN-02',
      address: 'Zona Industrial Parque Porcino Mz. B, Ventanilla',
      coordinates: { lat: -11.8741, lng: -77.1298 },
      activity: 'Baños de zincado por inmersión en caliente',
      environmentalPermitCode: 'PAMA-PRODUCE-2020-034',
      status: 'activa'
    }
  ],
  users: [
    {
      id: 'usr-1',
      email: 'admin@ecoinntelligence.com',
      name: 'Ing. Valeria Mendoza',
      role: 'admin',
      organizationId: 'org-1',
      facilityIds: ['fac-1', 'fac-2', 'fac-3']
    },
    {
      id: 'usr-2',
      email: 'auditor@ecoinntelligence.com',
      name: 'Dr. Roberto Santillán',
      role: 'auditor',
      organizationId: 'org-1',
      facilityIds: ['fac-1', 'fac-2', 'fac-3']
    },
    {
      id: 'usr-3',
      email: 'operador@ecoinntelligence.com',
      name: 'Tec. Carlos Paredes',
      role: 'operador',
      organizationId: 'org-1',
      facilityIds: ['fac-1']
    },
    {
      id: 'usr-4',
      email: 'lector@ecoinntelligence.com',
      name: 'Lic. Andrea Benavides',
      role: 'lector',
      organizationId: 'org-1',
      facilityIds: ['fac-1', 'fac-2', 'fac-3']
    }
  ],
  obligations: [
    {
      id: 'ob-101',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      title: 'Monitoreo Ambiental Trimestral de Calidad de Aire y Emisiones',
      normativeSource: 'D.S. 003-2017-MINAM & Compromiso EIA DIA-049',
      jurisdiction: 'Nacional / MINAM - OEFA',
      dueDate: '2026-11-15',
      frequency: 'trimestral',
      responsible: 'Ing. Valeria Mendoza',
      status: 'en_progreso',
      evidenceCount: 3,
      description: 'Monitoreo de material particulado PM10 y gases de combustión en chimenea de caldera por laboratorio acreditado INACAL.'
    },
    {
      id: 'ob-102',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      title: 'Declaración Anual de Manejo de Residuos Sólidos (SIGERSOL)',
      normativeSource: 'D.L. 1278 - Ley de Gestión Integral de Residuos Sólidos',
      jurisdiction: 'Nacional / MINAM',
      dueDate: '2026-11-28',
      frequency: 'anual',
      responsible: 'Tec. Carlos Paredes',
      status: 'pendiente',
      evidenceCount: 1,
      description: 'Presentación formal en plataforma SIGERSOL con consolidado de manifiestos de residuos peligrosos y no peligrosos.'
    },
    {
      id: 'ob-103',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      title: 'Monitoreo y Registro de Caudales de Extracción de Aguas Subterráneas',
      normativeSource: 'R.J. 007-2020-ANA (Autoridad Nacional del Agua)',
      jurisdiction: 'Sectorial / ANA - ALA Ica',
      dueDate: '2026-10-31',
      frequency: 'mensual',
      responsible: 'Ing. Valeria Mendoza',
      status: 'vencida',
      evidenceCount: 0,
      description: 'Remisión de reportes mensuales de horómetro y caudalímetros de los pozos IRHS-45 e IRHS-46 a la Autoridad Local del Agua.'
    },
    {
      id: 'ob-104',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      title: 'Renovación de Póliza de Seguro Ambiental para Sustancias Peligrosas',
      normativeSource: 'Ley 28611 Ley General del Ambiente Art. 147',
      jurisdiction: 'Nacional',
      dueDate: '2026-12-10',
      frequency: 'anual',
      responsible: 'Lic. Andrea Benavides',
      status: 'en_progreso',
      evidenceCount: 1,
      description: 'Contratación y entrega a OEFA de la póliza de responsabilidad civil por contaminación ambiental para el parque de solventes.'
    },
    {
      id: 'ob-105',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      title: 'Actualización del Plan de Contingencias Ambientales y Simulacro de Derrames',
      normativeSource: 'D.S. 017-2015-PRODUCE',
      jurisdiction: 'Sectorial / PRODUCE',
      dueDate: '2026-11-02',
      frequency: 'semestral',
      responsible: 'Ing. Valeria Mendoza',
      status: 'cumplida',
      evidenceCount: 4,
      description: 'Ejecución del simulacro semestral de fuga de amoníaco y derrame de combustible con acta de veeduría y registro fotográfico.'
    },
    {
      id: 'ob-106',
      organizationId: 'org-1',
      facilityId: 'fac-3',
      title: 'Calibración de Detectores de Refrigerantes Hidrofluorocarbonados (HFC)',
      normativeSource: 'Protocolo de Montreal & Enmienda de Kigali',
      jurisdiction: 'Internacional / PRODUCE',
      dueDate: '2026-12-05',
      frequency: 'semestral',
      responsible: 'Tec. Carlos Paredes',
      status: 'pendiente',
      evidenceCount: 0,
      description: 'Certificado de calibración de los 12 sensores de fuga en cámaras de congelación profunda.'
    },
    {
      id: 'ob-201',
      organizationId: 'org-2',
      facilityId: 'fac-4',
      title: 'Monitoreo de Material Particulado y Humos Metálicos en Fundición',
      normativeSource: 'D.S. 003-2017-MINAM & EIA-d MINEM',
      jurisdiction: 'Sectorial / OEFA - PRODUCE',
      dueDate: '2026-11-22',
      frequency: 'trimestral',
      responsible: 'Ing. Valeria Mendoza',
      status: 'en_progreso',
      evidenceCount: 2,
      description: 'Evaluación isocinética de plomo, cobre y PM10 en campana de extracción de hornos de inducción.'
    },
    {
      id: 'ob-202',
      organizationId: 'org-2',
      facilityId: 'fac-5',
      title: 'Control de Efluentes Ácidos y Metales Pesados en Baños de Zincado',
      normativeSource: 'D.S. 010-2019-VIVIENDA (VMA)',
      jurisdiction: 'Sectorial / SEDAPAL - PRODUCE',
      dueDate: '2026-10-25',
      frequency: 'mensual',
      responsible: 'Dr. Roberto Santillán',
      status: 'vencida',
      evidenceCount: 1,
      description: 'Informe de ensayo de zinc total, cromo hexavalente y pH previo a descarga al alcantarillado industrial.'
    }
  ],
  wasteRecords: [
    {
      id: 'w-201',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-01',
      wasteName: 'Lodos deshidratados de PTAR',
      category: 'peligroso',
      quantityKg: 1450,
      originProcess: 'Planta de Tratamiento de Efluentes Industriales',
      carrier: 'TransAmbiental Perú S.A.C.',
      destination: 'Relleno de Seguridad Huaycoloro (Petramás)',
      treatmentType: 'disposicion_final',
      manifestNumber: 'MAN-2026-0891'
    },
    {
      id: 'w-202',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-02',
      wasteName: 'Aceites dieléctricos y lubricantes usados',
      category: 'peligroso',
      quantityKg: 320,
      originProcess: 'Mantenimiento Preventivo de Reductores',
      carrier: 'OilTech Soluciones Ambientales',
      destination: 'Planta de Re-refinación Ecológica',
      treatmentType: 'reciclaje',
      manifestNumber: 'MAN-2026-0892'
    },
    {
      id: 'w-203',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-03',
      wasteName: 'Envases plásticos de polietileno triple lavado',
      category: 'reciclable',
      quantityKg: 840,
      originProcess: 'Línea de Dosificación de Nutrientes',
      carrier: 'CampoLimpio Perú',
      destination: 'Planta de Extrusión Plástica Industrial',
      treatmentType: 'reciclaje',
      manifestNumber: 'MAN-2026-0893'
    },
    {
      id: 'w-204',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      date: '2026-11-03',
      wasteName: 'Restos de poda y pulpa vegetal agroindustrial',
      category: 'organico',
      quantityKg: 5200,
      originProcess: 'Selección y Despalillado en Packing',
      carrier: 'AgroCompost Ica E.I.R.L.',
      destination: 'Pila de Compostaje Fundo Los Álamos',
      treatmentType: 'compostaje',
      manifestNumber: 'MAN-2026-0894'
    },
    {
      id: 'w-205',
      organizationId: 'org-1',
      facilityId: 'fac-3',
      date: '2026-11-04',
      wasteName: 'Baterías de montacargas de plomo-ácido en desuso',
      category: 'raee',
      quantityKg: 680,
      originProcess: 'Taller Eléctrico Centro de Distribución',
      carrier: 'Baterías Rápido Reciclaje',
      destination: 'Planta Metalúrgica de Recuperación de Plomo',
      treatmentType: 'reciclaje',
      manifestNumber: 'MAN-2026-0895'
    },
    {
      id: 'w-206',
      organizationId: 'org-2',
      facilityId: 'fac-4',
      date: '2026-11-02',
      wasteName: 'Escoria metálica de hornos y polvo de colector de mangas',
      category: 'peligroso',
      quantityKg: 2150,
      originProcess: 'Fundición de aleaciones de bronce',
      carrier: 'Innova Ambiental S.A.',
      destination: 'Relleno de Seguridad Chilca',
      treatmentType: 'disposicion_final',
      manifestNumber: 'MAN-MM-2026-014'
    },
    {
      id: 'w-207',
      organizationId: 'org-2',
      facilityId: 'fac-4',
      date: '2026-11-03',
      wasteName: 'Viruta ferrosa y retazos de acero mecanizado',
      category: 'reciclable',
      quantityKg: 3900,
      originProcess: 'Maestranza y Tornos CNC',
      carrier: 'Aceros Reciclados del Sur',
      destination: 'Siderúrgica Fundidora Callao',
      treatmentType: 'reciclaje',
      manifestNumber: 'MAN-MM-2026-015'
    }
  ],
  waterRecords: [
    {
      id: 'wt-301',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-10-28',
      source: 'red_publica',
      volumeConsumedM3: 620,
      volumeDischargedM3: 410,
      dischargePermitCompliant: true,
      bod5MgL: 42, // DBO5
      codMgL: 85,  // DQO
      ph: 7.2
    },
    {
      id: 'wt-302',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-02',
      source: 'agua_recirculada',
      volumeConsumedM3: 280,
      volumeDischargedM3: 0,
      dischargePermitCompliant: true,
      bod5MgL: 12,
      codMgL: 28,
      ph: 7.0
    },
    {
      id: 'wt-303',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      date: '2026-10-30',
      source: 'pozo_subterraneo',
      volumeConsumedM3: 1450,
      volumeDischargedM3: 980,
      dischargePermitCompliant: true,
      bod5MgL: 38,
      codMgL: 76,
      ph: 7.4
    },
    {
      id: 'wt-304',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      date: '2026-11-03',
      source: 'fuente_superficial',
      volumeConsumedM3: 890,
      volumeDischargedM3: 610,
      dischargePermitCompliant: false, // High TSS trigger
      bod5MgL: 75,
      codMgL: 160,
      ph: 8.6
    },
    {
      id: 'wt-305',
      organizationId: 'org-2',
      facilityId: 'fac-5',
      date: '2026-11-01',
      source: 'red_publica',
      volumeConsumedM3: 540,
      volumeDischargedM3: 390,
      dischargePermitCompliant: true,
      bod5MgL: 28,
      codMgL: 64,
      ph: 6.9
    }
  ],
  airRecords: [
    {
      id: 'air-401',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-10-25',
      emissionSource: 'Chimenea Caldera Pirotubular 150 BHP (CH-01)',
      parameter: 'PM10',
      measuredValue: 48.5,
      limitValue: 50.0,
      unit: 'mg/Nm3'
    },
    {
      id: 'air-402',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-10-25',
      emissionSource: 'Chimenea Caldera Pirotubular 150 BHP (CH-01)',
      parameter: 'SO2',
      measuredValue: 142.0,
      limitValue: 200.0,
      unit: 'mg/Nm3'
    },
    {
      id: 'air-403',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-10-26',
      emissionSource: 'Chimenea Caldera Pirotubular 150 BHP (CH-01)',
      parameter: 'NOx',
      measuredValue: 210.0,
      limitValue: 250.0,
      unit: 'mg/Nm3'
    },
    {
      id: 'air-404',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-10-27',
      emissionSource: 'Horno Deshidratador de Frutas (HD-02)',
      parameter: 'CO',
      measuredValue: 185.0,
      limitValue: 150.0, // Exceeded!
      unit: 'mg/Nm3'
    },
    {
      id: 'air-405',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      date: '2026-11-01',
      emissionSource: 'Generador Eléctrico de Emergencia Cummins 500kVA',
      parameter: 'PM2.5',
      measuredValue: 22.4,
      limitValue: 25.0,
      unit: 'mg/Nm3'
    },
    {
      id: 'air-406',
      organizationId: 'org-2',
      facilityId: 'fac-4',
      date: '2026-10-29',
      emissionSource: 'Lavador de Gases Horno Inducción F-01',
      parameter: 'PM10',
      measuredValue: 36.2,
      limitValue: 50.0,
      unit: 'mg/Nm3'
    }
  ],
  energyRecords: [
    {
      id: 'en-501',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-10-25',
      sourceType: 'red_electrica',
      consumptionKWh: 18500,
      costUsd: 2220
    },
    {
      id: 'en-502',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-10-25',
      sourceType: 'solar_fotovoltaica',
      consumptionKWh: 6200,
      costUsd: 0
    },
    {
      id: 'en-503',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-10-26',
      sourceType: 'gas_natural',
      consumptionKWh: 12400,
      costUsd: 890
    },
    {
      id: 'en-504',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      date: '2026-10-28',
      sourceType: 'red_electrica',
      consumptionKWh: 24000,
      costUsd: 2880
    },
    {
      id: 'en-505',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      date: '2026-10-28',
      sourceType: 'solar_fotovoltaica',
      consumptionKWh: 9500,
      costUsd: 0
    },
    {
      id: 'en-506',
      organizationId: 'org-1',
      facilityId: 'fac-3',
      date: '2026-11-01',
      sourceType: 'diesel',
      consumptionKWh: 3800,
      costUsd: 1140
    },
    {
      id: 'en-507',
      organizationId: 'org-2',
      facilityId: 'fac-4',
      date: '2026-11-01',
      sourceType: 'red_electrica',
      consumptionKWh: 42000,
      costUsd: 4850
    }
  ],
  inspectionTemplates: [
    {
      id: 'tmpl-1',
      title: 'Auditoría Ambiental de Cumplimiento Legal e Instalaciones Industriales',
      sector: 'Industria Manufacturera y Agroindustria',
      categories: [
        {
          name: 'Almacenamiento de Sustancias Peligrosas y Combustibles',
          items: [
            '¿Cuentan los tanques y cilindros con cubeto de retención secundaria con capacidad >= 110%?',
            '¿Se encuentran las hojas de datos de seguridad (FDS/MSDS) en idioma español y accesibles en el punto de uso?',
            '¿Se dispone de kit antiderrame completo (cordones absorbentes, paños, EPP y bandeja receptora)?'
          ]
        },
        {
          name: 'Gestión Integral de Residuos Sólidos',
          items: [
            '¿El almacén central de residuos cuenta con techado, ventilación, piso impermeable y señalización reglamentaria?',
            '¿Los cilindros están rotulados según la NTP 900.058 (código de colores) con fecha de inicio de almacenamiento?',
            '¿Se cuenta con manifiestos de residuos peligrosos firmados por el operador y la planta de disposición final?'
          ]
        },
        {
          name: 'Manejo de Efluentes y Emisiones',
          items: [
            '¿La planta de tratamiento de efluentes cuenta con bitácora diaria de operación y medición de parámetros in situ?',
            '¿Los puntos de muestreo en chimeneas cuentan con plataforma segura y puertos normalizados según EPA Método 1?'
          ]
        }
      ]
    },
    {
      id: 'tmpl-2',
      title: 'Inspección de Seguridad Hídrica y Monitoreo de Pozos',
      sector: 'Agroexportación',
      categories: [
        {
          name: 'Monitoreo de Extracción de Pozo',
          items: [
            '¿El caudalímetro volumétrico se encuentra precintado y con certificado de calibración vigente?',
            '¿Se realiza la medición estática y dinámica del nivel freático con sonda piezométrica?'
          ]
        }
      ]
    }
  ],
  inspections: [
    {
      id: 'insp-601',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      templateId: 'tmpl-1',
      title: 'Inspección Trimestral de Almacén de Químicos y PTAR',
      date: '2026-10-22',
      inspector: 'Dr. Roberto Santillán (Auditor Líder)',
      status: 'completada',
      score: 84,
      summary: 'Instalaciones en buen estado operativo general. Se identificaron 2 no conformidades menores relativas a etiquetado y falta de bandeja antiderrame temporal.',
      findings: [
        {
          id: 'fnd-01',
          type: 'no_conformidad_menor',
          description: 'Cilindros de lubricante ISO 68 sin rotulación de código NFPA 704 en zona de mantenimiento auxiliar.',
          area: 'Taller de Mantenimiento',
          actionRequired: true
        },
        {
          id: 'fnd-02',
          type: 'oportunidad_mejora',
          description: 'Optimizar la periodicidad de purga de lodos del sedimentador secundario para evitar picos de DBO5.',
          area: 'PTAR Industrial',
          actionRequired: false
        }
      ]
    },
    {
      id: 'insp-602',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      templateId: 'tmpl-2',
      title: 'Auditoría de Pozos Subterráneos y Riego Presurizado',
      date: '2026-11-02',
      inspector: 'Ing. Valeria Mendoza',
      status: 'completada',
      score: 92,
      summary: 'Mediciones de caudalímetros en regla y en concordancia con la cuota de extracción asignada por la Autoridad Local del Agua.',
      findings: [
        {
          id: 'fnd-03',
          type: 'oportunidad_mejora',
          description: 'Implementar telemetría LoRaWAN en pozo IRHS-46 para automatizar el envío de lecturas horarias.',
          area: 'Estación de Bombeo 2',
          actionRequired: false
        }
      ]
    },
    {
      id: 'insp-603',
      organizationId: 'org-2',
      facilityId: 'fac-4',
      templateId: 'tmpl-1',
      title: 'Inspección de Campanas de Extracción y Lavador de Gases',
      date: '2026-10-30',
      inspector: 'Dr. Roberto Santillán',
      status: 'completada',
      score: 88,
      summary: 'Sistema de extracción operativo al 94% de presión diferencial; se recomienda limpieza de boquillas en lavador húmedo.',
      findings: [
        {
          id: 'fnd-04',
          type: 'no_conformidad_menor',
          description: 'Registro incompleto de dosificación de soda cáustica en lavador húmedo de línea de zincado.',
          area: 'Planta de Galvanizado',
          actionRequired: true
        }
      ]
    }
  ],
  correctiveActions: [
    {
      id: 'capa-701',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      inspectionId: 'insp-601',
      title: 'Implementación de Bandeja de Contención y Rotulación NFPA en Lubricantes',
      findingDescription: 'Cilindros de lubricante ISO 68 sin rotulación de código NFPA 704 en zona de mantenimiento auxiliar.',
      rootCause: 'Falta de procedimiento estandarizado para recepción y rotulado previo al ingreso al almacén satélite.',
      proposedAction: 'Comprar 2 bandejas de polietileno de alta densidad (HDPE) de 4 tambores y reetiquetar el 100% de los envases con código diamante.',
      responsible: 'Tec. Carlos Paredes',
      deadline: '2026-11-20',
      status: 'en_implementacion',
      closureEvidence: 'OC-2026-441 emitida para compra de bandejas Justrite.'
    },
    {
      id: 'capa-702',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      title: 'Calibración de Quemador en Caldera CH-01 por Monóxido de Carbono (CO)',
      findingDescription: 'Lectura de CO en chimenea alcanzó 185 mg/Nm3, superando el límite referencial de 150 mg/Nm3.',
      rootCause: 'Relación aire-combustible descalibrada y acumulación de hollín en toberas de inyección.',
      proposedAction: 'Servicio técnico especializado de regulación de quemador Weishaupt y análisis de gases en caliente.',
      responsible: 'Ing. Valeria Mendoza',
      deadline: '2026-11-18',
      status: 'abierta'
    },
    {
      id: 'capa-703',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      title: 'Adecuación de Válvula Check en Cabezal de Pozo IRHS-45',
      findingDescription: 'Retorno de contraflujo observado durante paradas imprevistas del sistema.',
      rootCause: 'Desgaste en asiento de teflón de la válvula retención instalada en 2021.',
      proposedAction: 'Reemplazo preventivo de válvula de retención dúctil de 6 pulgadas con prueba hidrostática.',
      responsible: 'Jefe de Mantenimiento Ica',
      deadline: '2026-10-30',
      status: 'cerrada',
      closureEvidence: 'Informe técnico de instalación N° 088 y acta de conformidad firmada.'
    },
    {
      id: 'capa-704',
      organizationId: 'org-2',
      facilityId: 'fac-5',
      inspectionId: 'insp-603',
      title: 'Automatización de Bitácora de pH en Lavador de Gases de Zincado',
      findingDescription: 'Registro incompleto de dosificación de soda cáustica en lavador húmedo.',
      rootCause: 'Falta de sensor en línea calibrado con alarma de pH mínimo.',
      proposedAction: 'Instalar controlador digital de pH con registro continuo y alarma visual.',
      responsible: 'Tec. Carlos Paredes',
      deadline: '2026-11-25',
      status: 'abierta'
    }
  ],
  documents: [
    {
      id: 'doc-801',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      obligationId: 'ob-101',
      title: 'Informe de Ensayo Acreditado de Emisiones Atmosféricas - Trimestre III',
      category: 'monitoreo',
      fileName: 'INFORME_MONITOREO_AIRE_CH01_Q3_2026.pdf',
      fileSizeKb: 1420,
      uploadDate: '2026-10-28',
      version: '1.0',
      uploadedBy: 'Ing. Valeria Mendoza'
    },
    {
      id: 'doc-802',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      title: 'Declaración de Impacto Ambiental (DIA) Aprobada R.D. 049-2023-PRODUCE',
      category: 'licencia',
      fileName: 'RESOLUCION_DIRECTORAL_DIA_LURIN.pdf',
      fileSizeKb: 3840,
      uploadDate: '2025-02-10',
      version: 'Oficial',
      uploadedBy: 'Gerencia Legal'
    },
    {
      id: 'doc-803',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      obligationId: 'ob-102',
      title: 'Manifiesto de Residuos Peligrosos N° 2026-0891 - Lodos PTAR',
      category: 'manifiesto',
      fileName: 'MANIFIESTO_SIGERSOL_LODOS_0891.pdf',
      fileSizeKb: 650,
      uploadDate: '2026-11-01',
      version: '1.0',
      uploadedBy: 'Tec. Carlos Paredes'
    },
    {
      id: 'doc-804',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      obligationId: 'ob-105',
      title: 'Plan de Contingencias Ambientales y Respuesta a Emergencias 2026',
      category: 'politica',
      fileName: 'PLAN_CONTINGENCIAS_ICA_REV4.pdf',
      fileSizeKb: 2150,
      uploadDate: '2026-06-15',
      version: '4.0',
      uploadedBy: 'Ing. Valeria Mendoza'
    },
    {
      id: 'doc-805',
      organizationId: 'org-2',
      facilityId: 'fac-4',
      obligationId: 'ob-201',
      title: 'Estudio de Impacto Ambiental Detallado Fundición Callao',
      category: 'licencia',
      fileName: 'EIA_D_MINEM_CALLAO_2021_085.pdf',
      fileSizeKb: 4210,
      uploadDate: '2026-09-18',
      version: '1.0',
      uploadedBy: 'Ing. Valeria Mendoza'
    }
  ],
  evidences: [
    {
      id: 'ev-01',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'residuos',
      entityId: 'w-201',
      title: 'Rotulado de Cilindros y Almacén de Lodos Peligrosos',
      description: 'Cilindros metálicos de 55 galones con rombo NFPA 704 y código de colores NTP 900.058.',
      date: '2026-11-01',
      category: 'Almacenamiento de Residuos',
      observations: 'Inspeccionado por área de SSOMA. Buen estado de tapas y precintos.',
      fileName: 'FOTO_RESIDUOS_ROTULADO_01.jpg',
      fileSizeKb: 1240,
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%230f172a"/><rect x="40" y="40" width="520" height="320" rx="12" fill="%231e293b" stroke="%23334155" stroke-width="2"/><circle cx="160" cy="180" r="60" fill="%23e11d48"/><circle cx="300" cy="180" r="60" fill="%23f59e0b"/><circle cx="440" cy="180" r="60" fill="%232563eb"/><text x="160" y="185" font-family="sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">NFPA</text><text x="300" y="185" font-family="sans-serif" font-size="24" font-weight="bold" fill="white" text-anchor="middle">LODOS</text><text x="440" y="185" font-family="sans-serif" font-size="24" font-weight="bold" fill="white" text-anchor="middle">PTAR</text><text x="300" y="290" font-family="sans-serif" font-size="14" fill="%2394a3b8" text-anchor="middle">ALMACÉN CENTRAL DE RESIDUOS PELIGROSOS - LURÍN</text></svg>',
      uploadedBy: 'Tec. Carlos Paredes',
      uploadedAt: '2026-11-01 10:15:00'
    },
    {
      id: 'ev-02',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'aire',
      entityId: 'air-401',
      title: 'Plataforma de Muestreo Isocinético Chimenea CH-01',
      description: 'Puertos normalizados EPA Método 1 y barandillas de seguridad en chimenea principal.',
      date: '2026-10-25',
      category: 'Monitoreo de Emisiones',
      observations: 'Punto de toma de muestra acreditado ante INACAL para SO2, NOx y PM10.',
      fileName: 'FOTO_CHIMENEA_PLATAFORMA_CH01.jpg',
      fileSizeKb: 1820,
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%23064e3b"/><rect x="250" y="50" width="100" height="300" fill="%23475569"/><rect x="200" y="150" width="200" height="20" fill="%2394a3b8"/><line x1="200" y1="150" x2="200" y2="120" stroke="%23cbd5e1" stroke-width="4"/><line x1="400" y1="150" x2="400" y2="120" stroke="%23cbd5e1" stroke-width="4"/><line x1="200" y1="120" x2="400" y2="120" stroke="%23cbd5e1" stroke-width="4"/><text x="300" y="250" font-family="sans-serif" font-size="18" font-weight="bold" fill="white" text-anchor="middle">CHIMENEA CH-01</text><text x="300" y="320" font-family="sans-serif" font-size="13" fill="%23a7f3d0" text-anchor="middle">PUERTO EPA MÉTODO 1 - MONITOREO DE AIRE</text></svg>',
      uploadedBy: 'Ing. Valeria Mendoza',
      uploadedAt: '2026-10-25 15:40:00'
    },
    {
      id: 'ev-03',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'energia',
      entityId: 'en-501',
      title: 'Medidor Multifunción Eléctrico en Subestación Principal',
      description: 'Lectura de energía activa, reactiva y demanda máxima en barra de 10 kV.',
      date: '2026-10-26',
      category: 'Gestión Energética',
      observations: 'Verificación fotográfica de lectura de kWh para contraste con recibo de luz.',
      fileName: 'FOTO_MEDIDOR_ELECTRICO_SUB.jpg',
      fileSizeKb: 980,
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%231e1b4b"/><rect x="150" y="80" width="300" height="240" rx="16" fill="%23312e81" stroke="%234338ca" stroke-width="4"/><rect x="180" y="110" width="240" height="70" rx="8" fill="%230f172a"/><text x="300" y="155" font-family="monospace" font-size="32" font-weight="bold" fill="%2338bdf8" text-anchor="middle">018500 kWh</text><text x="300" y="230" font-family="sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">MEDIDOR TELEMÉTRICO ION 7650</text><text x="300" y="270" font-family="sans-serif" font-size="12" fill="%23a5b4fc" text-anchor="middle">SUBESTACIÓN ELÉCTRICA PLANTA LURÍN</text></svg>',
      uploadedBy: 'Tec. Carlos Paredes',
      uploadedAt: '2026-10-26 09:10:00'
    },
    {
      id: 'ev-04',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'documentos',
      entityId: 'doc-802',
      title: 'Carátula y Sello de Aprobación DIA PRODUCE',
      description: 'Resolución Directoral N° 049-2023-PRODUCE/DGAAMI que aprueba la DIA.',
      date: '2025-02-10',
      category: 'Licencias e Instrumentos IGA',
      observations: 'Documento original custodiado en archivo legal y escaneo digital en plataforma.',
      fileName: 'FOTO_SELLO_RESOLUCION_DIA.jpg',
      fileSizeKb: 1450,
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%23f8fafc"/><rect x="80" y="40" width="440" height="320" fill="white" stroke="%23cbd5e1" stroke-width="2"/><text x="300" y="90" font-family="serif" font-size="20" font-weight="bold" fill="%230f172a" text-anchor="middle">MINISTERIO DE LA PRODUCCIÓN</text><text x="300" y="120" font-family="sans-serif" font-size="14" font-weight="bold" fill="%23047857" text-anchor="middle">R.D. N° 049-2023-PRODUCE/DGAAMI</text><circle cx="300" cy="200" r="50" fill="none" stroke="%23e11d48" stroke-width="3" stroke-dasharray="6,4"/><text x="300" y="195" font-family="sans-serif" font-size="12" font-weight="bold" fill="%23e11d48" text-anchor="middle">PRODUCE</text><text x="300" y="215" font-family="sans-serif" font-size="11" font-weight="bold" fill="%23e11d48" text-anchor="middle">APROBADO</text><text x="300" y="290" font-family="sans-serif" font-size="12" fill="%2364748b" text-anchor="middle">CERTIFICACIÓN AMBIENTAL DIA - PLANTA LURÍN</text></svg>',
      uploadedBy: 'Lic. Andrea Benavides',
      uploadedAt: '2025-02-12 11:00:00'
    },
    {
      id: 'ev-05',
      organizationId: 'org-2',
      facilityId: 'fac-4',
      module: 'aire',
      entityId: 'air-406',
      title: 'Lavador de Gases y Campana de Extracción Horno F-01',
      description: 'Sistema de abatimiento húmedo en fundición continua Callao.',
      date: '2026-10-29',
      category: 'Monitoreo de Emisiones',
      observations: 'Presión diferencial verificada dentro del rango de diseño.',
      fileName: 'FOTO_LAVADOR_HORNO_F01.jpg',
      fileSizeKb: 1120,
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%231e293b"/><rect x="120" y="70" width="360" height="260" rx="14" fill="%23334155" stroke="%2310b981" stroke-width="3"/><text x="300" y="185" font-family="sans-serif" font-size="22" font-weight="bold" fill="white" text-anchor="middle">LAVADOR DE GASES F-01</text><text x="300" y="230" font-family="sans-serif" font-size="13" fill="%236ee7b7" text-anchor="middle">METALMECÁNICA DEL PACÍFICO - CALLAO</text></svg>',
      uploadedBy: 'Ing. Valeria Mendoza',
      uploadedAt: '2026-10-29 14:20:00'
    }
  ],
  complianceDeclarations: [
    {
      id: 'cd-101',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'documentos',
      requirementTitle: 'Certificación Ambiental Aprobada (DIA)',
      requirementCode: 'REQ-DOC-01',
      obligationId: 'ob-101',
      aspectEvaluated: 'Resolución Directoral R.D. 049-2023-PRODUCE vigente y accesible',
      status: 'cumple',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Dr. Roberto Santillán',
      evaluatorRole: 'auditor',
      observations: 'Instrumento de Gestión Ambiental aprobado y vigente sin observaciones administrativas.',
      evidenceIds: ['ev-04'],
      reviewStatus: 'aprobado_auditoria',
      history: [
        {
          timestamp: '2026-11-04 10:00:00',
          previousStatus: null,
          newStatus: 'cumple',
          changedBy: 'Dr. Roberto Santillán',
          justification: 'Evaluación inicial satisfactoria tras revisión de expediente R.D. 049-2023.',
          evidenceCount: 1
        }
      ]
    },
    {
      id: 'cd-102',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'documentos',
      requirementTitle: 'Póliza de Responsabilidad Civil Ambiental',
      requirementCode: 'REQ-DOC-02',
      obligationId: 'ob-104',
      aspectEvaluated: 'Cobertura de daños por sustancias peligrosas según Ley 28611',
      status: 'pendiente_verificacion',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Ing. Valeria Mendoza',
      evaluatorRole: 'admin',
      observations: 'La póliza anterior venció en octubre; el endoso de renovación está en trámite con la aseguradora.',
      evidenceIds: [],
      reviewStatus: 'en_revision',
      history: [
        {
          timestamp: '2026-11-04 10:15:00',
          previousStatus: null,
          newStatus: 'pendiente_verificacion',
          changedBy: 'Ing. Valeria Mendoza',
          justification: 'Pendiente emisión de póliza actualizada por la aseguradora Rimac.',
          evidenceCount: 0
        }
      ]
    },
    {
      id: 'cd-103',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'documentos',
      requirementTitle: 'Plan de Cierre y Desmantelamiento Minero',
      requirementCode: 'REQ-DOC-03',
      aspectEvaluated: 'Garantías financieras y plan de pasivos mineros D.S. 033-2005-EM',
      status: 'no_aplica',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Ing. Valeria Mendoza',
      evaluatorRole: 'admin',
      observations: 'La actividad productiva es industrial manufacturera y agropecuaria; no aplica marco legal minero.',
      evidenceIds: [],
      reviewStatus: 'aprobado_auditoria',
      history: [
        {
          timestamp: '2026-11-04 10:20:00',
          previousStatus: null,
          newStatus: 'no_aplica',
          changedBy: 'Ing. Valeria Mendoza',
          justification: 'Sector agroindustrial no sujeto a normativa de cierre minero.',
          evidenceCount: 0
        }
      ]
    },
    {
      id: 'cd-201',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'residuos',
      requirementTitle: 'Segregación y Etiquetado según NTP 900.058',
      requirementCode: 'REQ-RES-01',
      obligationId: 'ob-102',
      aspectEvaluated: 'Rotulación de cilindros, código de colores y rombo NFPA en residuos peligrosos',
      status: 'cumple',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Dr. Roberto Santillán',
      evaluatorRole: 'auditor',
      observations: 'Se verificó en almacén central que el 100% de los cilindros cuentan con rótulo y fecha de ingreso.',
      evidenceIds: ['ev-01'],
      reviewStatus: 'aprobado_auditoria',
      history: [
        {
          timestamp: '2026-11-04 11:00:00',
          previousStatus: null,
          newStatus: 'cumple',
          changedBy: 'Dr. Roberto Santillán',
          justification: 'Inspección física en terreno conforme a la Norma Técnica Peruana.',
          evidenceCount: 1
        }
      ]
    },
    {
      id: 'cd-202',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'residuos',
      requirementTitle: 'Almacenamiento Temporal con Contención Secundaria',
      requirementCode: 'REQ-RES-02',
      aspectEvaluated: 'Capacidad del cubeto >= 110% en cilindros de lubricantes y solventes usados',
      status: 'cumplimiento_parcial',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Dr. Roberto Santillán',
      evaluatorRole: 'auditor',
      observations: 'Almacén central cumple al 100%. Sin embargo, en el taller auxiliar se detectaron 2 cilindros sobre piso sin bandeja de contención (CAPA-701 en curso).',
      evidenceIds: ['ev-01'],
      reviewStatus: 'en_revision',
      history: [
        {
          timestamp: '2026-11-04 11:15:00',
          previousStatus: null,
          newStatus: 'cumplimiento_parcial',
          changedBy: 'Dr. Roberto Santillán',
          justification: 'Falta bandeja en taller auxiliar; compra de bandejas Justrite ya tramitada.',
          evidenceCount: 1
        }
      ]
    },
    {
      id: 'cd-203',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'residuos',
      requirementTitle: 'Transporte y Disposición por Empresa Operadora Autorizada',
      requirementCode: 'REQ-RES-03',
      aspectEvaluated: 'Manifiestos SIGERSOL firmados por TransAmbiental Perú y Petramás',
      status: 'cumple',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Tec. Carlos Paredes',
      evaluatorRole: 'operador',
      observations: 'Manifiestos N° MAN-2026-0891 y 0892 cuentan con sello de recepción y autorización ministerial.',
      evidenceIds: ['ev-01'],
      reviewStatus: 'aprobado_auditoria',
      history: [
        {
          timestamp: '2026-11-04 11:30:00',
          previousStatus: null,
          newStatus: 'cumple',
          changedBy: 'Tec. Carlos Paredes',
          justification: 'Verificada vigencia de registro EO-RS en plataforma MINAM.',
          evidenceCount: 1
        }
      ]
    },
    {
      id: 'cd-301',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'aire',
      requirementTitle: 'LMP en Chimenea de Caldera Pirotubular CH-01',
      requirementCode: 'REQ-AIR-01',
      obligationId: 'ob-101',
      aspectEvaluated: 'Monitoreo de SO2, NOx y PM10 según D.S. 003-2017-MINAM',
      status: 'cumple',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Dr. Roberto Santillán',
      evaluatorRole: 'auditor',
      observations: 'Lecturas de SO2 (142 mg/Nm3) y PM10 (48.5 mg/Nm3) se encuentran dentro del rango permisible.',
      evidenceIds: ['ev-02'],
      reviewStatus: 'aprobado_auditoria',
      history: [
        {
          timestamp: '2026-11-04 12:00:00',
          previousStatus: null,
          newStatus: 'cumple',
          changedBy: 'Dr. Roberto Santillán',
          justification: 'Informe de ensayo de laboratorio acreditado conforme.',
          evidenceCount: 1
        }
      ]
    },
    {
      id: 'cd-302',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'aire',
      requirementTitle: 'Emisiones de Monóxido de Carbono (CO) en Horno HD-02',
      requirementCode: 'REQ-AIR-02',
      aspectEvaluated: 'Concentración de CO frente al límite referencial de 150 mg/Nm3',
      status: 'no_cumple',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Ing. Valeria Mendoza',
      evaluatorRole: 'admin',
      observations: 'Medición arrojó 185 mg/Nm3, superando el límite establecido por descalibración del quemador (CAPA-702 abierta).',
      evidenceIds: ['ev-02'],
      reviewStatus: 'en_revision',
      history: [
        {
          timestamp: '2026-11-04 12:15:00',
          previousStatus: null,
          newStatus: 'no_cumple',
          changedBy: 'Ing. Valeria Mendoza',
          justification: 'Excedencia confirmada en reporte de monitoreo Q3; programada calibración urgente.',
          evidenceCount: 1
        }
      ]
    },
    {
      id: 'cd-303',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      module: 'aire',
      requirementTitle: 'Calibración de Sensores de Detección de Fugas de Amoníaco',
      requirementCode: 'REQ-AIR-03',
      aspectEvaluated: 'Calibración anual con gas patrón trazable a INACAL',
      status: 'pendiente_verificacion',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Tec. Carlos Paredes',
      evaluatorRole: 'operador',
      observations: 'Servicio de calibración ejecutado la semana pasada; pendiente recepción formal de los certificados.',
      evidenceIds: [],
      reviewStatus: 'borrador',
      history: [
        {
          timestamp: '2026-11-04 12:30:00',
          previousStatus: null,
          newStatus: 'pendiente_verificacion',
          changedBy: 'Tec. Carlos Paredes',
          justification: 'Pendiente de adjuntar certificados del proveedor de calibración.',
          evidenceCount: 0
        }
      ]
    },
    {
      id: 'cd-401',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'energia',
      requirementTitle: 'Factor de Emisión SEIN y Huella Alcance 2 Verificada',
      requirementCode: 'REQ-EN-01',
      aspectEvaluated: 'Cálculo de tCO2e utilizando factor oficial del Ministerio de Energía y Minas (0.385 tCO2e/MWh)',
      status: 'cumple',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Ing. Valeria Mendoza',
      evaluatorRole: 'admin',
      observations: 'Cálculo metodológico alineado con GHG Protocol Corporate Standard.',
      evidenceIds: ['ev-03'],
      reviewStatus: 'aprobado_auditoria',
      history: [
        {
          timestamp: '2026-11-04 13:00:00',
          previousStatus: null,
          newStatus: 'cumple',
          changedBy: 'Ing. Valeria Mendoza',
          justification: 'Metodología GHG Protocol documentada y contrastada.',
          evidenceCount: 1
        }
      ]
    },
    {
      id: 'cd-402',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'energia',
      requirementTitle: 'Meta Interna de Reducción de Consumo Diésel (-15%)',
      requirementCode: 'REQ-EN-02',
      aspectEvaluated: 'Desplazamiento de generadores de combustión fósil mediante conexión en horas punta',
      status: 'cumplimiento_parcial',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Tec. Carlos Paredes',
      evaluatorRole: 'operador',
      observations: 'Se alcanzó una reducción del 8.5% en lugar del 15% proyectado debido a mantenimientos de red externa.',
      evidenceIds: ['ev-03'],
      reviewStatus: 'en_revision',
      history: [
        {
          timestamp: '2026-11-04 13:15:00',
          previousStatus: null,
          newStatus: 'cumplimiento_parcial',
          changedBy: 'Tec. Carlos Paredes',
          justification: 'Avance del 8.5% registrado frente a la meta del 15%.',
          evidenceCount: 1
        }
      ]
    },
    {
      id: 'cd-403',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'energia',
      requirementTitle: 'Monitoreo de Autogeneración Solar Fotovoltaica',
      requirementCode: 'REQ-EN-03',
      aspectEvaluated: 'Cumplimiento de la meta de >20% de aporte renovable in situ',
      status: 'cumple',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Ing. Valeria Mendoza',
      evaluatorRole: 'admin',
      observations: 'El parque solar en techo aportó el 21.1% del consumo global en el período evaluado.',
      evidenceIds: ['ev-03'],
      reviewStatus: 'aprobado_auditoria',
      history: [
        {
          timestamp: '2026-11-04 13:30:00',
          previousStatus: null,
          newStatus: 'cumple',
          changedBy: 'Ing. Valeria Mendoza',
          justification: 'Cálculo contrastado con medidor bidireccional.',
          evidenceCount: 1
        }
      ]
    },
    {
      id: 'cd-501',
      organizationId: 'org-2',
      facilityId: 'fac-4',
      module: 'aire',
      requirementTitle: 'Eficiencia de Lavador de Gases en Horno de Inducción F-01',
      requirementCode: 'REQ-MM-AIR-01',
      obligationId: 'ob-201',
      aspectEvaluated: 'Material particulado PM10 y gases metálicos dentro de LMP D.S. 003-2017-MINAM',
      status: 'cumple',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Dr. Roberto Santillán',
      evaluatorRole: 'auditor',
      observations: 'Medición registrada de 36.2 mg/Nm3 frente a límite de 50 mg/Nm3.',
      evidenceIds: ['ev-05'],
      reviewStatus: 'aprobado_auditoria',
      history: [
        {
          timestamp: '2026-11-04 14:00:00',
          previousStatus: null,
          newStatus: 'cumple',
          changedBy: 'Dr. Roberto Santillán',
          justification: 'Monitoreo isocinético conforme en Fundición Callao.',
          evidenceCount: 1
        }
      ]
    },
    {
      id: 'cd-502',
      organizationId: 'org-2',
      facilityId: 'fac-5',
      module: 'residuos',
      requirementTitle: 'Disposición de Escorias y Lodos de Baños Ácidos',
      requirementCode: 'REQ-MM-RES-01',
      aspectEvaluated: 'Manifiesto de seguridad y trazabilidad EO-RS en Ventanilla',
      status: 'cumplimiento_parcial',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Ing. Valeria Mendoza',
      evaluatorRole: 'admin',
      observations: 'Escorias dispuestas conforme; pendiente manifiesto de retorno de lodos de zincado.',
      evidenceIds: [],
      reviewStatus: 'en_revision',
      history: [
        {
          timestamp: '2026-11-04 14:15:00',
          previousStatus: null,
          newStatus: 'cumplimiento_parcial',
          changedBy: 'Ing. Valeria Mendoza',
          justification: 'Pendiente cierre documental de lote de lodos de planta Ventanilla.',
          evidenceCount: 0
        }
      ]
    }
  ],
  calendarEvents: [
    {
      id: 'cal-101',
      orgId: 'org-1',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      title: 'Comité Mensual de Cumplimiento Ambiental & ESG',
      category: 'reunion',
      date: '2026-11-18',
      startTime: '09:00',
      endTime: '10:30',
      location: 'Sala Directorio - Planta Principal Lurín',
      responsible: 'Ing. Valeria Mendoza',
      participants: 'Gerencia de Planta, Jefatura SSOMA, Auditoría Interna',
      description: 'Revisión de indicadores de residuos peligrosos, avance de acciones correctivas CAPA y preparación ante fiscalización OEFA.',
      status: 'programada',
      createdAt: '2026-11-10T10:00:00Z',
      updatedAt: '2026-11-10T10:00:00Z'
    },
    {
      id: 'cal-102',
      orgId: 'org-1',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      title: 'Visita Técnica a Planta Solar Térmica y PTAR Ica',
      category: 'visita_tecnica',
      date: '2026-11-18',
      startTime: '14:30',
      endTime: '17:00',
      location: 'Complejo Agroindustrial Ica - Sector PTAR',
      responsible: 'Dr. Roberto Santillán',
      participants: 'Especialista Hídrico, Jefe de Mantenimiento Ica',
      description: 'Verificación técnica de caudales de reúso agrícola, calibración de caudalímetros y toma de muestras testigo de efluentes.',
      status: 'programada',
      createdAt: '2026-11-11T09:00:00Z',
      updatedAt: '2026-11-11T09:00:00Z'
    },
    {
      id: 'cal-103',
      orgId: 'org-1',
      organizationId: 'org-1',
      facilityId: 'fac-2',
      title: 'Viaje de Supervisión Operativa Lima – Ica',
      category: 'viaje',
      date: '2026-11-20',
      startTime: '06:30',
      endTime: '18:30',
      location: 'Ruta Panamericana Sur Km 298 - Valle de Villacurí, Ica',
      responsible: 'Ing. Valeria Mendoza',
      participants: 'Ing. Valeria Mendoza, Tec. Carlos Paredes',
      description: 'Traslado de equipo técnico para levantamiento de observaciones en zona de deshidratado solar y auditoría de almacén temporal.',
      status: 'programada',
      createdAt: '2026-11-12T11:20:00Z',
      updatedAt: '2026-11-12T11:20:00Z'
    },
    {
      id: 'cal-104',
      orgId: 'org-1',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      title: 'Inspección de Almacén Central de Residuos Peligrosos',
      category: 'inspeccion',
      date: '2026-11-24',
      startTime: '10:00',
      endTime: '12:00',
      location: 'Patio de Maniobras Sur - Planta Lurín',
      responsible: 'Dr. Roberto Santillán',
      participants: 'Auditor Ambiental, Supervisor de Almacén',
      description: 'Inspección inopinada de rotulado NFPA, bandejas de contención antiderrames, hojas MSDS y control de acceso.',
      status: 'programada',
      createdAt: '2026-11-12T14:00:00Z',
      updatedAt: '2026-11-12T14:00:00Z'
    },
    {
      id: 'cal-105',
      orgId: 'org-1',
      organizationId: 'org-1',
      facilityId: 'fac-3',
      title: 'Charla Operativa: Segregación de Residuos y Respuesta ante Derrames',
      category: 'charla',
      date: '2026-11-27',
      startTime: '15:00',
      endTime: '16:30',
      location: 'Auditorio Logístico - CD Huachipa',
      responsible: 'Tec. Carlos Paredes',
      participants: '24 operarios de cámara de frío, logística y despacho',
      description: 'Capacitación práctica con simulacro de contención primaria de aceites refrigerantes y código de colores NTP 900.058.',
      status: 'programada',
      createdAt: '2026-11-13T08:15:00Z',
      updatedAt: '2026-11-13T08:15:00Z'
    },
    {
      id: 'cal-106',
      orgId: 'org-1',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      title: 'Reunión de Cierre de Auditoría Trimestral Q4',
      category: 'reunion',
      date: '2026-11-12',
      startTime: '11:00',
      endTime: '12:15',
      location: 'Sala Virtual & Lurín',
      responsible: 'Ing. Valeria Mendoza',
      participants: 'Dirección Ejecutiva, Consultora Externa',
      description: 'Presentación de resultados de monitoreo atmosférico en caldera N°2 y aprobación de presupuesto de filtros.',
      status: 'completada',
      createdAt: '2026-11-02T09:00:00Z',
      updatedAt: '2026-11-12T13:00:00Z'
    },
    {
      id: 'cal-107',
      orgId: 'org-1',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      title: 'Visita Técnica Laboratorio Acreditado INACAL (Aire & Ruido)',
      category: 'visita_tecnica',
      date: '2026-12-03',
      startTime: '08:00',
      endTime: '16:00',
      location: 'Chimenea Caldera Principal & Perímetro Lurín',
      responsible: 'Tec. Carlos Paredes',
      participants: 'Equipo de Monitoreo SGS, SSOMA Lurín',
      description: 'Muestreo isocinético semestral de material particulado, NOx, SO2 y medición de ruido ambiental diurno/nocturno.',
      status: 'programada',
      createdAt: '2026-11-14T16:00:00Z',
      updatedAt: '2026-11-14T16:00:00Z'
    },
    {
      id: 'cal-201',
      orgId: 'org-2',
      organizationId: 'org-2',
      facilityId: 'fac-4',
      title: 'Inspección Técnica de Lavador de Gases y Campanas',
      category: 'inspeccion',
      date: '2026-11-19',
      startTime: '09:30',
      endTime: '11:30',
      location: 'Nave de Fundición 1 - Callao',
      responsible: 'Dr. Roberto Santillán',
      participants: 'Jefe de Fundición, Supervisor Ambiental Callao',
      description: 'Verificación de caída de presión en mangas filtrantes, pH de solución lavadora y estanqueidad de ductos.',
      status: 'programada',
      createdAt: '2026-11-10T12:00:00Z',
      updatedAt: '2026-11-10T12:00:00Z'
    },
    {
      id: 'cal-202',
      orgId: 'org-2',
      organizationId: 'org-2',
      facilityId: 'fac-5',
      title: 'Charla de Manejo Seguro de Lodos de Galvanoplastia',
      category: 'charla',
      date: '2026-11-25',
      startTime: '16:00',
      endTime: '17:15',
      location: 'Sala Capacitación - Planta Ventanilla',
      responsible: 'Ing. Valeria Mendoza',
      participants: 'Personal de baños electrolíticos y tratamiento químico',
      description: 'Reforzamiento en uso de EPP químico, trazabilidad de Big Bags y registro de manifiestos de residuos peligrosos.',
      status: 'programada',
      createdAt: '2026-11-11T15:00:00Z',
      updatedAt: '2026-11-11T15:00:00Z'
    }
  ] as any[],
  geotechProjects: createInitialGeotechProjects(),
  geotechJobs: [],
  geotechBenchmarks: [],
  geotechBackups: [],
  auditLogs: [
    {
      id: 'aud-901',
      organizationId: 'org-1',
      timestamp: '2026-11-04 18:32:10',
      userName: 'Ing. Valeria Mendoza',
      userRole: 'admin',
      action: 'CREACION_REGISTRO',
      module: 'Residuos',
      details: 'Registrado manifiesto de lodos PTAR (1,450 kg) en Planta Lurín.'
    },
    {
      id: 'aud-902',
      organizationId: 'org-1',
      timestamp: '2026-11-04 19:15:42',
      userName: 'Dr. Roberto Santillán',
      userRole: 'auditor',
      action: 'CIERRE_INSPECCION',
      module: 'Inspecciones',
      details: 'Concluida inspección trimestral con score 84/100 y 2 hallazgos formulados.'
    },
    {
      id: 'aud-903',
      organizationId: 'org-1',
      timestamp: '2026-11-04 19:50:00',
      userName: 'Tec. Carlos Paredes',
      userRole: 'operador',
      action: 'ACTUALIZACION_ESTADO',
      module: 'Acciones Correctivas',
      details: 'Actualizada acción CAPA-701 a estado "En Implementación".'
    },
    {
      id: 'aud-904',
      organizationId: 'org-2',
      timestamp: '2026-11-04 14:20:00',
      userName: 'Dr. Roberto Santillán',
      userRole: 'auditor',
      action: 'CREACION_INSPECCION',
      module: 'Inspecciones',
      details: 'Registrada inspección de campanas y lavador de gases en Fundición Callao.'
    }
  ],
  subscriptions: {
    starter: {
      planId: 'starter',
      planName: 'Starter Eco',
      monthlyPriceUsd: 149,
      maxFacilities: 1,
      maxUsers: 3,
      maxStorageMb: 500,
      features: [
        'Gestión de 1 Instalación',
        'Matriz de Obligaciones Ambientales',
        'Registro de Residuos y Agua',
        'Exportación CSV estándar',
        'Soporte por correo'
      ]
    },
    pro: {
      planId: 'pro',
      planName: 'Pro Compliance & ESG',
      monthlyPriceUsd: 250,
      maxFacilities: 5,
      maxUsers: 15,
      maxStorageMb: 5000,
      features: [
        'Hasta 5 Instalaciones multi-sede',
        'Gestión completa de Aire, Residuos, Agua y Energía',
        'Inspecciones en campo y módulo CAPA',
        'Biblioteca de Evidencias y Documentos',
        'Generación de Informes Ejecutivos PDF oficiales',
        'Asistente de Inteligencia Ambiental Determinístico',
        'Trazabilidad y Auditoría de Permisos (RBAC)'
      ]
    },
    enterprise: {
      planId: 'enterprise',
      planName: 'Enterprise Multi-Plant',
      monthlyPriceUsd: 450,
      maxFacilities: 25,
      maxUsers: 100,
      maxStorageMb: 50000,
      features: [
        'Instalaciones y sedes ilimitadas',
        'Usuarios ilimitados con roles personalizados',
        'Integraciones API directas',
        'Gestor de cuenta y soporte 24/7',
        'Auditorías consolidadas para corporativos internacionales'
      ]
    }
  }
};

class DatabaseManager {
  private db: DatabaseSchema;

  constructor() {
    this.ensureDataDir();
    this.db = this.load();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.evidences || parsed.evidences.length === 0) {
          parsed.evidences = INITIAL_DATABASE.evidences;
        }
        if (!parsed.complianceDeclarations || parsed.complianceDeclarations.length === 0) {
          parsed.complianceDeclarations = INITIAL_DATABASE.complianceDeclarations;
        }
        if (!parsed.calendarEvents || parsed.calendarEvents.length === 0) {
          parsed.calendarEvents = INITIAL_DATABASE.calendarEvents;
        }
        if (!parsed.geotechProjects || parsed.geotechProjects.length === 0) {
          parsed.geotechProjects = INITIAL_DATABASE.geotechProjects;
        } else {
          const seedById = new Map(INITIAL_DATABASE.geotechProjects.map(p => [p.id, p]));
          parsed.geotechProjects = parsed.geotechProjects.map((proj: any) => {
            const seed = seedById.get(proj.id);
            if (!seed) return proj;
            return {
              ...proj,
              modelGraphs: proj.modelGraphs?.length ? proj.modelGraphs : seed.modelGraphs,
              temporalFrames: proj.temporalFrames?.length ? proj.temporalFrames : seed.temporalFrames,
              iotSensors: proj.iotSensors?.length ? proj.iotSensors : seed.iotSensors,
              comments: proj.comments?.length ? proj.comments : seed.comments,
              approvals: proj.approvals?.length ? proj.approvals : seed.approvals,
              boreholes: (proj.boreholes || []).map((bh: any) => {
                const seedBh = (seed.boreholes || []).find((sb: any) => sb.id === bh.id);
                if (!seedBh) return bh;
                return {
                  ...bh,
                  cptProfile: bh.cptProfile?.length ? bh.cptProfile : seedBh.cptProfile,
                  labTests: bh.labTests?.length ? bh.labTests : seedBh.labTests,
                };
              }),
              publicationStatus: proj.publicationStatus || 'borrador',
              publicationHistory: proj.publicationHistory || [],
              reproPackages: proj.reproPackages || [],
              monitoringStations: proj.monitoringStations || [],
              objectKeys: proj.objectKeys || [],
            };
          });
        }
        if (!Array.isArray(parsed.geotechJobs)) {
          parsed.geotechJobs = [];
        }
        if (!Array.isArray(parsed.geotechBenchmarks)) {
          parsed.geotechBenchmarks = [];
        }
        if (!Array.isArray(parsed.geotechBackups)) {
          parsed.geotechBackups = [];
        }
        if (parsed.subscriptions?.pro) {
          parsed.subscriptions.pro.monthlyPriceUsd = INITIAL_DATABASE.subscriptions.pro.monthlyPriceUsd;
        }
        if (parsed.subscriptions?.enterprise) {
          parsed.subscriptions.enterprise.monthlyPriceUsd = INITIAL_DATABASE.subscriptions.enterprise.monthlyPriceUsd;
        }
        // Ensure org-2 sample data exists if previously empty
        const mergeMissingForOrg2 = (arrKey: keyof DatabaseSchema) => {
          const current = (parsed[arrKey] as any[]) || [];
          if (!current.some(item => item.organizationId === 'org-2')) {
            const org2Seed = (INITIAL_DATABASE[arrKey] as any[]).filter(item => item.organizationId === 'org-2');
            parsed[arrKey] = [...current, ...org2Seed];
          }
        };
        mergeMissingForOrg2('obligations');
        mergeMissingForOrg2('wasteRecords');
        mergeMissingForOrg2('waterRecords');
        mergeMissingForOrg2('airRecords');
        mergeMissingForOrg2('energyRecords');
        mergeMissingForOrg2('inspections');
        mergeMissingForOrg2('correctiveActions');
        mergeMissingForOrg2('documents');
        mergeMissingForOrg2('evidences');
        mergeMissingForOrg2('complianceDeclarations');
        mergeMissingForOrg2('calendarEvents');
        mergeMissingForOrg2('geotechProjects');
        mergeMissingForOrg2('auditLogs');
        return parsed;
      }
    } catch (e) {
      console.error('Error loading db.json, checking rolling backup before seed reset:', e);
      try {
        const rollingBak = path.join(DATA_DIR, 'backups', 'db_latest.bak.json');
        if (fs.existsSync(rollingBak)) {
          const bakParsed = JSON.parse(fs.readFileSync(rollingBak, 'utf-8'));
          this.save(bakParsed);
          return bakParsed;
        }
      } catch (bakErr) {
        console.error('Rolling backup recovery failed, initializing default:', bakErr);
      }
    }
    this.save(INITIAL_DATABASE);
    return JSON.parse(JSON.stringify(INITIAL_DATABASE));
  }

  public save(data?: DatabaseSchema) {
    if (data) {
      this.db = data;
    }
    this.ensureDataDir();
    const serialized = JSON.stringify(this.db, null, 2);
    const tmpFile = `${DB_FILE}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpFile, serialized, 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);

    const backupDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const rollingTmp = path.join(backupDir, `db_latest.tmp.${process.pid}.json`);
    const rollingPath = path.join(backupDir, 'db_latest.bak.json');
    fs.writeFileSync(rollingTmp, serialized, 'utf-8');
    fs.renameSync(rollingTmp, rollingPath);
  }

  public getDataDir(): string {
    return DATA_DIR;
  }

  public isStorageWritable(): boolean {
    try {
      this.ensureDataDir();
      const probeFile = path.join(DATA_DIR, `.rw_probe_${process.pid}`);
      fs.writeFileSync(probeFile, 'ok', 'utf-8');
      fs.unlinkSync(probeFile);
      return true;
    } catch {
      return false;
    }
  }

  public getDiskStats(): { diskFreeMb: number | null; diskTotalMb: number | null } {
    try {
      this.ensureDataDir();
      const stats = fs.statfsSync(DATA_DIR);
      const bsize = Number(stats.bsize || 4096);
      const freeMb = Math.round(((Number(stats.bavail) * bsize) / 1048576) * 10) / 10;
      const totalMb = Math.round(((Number(stats.blocks) * bsize) / 1048576) * 10) / 10;
      return { diskFreeMb: freeMb, diskTotalMb: totalMb };
    } catch {
      return { diskFreeMb: null, diskTotalMb: null };
    }
  }

  public getSystemBackupDir(): string {
    const dir = path.resolve(DATA_DIR, 'system_snapshots');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  public listSystemSnapshots(): Array<{
    id: string;
    label: string;
    createdAt: string;
    createdBy: string;
    dbSha256: string;
    dbByteSize: number;
    hasPostgisDump: boolean;
    postgisSha256: string | null;
    projectCount: number;
  }> {
    const base = this.getSystemBackupDir();
    const dirs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory());
    const out: Array<any> = [];
    for (const d of dirs) {
      const metaPath = path.join(base, d.name, 'manifest.json');
      if (fs.existsSync(metaPath)) {
        try {
          out.push(JSON.parse(fs.readFileSync(metaPath, 'utf-8')));
        } catch {
          // ignore malformed manifest directory
        }
      }
    }
    return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  public createSystemSnapshot(opts: { label?: string; createdBy: string; postgisSql?: string | null }) {
    const base = this.getSystemBackupDir();
    const id = `sysbkp-${Date.now()}`;
    const snapDir = path.resolve(base, id);
    if (!snapDir.startsWith(base + path.sep)) {
      throw new Error('Ruta de snapshot inválida.');
    }
    fs.mkdirSync(snapDir, { recursive: true });

    const dbPayload = JSON.stringify(this.db, null, 2);
    const dbSha256 = crypto.createHash('sha256').update(dbPayload, 'utf-8').digest('hex');
    const dbFile = path.join(snapDir, 'db_snapshot.json');
    fs.writeFileSync(dbFile, dbPayload, 'utf-8');

    let postgisSha256: string | null = null;
    let hasPostgisDump = false;
    if (opts.postgisSql && opts.postgisSql.trim().length > 0) {
      const pgFile = path.join(snapDir, 'postgis_dump.sql');
      fs.writeFileSync(pgFile, opts.postgisSql, 'utf-8');
      postgisSha256 = crypto.createHash('sha256').update(opts.postgisSql, 'utf-8').digest('hex');
      hasPostgisDump = true;
    }

    const manifest = {
      id,
      label: opts.label || `Snapshot Sistema ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
      createdAt: new Date().toISOString(),
      createdBy: opts.createdBy,
      dbSha256,
      dbByteSize: Buffer.byteLength(dbPayload, 'utf-8'),
      hasPostgisDump,
      postgisSha256,
      projectCount: (this.db.geotechProjects || []).length,
    };
    fs.writeFileSync(path.join(snapDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

    // Retention enforcement (keep latest N snapshots)
    const maxSnapshots = Math.max(3, Math.min(50, Number(process.env.MAX_SYSTEM_BACKUPS || 10)));
    const all = this.listSystemSnapshots();
    if (all.length > maxSnapshots) {
      for (const old of all.slice(maxSnapshots)) {
        const oldDir = path.resolve(base, old.id.replace(/[^a-zA-Z0-9_-]/g, ''));
        if (oldDir.startsWith(base + path.sep) && fs.existsSync(oldDir)) {
          fs.rmSync(oldDir, { recursive: true, force: true });
        }
      }
    }

    return manifest;
  }

  public restoreSystemSnapshot(snapshotId: string): {
    manifest: any;
    restoredDbSha256: string;
    hashVerified: boolean;
    postgisSql: string | null;
  } {
    const safeId = snapshotId.replace(/[^a-zA-Z0-9_-]/g, '');
    const base = this.getSystemBackupDir();
    const snapDir = path.resolve(base, safeId);
    if (!snapDir.startsWith(base + path.sep) || !fs.existsSync(snapDir)) {
      throw new Error('Snapshot del sistema no encontrado.');
    }
    const manifestPath = path.join(snapDir, 'manifest.json');
    const dbPath = path.join(snapDir, 'db_snapshot.json');
    if (!fs.existsSync(manifestPath) || !fs.existsSync(dbPath)) {
      throw new Error('Artefactos de snapshot incompletos.');
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const rawDb = fs.readFileSync(dbPath, 'utf-8');
    const actualSha = crypto.createHash('sha256').update(rawDb, 'utf-8').digest('hex');
    if (actualSha !== manifest.dbSha256) {
      throw new Error('Fallo de integridad SHA-256 en el snapshot de base de datos.');
    }
    const parsedDb = JSON.parse(rawDb) as DatabaseSchema;
    this.save(parsedDb);

    let postgisSql: string | null = null;
    const pgFile = path.join(snapDir, 'postgis_dump.sql');
    if (fs.existsSync(pgFile)) {
      const rawSql = fs.readFileSync(pgFile, 'utf-8');
      const pgSha = crypto.createHash('sha256').update(rawSql, 'utf-8').digest('hex');
      if (manifest.postgisSha256 && pgSha !== manifest.postgisSha256) {
        throw new Error('Fallo de integridad SHA-256 en el dump PostGIS del snapshot.');
      }
      postgisSql = rawSql;
    }

    return {
      manifest,
      restoredDbSha256: actualSha,
      hashVerified: true,
      postgisSql,
    };
  }

  public get(): DatabaseSchema {
    return this.db;
  }

  public resetToLaboratorySeed() {
    this.db = JSON.parse(JSON.stringify(INITIAL_DATABASE));
    this.save();
    return this.db;
  }

  public addAuditLog(organizationId: string, userName: string, userRole: string, action: string, module: string, details: string) {
    const log: AuditLog = {
      id: `aud-${Date.now()}`,
      organizationId,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      userName,
      userRole,
      action,
      module,
      details
    };
    this.db.auditLogs.unshift(log);
    if (this.db.auditLogs.length > 200) {
      this.db.auditLogs = this.db.auditLogs.slice(0, 200);
    }
    this.save();
    return log;
  }

  public saveGeotechObject(orgId: string, projectId: string, sha256: string, content: string | Buffer): {
    objectKey: string;
    localPath: string;
    byteSize: number;
  } {
    const baseDir = path.resolve(DATA_DIR, 'geotech_objects');
    const safeOrg = orgId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'org_default';
    const safeProj = projectId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'proj_default';
    const safeHash = sha256.replace(/[^a-f0-9]/gi, '').slice(0, 64) || `obj_${Date.now()}`;
    const dir = path.resolve(baseDir, safeOrg, safeProj);
    if (!dir.startsWith(baseDir + path.sep)) {
      throw new Error('Ruta de almacenamiento de objetos rechazada por política de seguridad.');
    }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.resolve(dir, `${safeHash}.json`);
    if (!filePath.startsWith(dir + path.sep)) {
      throw new Error('Nombre de archivo de objeto inválido.');
    }
    fs.writeFileSync(filePath, content);
    const stat = fs.statSync(filePath);
    return {
      objectKey: `s3://eco-geotech/${safeOrg}/${safeProj}/${safeHash}.json`,
      localPath: filePath,
      byteSize: stat.size,
    };
  }

  public readGeotechObject(orgId: string, projectId: string, sha256: string): string | null {
    const baseDir = path.resolve(DATA_DIR, 'geotech_objects');
    const safeOrg = orgId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'org_default';
    const safeProj = projectId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'proj_default';
    const safeHash = sha256.replace(/[^a-f0-9]/gi, '').slice(0, 64);
    if (!safeHash) return null;
    const filePath = path.resolve(baseDir, safeOrg, safeProj, `${safeHash}.json`);
    if (!filePath.startsWith(baseDir + path.sep) || !fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }
}

export const dbManager = new DatabaseManager();
