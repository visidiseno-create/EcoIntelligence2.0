import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateComplianceRate,
  aggregateWasteMetrics,
  aggregateWaterMetrics,
  evaluateAirCompliance,
  calculateEnergyIntensity,
  answerEnvironmentalQuery,
  calculateComplianceDeclarationStats,
  validateImageUpload,
  formatBytes,
  MAX_IMAGE_FILE_SIZE_BYTES,
  type Obligation,
  type WasteRecord,
  type WaterRecord,
  type AirRecord,
  type EnergyRecord,
  type CorrectiveAction,
  type ComplianceDeclaration
} from './metrics';

test('calculateComplianceRate calculates correct ratios and counts', () => {
  const mockObligations: Obligation[] = [
    {
      id: 'ob-1',
      organizationId: 'org-1',
      title: 'Monitoreo de Ruido',
      normativeSource: 'D.S. 085-2003-PCM',
      jurisdiction: 'Nacional',
      dueDate: '2026-12-01',
      frequency: 'semestral',
      responsible: 'Ing. Carlos Soto',
      status: 'cumplida',
      evidenceCount: 2
    },
    {
      id: 'ob-2',
      organizationId: 'org-1',
      title: 'Declaración Anual de Residuos',
      normativeSource: 'D.L. 1278',
      jurisdiction: 'Nacional',
      dueDate: '2026-10-15',
      frequency: 'anual',
      responsible: 'Lic. Ana Reyes',
      status: 'vencida',
      evidenceCount: 0
    },
    {
      id: 'ob-3',
      organizationId: 'org-1',
      title: 'Calibración de Sensores de Efluentes',
      normativeSource: 'R.M. 011-2019-MINAM',
      jurisdiction: 'Sectorial',
      dueDate: '2026-11-20',
      frequency: 'mensual',
      responsible: 'Tec. Marco Silva',
      status: 'en_progreso',
      evidenceCount: 1
    },
    {
      id: 'ob-4',
      organizationId: 'org-1',
      title: 'Inspección de Almacén de Sustancias Peligrosas',
      normativeSource: 'D.S. 015-2005-SA',
      jurisdiction: 'Nacional',
      dueDate: '2026-11-28',
      frequency: 'mensual',
      responsible: 'Ing. Carlos Soto',
      status: 'pendiente',
      evidenceCount: 0
    }
  ];

  const result = calculateComplianceRate(mockObligations, '2026-11-04');
  assert.equal(result.total, 4);
  assert.equal(result.fulfilled, 1);
  assert.equal(result.overdue, 1);
  assert.equal(result.inProgress, 1);
  assert.equal(result.pending, 1);
  assert.equal(result.complianceRatePercent, 25);
});

test('aggregateWasteMetrics computes totals, hazardous and recycling rate', () => {
  const mockWaste: WasteRecord[] = [
    {
      id: 'w-1',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-01',
      wasteName: 'Lodos de PTAR',
      category: 'peligroso',
      quantityKg: 500,
      originProcess: 'Planta de Tratamiento',
      carrier: 'TransAmbiental S.A.C.',
      destination: 'Relleno de Seguridad Huaycoloro',
      treatmentType: 'disposicion_final'
    },
    {
      id: 'w-2',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-02',
      wasteName: 'Cartón y Embalajes',
      category: 'reciclable',
      quantityKg: 350,
      originProcess: 'Almacén Central',
      carrier: 'EcoRecicla EIRL',
      destination: 'Planta Papelera',
      treatmentType: 'reciclaje'
    },
    {
      id: 'w-3',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-03',
      wasteName: 'Aceites Usados',
      category: 'peligroso',
      quantityKg: 150,
      originProcess: 'Taller de Mantenimiento',
      carrier: 'OilTech Soluciones',
      destination: 'Planta de Regeneración',
      treatmentType: 'reciclaje'
    }
  ];

  const res = aggregateWasteMetrics(mockWaste);
  assert.equal(res.totalKg, 1000);
  assert.equal(res.hazardousKg, 650);
  assert.equal(res.nonHazardousKg, 350);
  assert.equal(res.recycledKg, 500); // 350 carton + 150 oil recycled
  assert.equal(res.recyclingRatePercent, 50);
});

