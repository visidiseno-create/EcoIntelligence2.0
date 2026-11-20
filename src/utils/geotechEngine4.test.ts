import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

import {
  buildSyntheticTestDem,
  classifyUscsSoil4,
  GEOTECH_PRELIMINARY_DISCLAIMER,
  runGeotechValidationBattery,
  runHydrologyValidationSuite,
  runScientificValidationBattery,
} from './scientificValidation4';
import {
  auditProjectDatasetIntegrity,
  createGeoReproPackage,
  ensurePrecisionUncertainty,
  globalGeoCache4,
  reexecuteAndVerifyReproPackage,
  scanGeospatialFileSecurity,
  sha256Hex,
} from './reproducibility4';
import {
  buildMaturityMatrix4,
  checkGranularRbac,
  computeAdvancedVersionDiff4,
  evaluatePublicationTransition,
  executeEnterpriseJobWithRetry,
  generateProjectQualityReport,
  planAiWorkflow4,
  runStressSuiteQY,
} from './enterpriseOps4';
import {
  buildDefaultMonitoringStations,
  evaluateMonitoringAlerts,
  generateAtlasMapSeries,
  generateGeoReportDocxBuffer,
  generateGeoReportXlsxBuffer,
} from './reportingAndAtlas4';
import { GeotechProject } from './geotechEngine';

function buildSampleProject4(): GeotechProject {
  const dem = buildSyntheticTestDem(12, 12, 100);
  return {
    id: 'proj-test-4',
    organizationId: 'org-1',
    name: 'Proyecto Validación 4.0',
    code: 'VAL-40',
    domain: 'geotecnia',
    description: 'Proyecto sintético de prueba científica 4.0',
    areaHa: 144,
    defaultCrs: 'EPSG:32718',
    center: [-76.85, -12.25],
    zoom: 12,
    dem,
    layers: [
      {
        id: 'lyr-v1',
        name: 'Polígono Proyecto',
        category: 'geotecnia',
        kind: 'vector',
        visible: true,
        opacity: 0.8,
        crs: 'EPSG:4326',
        source: 'Levantamiento Topográfico Certificado',
        license: 'Uso Interno',
        capturedDate: '2026-10-01',
        symbology: { color: '#059669' },
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { name: 'Zona A', cota: 450 },
              geometry: {
                type: 'Polygon',
                coordinates: [[[-76.88, -12.28], [-76.82, -12.28], [-76.82, -12.22], [-76.88, -12.22], [-76.88, -12.28]]],
              },
            },
          ],
        },
      },
    ],
    boreholes: [
      {
        id: 'bh-1',
        code: 'SPT-01',
        name: 'Sondeo Test 4.0',
        lng: -76.85,
        lat: -12.25,
        collarElevM: 450,
        totalDepthM: 12,
        waterTableDepthM: 2.5,
        pgaG: 0.35,
        strata: [
          { fromM: 0, toM: 6, lithology: 'Arena limosa', uscs: 'SM', sptN60: 14, unitWeightKnM3: 18.5, cohesionKpa: 5, frictionDeg: 30, color: '#d97706' },
          { fromM: 6, toM: 12, lithology: 'Grava densa', uscs: 'GW', sptN60: 42, unitWeightKnM3: 20.5, cohesionKpa: 0, frictionDeg: 38, color: '#64748b' },
        ],
        cptProfile: [{ depthM: 3, qcMpa: 6.2, fsKpa: 48, u2Kpa: 25 }],
      },
    ],
    operationHistory: [
      {
        id: 'op-1',
        timestamp: '2026-11-18 10:00:00',
        tool: 'Pendiente Horn',
        module: 'DEM',
        parameters: {},
        inputLayers: ['DEM'],
        durationMs: 2,
        status: 'completado',
        summary: 'Pendiente calculada',
        precisionEnvelope: {
          resultSummary: 'Pendiente media 5.7°',
          method: 'Horn 3×3',
          crs: 'EPSG:32718',
          resolution: '100 m',
          units: 'grados',
          sourceData: ['DEM'],
          timestamp: '2026-11-18T10:00:00Z',
          estimatedAccuracy: 'Determinístico',
          dataKind: 'modelo_analitico',
          warnings: [],
        },
      },
    ],
    versions: [],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-11-18T00:00:00Z',
  };
}

