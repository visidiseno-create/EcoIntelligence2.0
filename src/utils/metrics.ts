/**
 * Core pure calculation and analytical logic for ECOINTELLIGENCE.
 * Designed to be deterministic, testable, and strictly decoupled from UI rendering.
 */

export interface Obligation {
  id: string;
  organizationId: string;
  facilityId?: string;
  title: string;
  normativeSource: string;
  jurisdiction: string;
  dueDate: string; // ISO string YYYY-MM-DD
  frequency: 'mensual' | 'trimestral' | 'semestral' | 'anual' | 'unica';
  responsible: string;
  status: 'cumplida' | 'en_progreso' | 'pendiente' | 'vencida';
  evidenceCount: number;
}

export interface WasteRecord {
  id: string;
  organizationId: string;
  facilityId: string;
  date: string;
  wasteName: string;
  category: 'peligroso' | 'no_peligroso' | 'reciclable' | 'organico' | 'raee';
  quantityKg: number;
  originProcess: string;
  carrier: string;
  destination: string;
  treatmentType: 'disposicion_final' | 'reciclaje' | 'incineracion' | 'compostaje';
}

export interface WaterRecord {
  id: string;
  organizationId: string;
  facilityId: string;
  date: string;
  source: 'red_publica' | 'pozo_subterraneo' | 'fuente_superficial' | 'agua_recirculada';
  volumeConsumedM3: number;
  volumeDischargedM3: number;
  dischargePermitCompliant: boolean;
}

export interface AirRecord {
  id: string;
  organizationId: string;
  facilityId: string;
  date: string;
  emissionSource: string;
  parameter: 'PM10' | 'PM2.5' | 'SO2' | 'NOx' | 'CO' | 'COV';
  measuredValue: number;
  limitValue: number;
  unit: string;
}

export interface EnergyRecord {
  id: string;
  organizationId: string;
  facilityId: string;
  date: string;
  sourceType: 'red_electrica' | 'solar_fotovoltaica' | 'diesel' | 'gas_natural';
  consumptionKWh: number;
  costUsd?: number;
}

export interface InspectionRecord {
  id: string;
  organizationId: string;
  facilityId: string;
  date: string;
  templateName: string;
  inspector: string;
  score: number; // 0-100
  status: 'completada' | 'en_progreso' | 'programada';
  findingsCount: {
    major: number;
    minor: number;
    opportunity: number;
  };
}

export interface CorrectiveAction {
  id: string;
  organizationId: string;
  facilityId: string;
  title: string;
  rootCause: string;
  proposedAction: string;
  responsible: string;
  deadline: string;
  status: 'abierta' | 'en_implementacion' | 'en_verificacion' | 'cerrada';
}

// 1. Compliance calculations
export function calculateComplianceRate(obligations: Obligation[], currentDate: string = '2026-11-04'): {
  total: number;
  fulfilled: number;
  inProgress: number;
  pending: number;
  overdue: number;
  complianceRatePercent: number;
} {
  const total = obligations.length;
  if (total === 0) {
    return { total: 0, fulfilled: 0, inProgress: 0, pending: 0, overdue: 0, complianceRatePercent: 100 };
  }

  let fulfilled = 0;
  let inProgress = 0;
  let pending = 0;
  let overdue = 0;

  for (const ob of obligations) {
    // If not fulfilled and past current date, it counts as overdue
    if (ob.status === 'cumplida') {
      fulfilled++;
    } else if (ob.dueDate < currentDate || ob.status === 'vencida') {
      overdue++;
    } else if (ob.status === 'en_progreso') {
      inProgress++;
    } else {
      pending++;
    }
  }

  const complianceRatePercent = Math.round((fulfilled / total) * 1000) / 10;
  return { total, fulfilled, inProgress, pending, overdue, complianceRatePercent };
}