test('aggregateWaterMetrics calculates consumption, effluent and recirculation', () => {
  const mockWater: WaterRecord[] = [
    {
      id: 'wt-1',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-01',
      source: 'pozo_subterraneo',
      volumeConsumedM3: 450,
      volumeDischargedM3: 380,
      dischargePermitCompliant: true
    },
    {
      id: 'wt-2',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-02',
      source: 'agua_recirculada',
      volumeConsumedM3: 150,
      volumeDischargedM3: 0,
      dischargePermitCompliant: true
    }
  ];

  const res = aggregateWaterMetrics(mockWater);
  assert.equal(res.totalConsumedM3, 600);
  assert.equal(res.totalDischargedM3, 380);
  assert.equal(res.recirculationRatePercent, 25);
  assert.equal(res.complianceRatePercent, 100);
});

test('evaluateAirCompliance detects limits and exceedances', () => {
  const mockAir: AirRecord[] = [
    {
      id: 'a-1',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-01',
      emissionSource: 'Caldera 01',
      parameter: 'SO2',
      measuredValue: 180,
      limitValue: 200,
      unit: 'mg/Nm3'
    },
    {
      id: 'a-2',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-02',
      emissionSource: 'Horno Principal',
      parameter: 'PM10',
      measuredValue: 125,
      limitValue: 100, // Exceeded!
      unit: 'mg/Nm3'
    }
  ];

  const res = evaluateAirCompliance(mockAir);
  assert.equal(res.totalSamples, 2);
  assert.equal(res.compliantSamples, 1);
  assert.equal(res.exceededSamples, 1);
  assert.equal(res.complianceRatePercent, 50);
  assert.equal(res.exceedances[0].parameter, 'PM10');
});

test('calculateEnergyIntensity aggregates total kWh, renewable share and carbon estimate', () => {
  const mockEnergy: EnergyRecord[] = [
    {
      id: 'e-1',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-01',
      sourceType: 'red_electrica',
      consumptionKWh: 8000
    },
    {
      id: 'e-2',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      date: '2026-11-02',
      sourceType: 'solar_fotovoltaica',
      consumptionKWh: 2000
    }
  ];

  const res = calculateEnergyIntensity(mockEnergy);
  assert.equal(res.totalKWh, 10000);
  assert.equal(res.renewableKWh, 2000);
  assert.equal(res.renewableSharePercent, 20);
  assert.ok(res.estimatedCo2Ton > 0);
});

test('answerEnvironmentalQuery delivers verified deterministic responses including CAPA', () => {
  const context = {
    obligations: [
      {
        id: 'o-1',
        organizationId: 'org-1',
        title: 'Reporte Semestral de Monitoreo',
        normativeSource: 'D.S. 004-2017-MINAM',
        jurisdiction: 'Nacional',
        dueDate: '2026-10-01',
        frequency: 'semestral' as const,
        responsible: 'Ing. Laura Peña',
        status: 'vencida' as const,
        evidenceCount: 0
      }
    ],
    waste: [
      {
        id: 'w-1',
        organizationId: 'org-1',
        facilityId: 'fac-1',
        date: '2026-11-01',
        wasteName: 'Baterías fuera de uso',
        category: 'peligroso' as const,
        quantityKg: 200,
        originProcess: 'Subestación Eléctrica',
        carrier: 'EcoHazard S.A.',
        destination: 'Planta Autorizada',
        treatmentType: 'disposicion_final' as const
      }
    ],
    water: [],
    air: [],
    energy: [],
    actions: [
      {
        id: 'ac-1',
        organizationId: 'org-1',
        facilityId: 'fac-1',
        title: 'Instalación de dique en tanque de combustible',
        rootCause: 'Falta de contención secundaria',
        proposedAction: 'Construir dique de concreto al 110% de capacidad',
        responsible: 'Jefe de Planta',
        deadline: '2026-11-30',
        status: 'abierta' as const
      }
    ]
  };

  const respOblig = answerEnvironmentalQuery('¿Cuáles son los vencimientos y estado de cumplimiento legal?', context);
  assert.equal(respOblig.category, 'cumplimiento');
  assert.equal(respOblig.confidenceType, 'Dato Verificado de BD');
  assert.ok(respOblig.summary.includes('1'));

  const respWaste = answerEnvironmentalQuery('¿Cuántos residuos peligrosos se han generado?', context);
  assert.equal(respWaste.category, 'residuos');
  assert.equal(respWaste.verifiedData[1].value, 200);

  const respCapa = answerEnvironmentalQuery('¿Cuántas acciones correctivas siguen abiertas?', context);
  assert.equal(respCapa.category, 'acciones');
  assert.equal(respCapa.verifiedData[1].value, 1);
});