describe('SIG & GEOTECH AI 4.0 — Scientific, Security, Reproducibility & Enterprise Suites', () => {
  it('verifies FIPS 180-4 SHA-256 test vector', () => {
    assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('passes all 20 algorithms in Scientific Validation Framework', () => {
    const res = runScientificValidationBattery();
    const failed = res.cases.filter((c) => c.status !== 'APROBADO');
    assert.equal(failed.length, 0, `Failed scientific cases: ${JSON.stringify(failed)}`);
    assert.equal(res.totalCount, 20);
    assert.equal(res.passedCount, 20);
  });

  it('passes all 13 methods in Geotechnical Validation Battery with mandatory disclaimer', () => {
    const geo = runGeotechValidationBattery();
    assert.ok(geo.disclaimer.includes(GEOTECH_PRELIMINARY_DISCLAIMER));
    const failed = geo.items.filter((i) => i.status !== 'APROBADO');
    assert.equal(failed.length, 0, `Failed geotech cases: ${JSON.stringify(failed)}`);
    assert.equal(geo.totalCount, 13);
    assert.equal(geo.passedCount, 13);

    const uscs = classifyUscsSoil4({ finesPct: 12, gravelPct: 10, liquidLimitPct: 30, plasticityIndexPct: 12 });
    assert.equal(uscs.uscsCode, 'SC');
  });

  it('passes Hydrological Validation & Sensitivity Battery', () => {
    const hydro = runHydrologyValidationSuite();
    assert.equal(hydro.passedCount, hydro.totalCount);
    assert.ok(hydro.sensitivity.length >= 5);
  });

  it('verifies GeoReproducibility Package SHA-256 exact match and data drift detection', () => {
    const proj = buildSampleProject4();
    const pkg = createGeoReproPackage({
      project: proj,
      title: 'Pendiente Repro 4.0',
      algorithm: 'slope_horn',
      user: 'Ing. QA',
    });

    const exact = reexecuteAndVerifyReproPackage(pkg, proj);
    assert.equal(exact.status, 'REPRODUCIBLE_EXACTO');
    assert.equal(exact.datasetMatch, true);
    assert.equal(exact.resultMatch, true);

    // Mutate DEM -> must detect DERIVA_DATOS
    proj.dem.values[0] += 15;
    const drifted = reexecuteAndVerifyReproPackage(pkg, proj);
    assert.equal(drifted.status, 'DERIVA_DATOS');
    assert.equal(drifted.datasetMatch, false);
  });

  it('detects tampering via Dataset Integrity SHA-256 Auditor and enforces Uncertainty Envelope', () => {
    const proj = buildSampleProject4();
    const baseline = auditProjectDatasetIntegrity(proj);
    const map: Record<string, string> = {};
    baseline.forEach((b) => (map[b.assetId] = b.currentSha256));

    proj.dem.values[5] += 22;
    const afterEdit = auditProjectDatasetIntegrity(proj, map);
    assert.equal(afterEdit.find((a) => a.assetId === proj.dem.id)?.integrityStatus, 'MODIFICADO');

    const unc = ensurePrecisionUncertainty(proj.operationHistory[0].precisionEnvelope!);
    assert.ok(unc.resultado.length > 0 && unc.confianza.length > 0 && unc.limitaciones.length > 0);
  });

  it('blocks path traversal, bad magic bytes, and ZIP bombs in File Security Scanner', async () => {
    const badPath = await scanGeospatialFileSecurity({
      fileName: '../../etc/passwd.geojson',
      bytes: new TextEncoder().encode('{"type":"FeatureCollection","features":[]}'),
    });
    assert.equal(badPath.safe, false);

    const badMagic = await scanGeospatialFileSecurity({
      fileName: 'fake.las',
      bytes: new TextEncoder().encode('NOT_A_LAS_FILE'),
    });
    assert.equal(badMagic.safe, false);

    // High compression ratio bomb test
    const zip = new JSZip();
    zip.file('big.txt', 'A'.repeat(200_000));
    const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    const bombCheck = await scanGeospatialFileSecurity({ fileName: 'bomb.zip', bytes: zipBytes });
    assert.equal(bombCheck.safe, false);

    const goodGeoJson = await scanGeospatialFileSecurity({
      fileName: 'valid_area.geojson',
      bytes: new TextEncoder().encode('{"type":"FeatureCollection","features":[]}'),
    });
    assert.equal(goodGeoJson.safe, true);
  });

  it('invalidates multi-level geospatial cache automatically per project', () => {
    globalGeoCache4.set('rasters', 'k1', 'proj-A', { data: 1 });
    globalGeoCache4.set('stats', 'k2', 'proj-A', { data: 2 });
    globalGeoCache4.set('rasters', 'k3', 'proj-B', { data: 3 });

    assert.deepEqual(globalGeoCache4.get('rasters', 'k1'), { data: 1 });
    const removed = globalGeoCache4.invalidateProject('proj-A');
    assert.equal(removed, 2);
    assert.equal(globalGeoCache4.get('rasters', 'k1'), null);
    assert.deepEqual(globalGeoCache4.get('rasters', 'k3'), { data: 3 });
  });

  it('recovers interrupted Enterprise Job from checkpoint without duplicating items', async () => {
    const finalJob = await executeEnterpriseJobWithRetry({
      job: {
        id: 'job-t1', user: 'Admin', organizationId: 'org-1', projectId: 'proj-test-4',
        title: 'Test Retry', operation: 'batch', priority: 'alta', status: 'QUEUED',
        worker: 'worker-01', totalItems: 8, completedItemIds: [], checkpointIndex: 0,
        retries: 0, maxRetries: 2, memoryMb: 40, cpuPct: 20, startedAt: new Date().toISOString(), logs: [],
      },
      simulateFailAtStep: 3,
      onUpdate: () => {},
    });
    assert.equal(finalJob.status, 'COMPLETED');
    assert.equal(finalJob.retries, 1);
    assert.equal(finalJob.completedItemIds.length, 8);
  });

  it('enforces Granular RBAC, Controlled Publishing Gate, and AI Project Reviewer', () => {
    const crossOrg = checkGranularRbac({
      userRole: 'admin', action: 'project_write', actorOrgId: 'org-1', targetOrgId: 'org-2',
    });
    assert.equal(crossOrg.allowed, false);

    const lectorPub = evaluatePublicationTransition({
      currentStatus: 'aprobacion', targetStatus: 'publicado', userRole: 'lector', qualityScore: 95, hasReviewerApproval: true,
    });
    assert.equal(lectorPub.allowed, false);

    const lowQualPub = evaluatePublicationTransition({
      currentStatus: 'aprobacion', targetStatus: 'publicado', userRole: 'admin', qualityScore: 55, hasReviewerApproval: true,
    });
    assert.equal(lowQualPub.allowed, false);

    const validPub = evaluatePublicationTransition({
      currentStatus: 'aprobacion', targetStatus: 'publicado', userRole: 'admin', qualityScore: 92, hasReviewerApproval: true,
    });
    assert.equal(validPub.allowed, true);

    const proj = buildSampleProject4();
    const qr = generateProjectQualityReport(proj);
    assert.equal(qr.reportTitle, 'PROJECT QUALITY REPORT');
    assert.equal(qr.publishReady, true);

    const aiPlan = planAiWorkflow4('Genera un buffer sin especificar distancia', proj);
    assert.equal(aiPlan.needsMoreInfo, true);
    assert.ok(aiPlan.missingInputs.length >= 1);
  });

  it('computes Advanced Version Diff (geometry + raster delta grid)', () => {
    const proj = buildSampleProject4();
    const v1 = {
      id: 'v1', label: 'Base', createdAt: '2026-10-01', author: 'A', layerCount: 1, historyCount: 1,
      snapshot: { dem: structuredClone(proj.dem), layers: structuredClone(proj.layers), boreholes: [], defaultCrs: proj.defaultCrs },
    };
    const dem2 = structuredClone(proj.dem);
    dem2.values = dem2.values.map((v, i) => (i % 2 === 0 ? v + 2 : v));
    const v2 = {
      id: 'v2', label: 'Mod', createdAt: '2026-11-01', author: 'B', layerCount: 1, historyCount: 1,
      snapshot: { dem: dem2, layers: structuredClone(proj.layers), boreholes: [], defaultCrs: proj.defaultCrs },
    };
    const diff = computeAdvancedVersionDiff4(v1, v2);
    assert.ok(diff.demRmsdM > 1.0);
    assert.equal(diff.demMaxDeltaM, 2);
    assert.ok(diff.deltaGrid !== null);
  });

  it('generates Monitoring Alerts, Atlas Map Series, valid DOCX & XLSX binary packages', async () => {
    const proj = buildSampleProject4();
    const stations = buildDefaultMonitoringStations(proj);
    const alerts = evaluateMonitoringAlerts(stations);
    assert.equal(alerts.length, 3);
    assert.equal(alerts[1].severity, 'CRÍTICA');

    const sheets = generateAtlasMapSeries({ project: proj, organizationName: 'BioAndes', authorName: 'Ing. QA', sheetCount: 4 });
    assert.equal(sheets.length, 4);
    assert.ok(sheets[0].svgMarkup.includes('MAPA UBICACIÓN'));

    const docxBytes = await generateGeoReportDocxBuffer({
      project: proj, organizationName: 'BioAndes', authorName: 'Ing. QA', monitoringAlerts: alerts,
    });
    assert.equal(docxBytes[0], 0x50); // PK
    assert.equal(docxBytes[1], 0x4b);
    const docxZip = await JSZip.loadAsync(docxBytes);
    assert.ok(docxZip.file('word/document.xml'));

    const xlsxBytes = await generateGeoReportXlsxBuffer({ project: proj, monitoringAlerts: alerts });
    const xlsxZip = await JSZip.loadAsync(xlsxBytes);
    assert.ok(xlsxZip.file('xl/worksheets/sheet1.xml'));
    assert.ok(xlsxZip.file('xl/worksheets/sheet2.xml'));
  });

  it('executes Stress Benchmarks TEST Q–Y, Recovery Integrity TEST Y, and Maturity Matrix 4.0 honestly', async () => {
    const proj = buildSampleProject4();
    const res = await runStressSuiteQY({ project: proj, workerConfigured: false });
    assert.equal(res.externalWorkerStatus, 'DEPENDENCIA EXTERNA NO DISPONIBLE');
    assert.equal(res.recoveryHashVerified, true);
    const failedLocal = res.run.results.filter((r) => r.status === 'error');
    assert.equal(failedLocal.length, 0);

    const matrix = buildMaturityMatrix4({
      scientificPassedPct: 100, geotechPassedPct: 100, hydroPassedPct: 100,
      stressQYPassed: true, recoveryYVerified: true, workerConnected: false,
    });
    const workerRow = matrix.find((m) => m.capability.includes('Worker Externo'));
    assert.equal(workerRow?.classification, 'DEPENDENCIA EXTERNA NO DISPONIBLE');
  });
});