// 2. Waste metrics
export function aggregateWasteMetrics(records: WasteRecord[]): {
  totalKg: number;
  hazardousKg: number;
  nonHazardousKg: number;
  recycledKg: number;
  recyclingRatePercent: number;
  byCategory: Record<string, number>;
} {
  let totalKg = 0;
  let hazardousKg = 0;
  let nonHazardousKg = 0;
  let recycledKg = 0;
  const byCategory: Record<string, number> = {};

  for (const r of records) {
    totalKg += r.quantityKg;
    byCategory[r.category] = (byCategory[r.category] || 0) + r.quantityKg;

    if (r.category === 'peligroso') {
      hazardousKg += r.quantityKg;
    } else {
      nonHazardousKg += r.quantityKg;
    }

    if (r.treatmentType === 'reciclaje' || r.treatmentType === 'compostaje') {
      recycledKg += r.quantityKg;
    }
  }

  const recyclingRatePercent = totalKg > 0 ? Math.round((recycledKg / totalKg) * 1000) / 10 : 0;
  return {
    totalKg: Math.round(totalKg * 10) / 10,
    hazardousKg: Math.round(hazardousKg * 10) / 10,
    nonHazardousKg: Math.round(nonHazardousKg * 10) / 10,
    recycledKg: Math.round(recycledKg * 10) / 10,
    recyclingRatePercent,
    byCategory
  };
}

// 3. Water metrics
export function aggregateWaterMetrics(records: WaterRecord[]): {
  totalConsumedM3: number;
  totalDischargedM3: number;
  recirculationRatePercent: number;
  complianceRatePercent: number;
} {
  let totalConsumedM3 = 0;
  let totalDischargedM3 = 0;
  let recirculatedM3 = 0;
  let compliantRecords = 0;

  for (const r of records) {
    totalConsumedM3 += r.volumeConsumedM3;
    totalDischargedM3 += r.volumeDischargedM3;
    if (r.source === 'agua_recirculada') {
      recirculatedM3 += r.volumeConsumedM3;
    }
    if (r.dischargePermitCompliant) {
      compliantRecords++;
    }
  }

  const recirculationRatePercent = totalConsumedM3 > 0 ? Math.round((recirculatedM3 / totalConsumedM3) * 1000) / 10 : 0;
  const complianceRatePercent = records.length > 0 ? Math.round((compliantRecords / records.length) * 1000) / 10 : 100;

  return {
    totalConsumedM3: Math.round(totalConsumedM3 * 10) / 10,
    totalDischargedM3: Math.round(totalDischargedM3 * 10) / 10,
    recirculationRatePercent,
    complianceRatePercent
  };
}

// 4. Air Emissions metrics
export function evaluateAirCompliance(records: AirRecord[]): {
  totalSamples: number;
  compliantSamples: number;
  exceededSamples: number;
  complianceRatePercent: number;
  exceedances: AirRecord[];
} {
  let compliantSamples = 0;
  const exceedances: AirRecord[] = [];

  for (const r of records) {
    if (r.measuredValue <= r.limitValue) {
      compliantSamples++;
    } else {
      exceedances.push(r);
    }
  }

  const totalSamples = records.length;
  const complianceRatePercent = totalSamples > 0 ? Math.round((compliantSamples / totalSamples) * 1000) / 10 : 100;

  return {
    totalSamples,
    compliantSamples,
    exceededSamples: exceedances.length,
    complianceRatePercent,
    exceedances
  };
}

// 5. Energy and Carbon metrics
export function calculateEnergyIntensity(records: EnergyRecord[]): {
  totalKWh: number;
  renewableKWh: number;
  renewableSharePercent: number;
  estimatedCo2Ton: number;
} {
  let totalKWh = 0;
  let renewableKWh = 0;

  // Emission factors (tCO2e per MWh approx: grid=0.385, solar=0, diesel=0.72, gas=0.48)
  let co2Kg = 0;

  for (const r of records) {
    totalKWh += r.consumptionKWh;
    if (r.sourceType === 'solar_fotovoltaica') {
      renewableKWh += r.consumptionKWh;
    } else if (r.sourceType === 'red_electrica') {
      co2Kg += (r.consumptionKWh / 1000) * 385;
    } else if (r.sourceType === 'diesel') {
      co2Kg += (r.consumptionKWh / 1000) * 720;
    } else if (r.sourceType === 'gas_natural') {
      co2Kg += (r.consumptionKWh / 1000) * 480;
    }
  }

  const renewableSharePercent = totalKWh > 0 ? Math.round((renewableKWh / totalKWh) * 1000) / 10 : 0;
  const estimatedCo2Ton = Math.round((co2Kg / 1000) * 100) / 100;

  return {
    totalKWh: Math.round(totalKWh),
    renewableKWh: Math.round(renewableKWh),
    renewableSharePercent,
    estimatedCo2Ton
  };
}