test('calculateComplianceDeclarationStats accurately computes 5-state metrics and excludes no_aplica', () => {
  const mockDeclarations: ComplianceDeclaration[] = [
    {
      id: 'cd-1',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'residuos',
      requirementTitle: 'Segregación de residuos peligrosos',
      aspectEvaluated: 'Almacenamiento temporal y etiquetado',
      status: 'cumple',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Dr. Roberto Santillán',
      evaluatorRole: 'auditor',
      observations: 'Cilindros rotulados con código NTP',
      evidenceIds: ['img-1'],
      reviewStatus: 'aprobado_auditoria',
      history: []
    },
    {
      id: 'cd-2',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'residuos',
      requirementTitle: 'Manifiestos de transporte EO-RS',
      aspectEvaluated: 'Custodia de manifiestos firmados',
      status: 'no_cumple',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Dr. Roberto Santillán',
      evaluatorRole: 'auditor',
      observations: 'Falta manifiesto N° 0894',
      evidenceIds: [],
      reviewStatus: 'en_revision',
      history: []
    },
    {
      id: 'cd-3',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'aire',
      requirementTitle: 'LMP en chimenea caldera',
      aspectEvaluated: 'Gases de combustión y CO',
      status: 'cumplimiento_parcial',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Ing. Valeria Mendoza',
      evaluatorRole: 'admin',
      observations: 'SO2 conforme, CO excede límite referencial',
      evidenceIds: ['img-2', 'img-3'],
      reviewStatus: 'borrador',
      history: []
    },
    {
      id: 'cd-4',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'energia',
      requirementTitle: 'Meta de reducción de consumo energético',
      aspectEvaluated: 'Desplazamiento de generador diésel',
      status: 'pendiente_verificacion',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Tec. Carlos Paredes',
      evaluatorRole: 'operador',
      observations: 'Pendiente llegada de factura de combustible',
      evidenceIds: [],
      reviewStatus: 'borrador',
      history: []
    },
    {
      id: 'cd-5',
      organizationId: 'org-1',
      facilityId: 'fac-1',
      module: 'documentos',
      requirementTitle: 'Plan de Abandono de Mina',
      aspectEvaluated: 'Cierre de operaciones mineras',
      status: 'no_aplica',
      evaluationDate: '2026-11-04',
      evaluatorName: 'Ing. Valeria Mendoza',
      evaluatorRole: 'admin',
      observations: 'Planta de transformación agroindustrial, no opera mina',
      evidenceIds: [],
      reviewStatus: 'aprobado_auditoria',
      history: []
    }
  ];

  const stats = calculateComplianceDeclarationStats(mockDeclarations);

  assert.equal(stats.totalRequirements, 5);
  assert.equal(stats.cumple, 1);
  assert.equal(stats.noCumple, 1);
  assert.equal(stats.cumplimientoParcial, 1);
  assert.equal(stats.pendienteVerificacion, 1);
  assert.equal(stats.noAplica, 1);

  assert.equal(stats.applicableEvaluated, 3);
  assert.equal(stats.applicableTotal, 4);
  assert.equal(stats.complianceRatePercent, 50);
  assert.equal(stats.strictComplianceRatePercent, 33.3);
  assert.equal(stats.pendingEvidenceCount, 2);
  assert.ok(stats.byModule['residuos']);
});

test('validateImageUpload and formatBytes validate limits and byte sizes accurately', () => {
  const validJpg = validateImageUpload({ name: 'medidor.jpg', size: 1024 * 1024, mimeType: 'image/jpeg' });
  assert.equal(validJpg.valid, true);

  const validPng = validateImageUpload({ name: 'chimenea.png', size: 500 * 1024, mimeType: 'image/png' });
  assert.equal(validPng.valid, true);

  const invalidExe = validateImageUpload({ name: 'virus.exe', size: 1024, mimeType: 'application/x-msdownload' });
  assert.equal(invalidExe.valid, false);
  assert.ok(invalidExe.error?.includes('Formato no permitido'));

  const oversized = validateImageUpload({ name: 'huge.jpg', size: MAX_IMAGE_FILE_SIZE_BYTES + 1024, mimeType: 'image/jpeg' });
  assert.equal(oversized.valid, false);
  assert.ok(oversized.error?.includes('supera el tamaño'));

  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5490 * 1024), '5.36 MB');
});