// 6. Deterministic Intelligence Assistant Engine
export interface AssistantResponse {
  query: string;
  category: 'cumplimiento' | 'residuos' | 'agua' | 'aire' | 'energia' | 'acciones' | 'general';
  summary: string;
  verifiedData: Array<{ label: string; value: string | number; sourceTable: string }>;
  normativeReferences: string[];
  recommendation: string;
  confidenceType: 'Dato Verificado de BD' | 'Cálculo Estadístico Determinístico';
}

export function answerEnvironmentalQuery(
  rawQuery: string,
  context: {
    obligations: Obligation[];
    waste: WasteRecord[];
    water: WaterRecord[];
    air: AirRecord[];
    energy: EnergyRecord[];
    actions: CorrectiveAction[];
  }
): AssistantResponse {
  const q = rawQuery.toLowerCase();

  // Route 1: Obligations / Compliance
  if (q.includes('venc') || q.includes('obligac') || q.includes('cumplimiento') || q.includes('legal') || q.includes('norma')) {
    const comp = calculateComplianceRate(context.obligations);
    const overdueList = context.obligations.filter(o => o.status === 'vencida' || o.dueDate < '2026-11-04');
    return {
      query: rawQuery,
      category: 'cumplimiento',
      summary: `La organización mantiene ${context.obligations.length} obligaciones registradas con un índice de cumplimiento del ${comp.complianceRatePercent}%. Actualmente existen ${comp.overdue} obligaciones vencidas y ${comp.inProgress} en curso.`,
      verifiedData: [
        { label: 'Total de Obligaciones', value: comp.total, sourceTable: 'obligaciones_ambientales' },
        { label: 'Tasa de Cumplimiento', value: `${comp.complianceRatePercent}%`, sourceTable: 'obligaciones_ambientales' },
        { label: 'Obligaciones Vencidas', value: comp.overdue, sourceTable: 'obligaciones_ambientales' },
        { label: 'Obligaciones en Progreso', value: comp.inProgress, sourceTable: 'obligaciones_ambientales' }
      ],
      normativeReferences: Array.from(new Set(context.obligations.map(o => o.normativeSource))).slice(0, 4),
      recommendation: overdueList.length > 0 
        ? `Priorizar de inmediato la subsanación de: "${overdueList[0].title}" (Venció: ${overdueList[0].dueDate}, Responsable: ${overdueList[0].responsible}) para mitigar contingencias sancionatorias.`
        : 'Mantener el cronograma de revisiones trimestrales y verificación de evidencias cargadas.',
      confidenceType: 'Dato Verificado de BD'
    };
  }

  // Route 2: Waste
  if (q.includes('residuo') || q.includes('peligros') || q.includes('basura') || q.includes('recicl')) {
    const w = aggregateWasteMetrics(context.waste);
    return {
      query: rawQuery,
      category: 'residuos',
      summary: `Se registran ${context.waste.length} manifiestos con una generación total de ${w.totalKg} kg. De este volumen, ${w.hazardousKg} kg corresponden a residuos peligrosos (${Math.round((w.hazardousKg / (w.totalKg || 1)) * 100)}%) y ${w.recycledKg} kg fueron enviados a valorización (${w.recyclingRatePercent}%).`,
      verifiedData: [
        { label: 'Generación Total (kg)', value: w.totalKg, sourceTable: 'registros_residuos' },
        { label: 'Residuos Peligrosos (kg)', value: w.hazardousKg, sourceTable: 'registros_residuos' },
        { label: 'Tasa de Valorización', value: `${w.recyclingRatePercent}%`, sourceTable: 'registros_residuos' }
      ],
      normativeReferences: ['Reglamento de Gestión Integral de Residuos Sólidos', 'Convenio de Basilea para Residuos Peligrosos'],
      recommendation: w.hazardousKg > 1000
        ? 'Verificar la vigencia de autorizaciones del operador de transporte y custodia de manifiestos con firma de recepción final.'
        : 'Excelente tasa de segregación. Continuar con el programa de capacitación de operarios en planta.',
      confidenceType: 'Cálculo Estadístico Determinístico'
    };
  }

  // Route 3: Water
  if (q.includes('agua') || q.includes('vertim') || q.includes('efluente') || q.includes('pozo')) {
    const wt = aggregateWaterMetrics(context.water);
    return {
      query: rawQuery,
      category: 'agua',
      summary: `El consumo acumulado de agua en el período es de ${wt.totalConsumedM3} m³ distribuidos en fuentes de pozo, red y recirculación. El efluente total generado es de ${wt.totalDischargedM3} m³ con un cumplimiento de parámetros de vertimiento del ${wt.complianceRatePercent}%.`,
      verifiedData: [
        { label: 'Consumo Total (m³)', value: wt.totalConsumedM3, sourceTable: 'registros_agua' },
        { label: 'Volumen Vertido (m³)', value: wt.totalDischargedM3, sourceTable: 'registros_agua' },
        { label: 'Tasa de Recirculación', value: `${wt.recirculationRatePercent}%`, sourceTable: 'registros_agua' },
        { label: 'Conformidad de Vertimiento', value: `${wt.complianceRatePercent}%`, sourceTable: 'registros_agua' }
      ],
      normativeReferences: ['Límites Máximos Permisibles para Vertimientos Industriales', 'Ley de Recursos Hídricos'],
      recommendation: 'Realizar calibración de caudalímetros y toma semestral de muestras acreditadas ISO 17025.',
      confidenceType: 'Dato Verificado de BD'
    };
  }

  // Route 4: Air & Emissions
  if (q.includes('aire') || q.includes('emision') || q.includes('chimenea') || q.includes('pm10') || q.includes('gases')) {
    const air = evaluateAirCompliance(context.air);
    return {
      query: rawQuery,
      category: 'aire',
      summary: `Se evaluaron ${air.totalSamples} mediciones isocinéticas y de calidad de aire. El índice de cumplimiento de límites permisibles es de ${air.complianceRatePercent}%. Se detectaron ${air.exceededSamples} desviaciones registradas.`,
      verifiedData: [
        { label: 'Muestreos Totales', value: air.totalSamples, sourceTable: 'registros_emisiones_aire' },
        { label: 'Conformes a Norma', value: air.compliantSamples, sourceTable: 'registros_emisiones_aire' },
        { label: 'Excedencias Detectadas', value: air.exceededSamples, sourceTable: 'registros_emisiones_aire' }
      ],
      normativeReferences: ['Estándares de Calidad Ambiental para Aire (ECA Aire)', 'Protocolo de Monitoreo de Emisiones Atmosféricas'],
      recommendation: air.exceededSamples > 0 
        ? `Revisar sistemas de captación y filtros de mangas en la fuente con excedencia: ${air.exceedances[0]?.emissionSource || 'Chimenea principal'}.`
        : 'Las concentraciones se mantienen dentro del rango seguro operativo.',
      confidenceType: 'Dato Verificado de BD'
    };
  }

  // Route 5: Energy
  if (q.includes('energia') || q.includes('kwh') || q.includes('carbon') || q.includes('electr') || q.includes('diesel')) {
    const en = calculateEnergyIntensity(context.energy);
    return {
      query: rawQuery,
      category: 'energia',
      summary: `Consumo total acumulado de ${en.totalKWh.toLocaleString()} kWh, con un aporte de energías renovables in situ del ${en.renewableSharePercent}%. La huella de carbono energética estimada es de ${en.estimatedCo2Ton} tCO2e.`,
      verifiedData: [
        { label: 'Consumo Energético Total', value: `${en.totalKWh.toLocaleString()} kWh`, sourceTable: 'registros_energia' },
        { label: 'Generación Renovable', value: `${en.renewableKWh.toLocaleString()} kWh`, sourceTable: 'registros_energia' },
        { label: 'Huella de Carbono Estimada', value: `${en.estimatedCo2Ton} tCO2e`, sourceTable: 'calculo_ghg_protocol' }
      ],
      normativeReferences: ['ISO 50001 - Sistema de Gestión Energética', 'GHG Protocol Corporate Standard (Scope 1 & 2)'],
      recommendation: 'Evaluar incremento de paneles solares fotovoltaicos para desplazar consumo de generadores diésel en horas punta.',
      confidenceType: 'Cálculo Estadístico Determinístico'
    };
  }

  // Route 6: Corrective Actions (CAPA) & Inspections
  if (q.includes('capa') || q.includes('accion') || q.includes('correctiv') || q.includes('hallazgo') || q.includes('inspeccion')) {
    const open = context.actions.filter(a => a.status === 'abierta' || a.status === 'en_implementacion');
    const inVerification = context.actions.filter(a => a.status === 'en_verificacion');
    const closed = context.actions.filter(a => a.status === 'cerrada');
    return {
      query: rawQuery,
      category: 'acciones',
      summary: `Se registran ${context.actions.length} acciones correctivas (CAPA): ${open.length} abiertas o en implementación, ${inVerification.length} en verificación y ${closed.length} cerradas formalmente.`,
      verifiedData: [
        { label: 'Total CAPA', value: context.actions.length, sourceTable: 'acciones_correctivas' },
        { label: 'Abiertas / En Curso', value: open.length, sourceTable: 'acciones_correctivas' },
        { label: 'En Verificación', value: inVerification.length, sourceTable: 'acciones_correctivas' },
        { label: 'Cerradas', value: closed.length, sourceTable: 'acciones_correctivas' }
      ],
      normativeReferences: ['ISO 14001:2015 Cláusula 10.2 (No conformidad y acción correctiva)'],
      recommendation: open.length > 0
        ? `Dar seguimiento prioritario a: "${open[0].title}" (Vence: ${open[0].deadline}, Responsable: ${open[0].responsible}).`
        : 'Todas las acciones correctivas han sido verificadas y cerradas.',
      confidenceType: 'Dato Verificado de BD'
    };
  }

  // Default / Overview
  const comp = calculateComplianceRate(context.obligations);
  const w = aggregateWasteMetrics(context.waste);
  const openActionsCount = context.actions.filter(a => a.status === 'abierta' || a.status === 'en_implementacion').length;
  return {
    query: rawQuery,
    category: 'general',
    summary: `Diagnóstico ambiental consolidado: Cumplimiento normativo al ${comp.complianceRatePercent}%, ${openActionsCount} acciones correctivas activas y ${w.totalKg} kg de residuos gestionados en el período.`,
    verifiedData: [
      { label: 'Obligaciones Activas', value: comp.total, sourceTable: 'obligaciones_ambientales' },
      { label: 'Cumplimiento Normativo', value: `${comp.complianceRatePercent}%`, sourceTable: 'obligaciones_ambientales' },
      { label: 'Residuos Totales (kg)', value: w.totalKg, sourceTable: 'registros_residuos' },
      { label: 'Acciones Correctivas Activas', value: openActionsCount, sourceTable: 'acciones_correctivas' }
    ],
    normativeReferences: ['Marco Legal Ambiental General', 'ISO 14001:2015 Sistemas de Gestión Ambiental'],
    recommendation: 'Consultar módulos específicos usando términos como: "vencimientos", "residuos peligrosos", "calidad de aire", "consumo de agua", "energía" o "acciones correctivas".',
    confidenceType: 'Dato Verificado de BD'
  };
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

// 7. Formal Compliance Declarations (5 Statuses & Audit Trail)
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

export interface ComplianceDeclarationStats {
  totalRequirements: number;
  evaluated: number;
  cumple: number;
  noCumple: number;
  cumplimientoParcial: number;
  pendienteVerificacion: number;
  noAplica: number;
  applicableTotal: number;
  applicableEvaluated: number;
  complianceRatePercent: number; // Evaluados aplicables: (cumple + 0.5 * parcial) / applicableEvaluated * 100
  strictComplianceRatePercent: number; // Solo cumple / applicableEvaluated * 100
  pendingEvidenceCount: number;
  byModule: Record<string, {
    total: number;
    cumple: number;
    noCumple: number;
    cumplimientoParcial: number;
    pendienteVerificacion: number;
    noAplica: number;
    complianceRatePercent: number;
  }>;
}

export function calculateComplianceDeclarationStats(declarations: ComplianceDeclaration[]): ComplianceDeclarationStats {
  let cumple = 0;
  let noCumple = 0;
  let cumplimientoParcial = 0;
  let pendienteVerificacion = 0;
  let noAplica = 0;
  let pendingEvidenceCount = 0;

  const byModule: Record<string, any> = {};

  for (const d of declarations) {
    if (!byModule[d.module]) {
      byModule[d.module] = {
        total: 0,
        cumple: 0,
        noCumple: 0,
        cumplimientoParcial: 0,
        pendienteVerificacion: 0,
        noAplica: 0,
        complianceRatePercent: 0
      };
    }
    byModule[d.module].total++;

    if (d.status === 'cumple') {
      cumple++;
      byModule[d.module].cumple++;
    } else if (d.status === 'no_cumple') {
      noCumple++;
      byModule[d.module].noCumple++;
    } else if (d.status === 'cumplimiento_parcial') {
      cumplimientoParcial++;
      byModule[d.module].cumplimientoParcial++;
    } else if (d.status === 'pendiente_verificacion') {
      pendienteVerificacion++;
      byModule[d.module].pendienteVerificacion++;
    } else if (d.status === 'no_aplica') {
      noAplica++;
      byModule[d.module].noAplica++;
    }

    if (d.status !== 'no_aplica' && (!d.evidenceIds || d.evidenceIds.length === 0)) {
      pendingEvidenceCount++;
    }
  }

  const totalRequirements = declarations.length;
  const applicableTotal = totalRequirements - noAplica;
  const applicableEvaluated = cumple + noCumple + cumplimientoParcial;
  const evaluated = applicableEvaluated;

  const complianceRatePercent = applicableEvaluated > 0
    ? Math.round(((cumple + 0.5 * cumplimientoParcial) / applicableEvaluated) * 1000) / 10
    : 0;

  const strictComplianceRatePercent = applicableEvaluated > 0
    ? Math.round((cumple / applicableEvaluated) * 1000) / 10
    : 0;

  for (const mod in byModule) {
    const m = byModule[mod];
    const mApp = m.cumple + m.noCumple + m.cumplimientoParcial;
    m.complianceRatePercent = mApp > 0
      ? Math.round(((m.cumple + 0.5 * m.cumplimientoParcial) / mApp) * 1000) / 10
      : 0;
  }

  return {
    totalRequirements,
    evaluated,
    cumple,
    noCumple,
    cumplimientoParcial,
    pendienteVerificacion,
    noAplica,
    applicableTotal,
    applicableEvaluated,
    complianceRatePercent,
    strictComplianceRatePercent,
    pendingEvidenceCount,
    byModule
  };
}

// 8. Image & Evidence Technical Controls
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml'
];

export const MAX_IMAGE_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB configurable

export function validateImageUpload(file: { name: string; size: number; mimeType: string }): { valid: boolean; error?: string } {
  const mime = (file.mimeType || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mime)) {
    return {
      valid: false,
      error: `Formato no permitido (${file.mimeType || 'desconocido'}). Formatos soportados: JPG, PNG, WEBP, GIF, SVG.`
    };
  }
  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `El archivo supera el tamaño técnico admisible de ${(MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB.`
    };
  }
  return { valid: true };
}

