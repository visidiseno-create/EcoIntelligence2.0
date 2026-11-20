import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  projectCoordinate,
  transformFeatureCollectionCrs,
  runVectorBuffer,
  runVectorIntersect,
  computeSlopeGrid,
  computeAspectGrid,
  computeHillshadeGrid,
  computeCurvatureGrid,
  computeHydrologyD8AndTwi,
  computeIdwRasterGrid,
  evaluateSlopeStability,
  GeoFeatureCollection,
  DemGrid,
  GeotechProject,
} from './geotechEngine';
import {
  parseGeoJsonText,
  exportGeoJsonToKml,
  parseKmlText,
  exportFeaturesToCsv,
  parseCsvCoordinates,
  exportDemToEsriAsciiGrid,
  parseEsriAsciiGrid,
  parseGeoTiffArrayBuffer,
} from './gisFormats';
import {
  exportGeoJsonToShapefileZip,
  parseShapefileZipBuffer,
  exportDemToGeoTiffBuffer,
  readGeoTiffWindowed,
  exportGeoJsonToDxf,
  parseDxfText,
  exportGeoJsonToGml,
  parseGmlText,
  exportGeoJsonToKmzBuffer,
  parseKmzBuffer,
} from './gisFormats2';
import {
  exportPointCloudToLasBuffer,
  parseLasBuffer,
  generateReferenceLidarSurvey,
  classifyGroundMorphological,
} from './lidarEngine';
import {
  computeProjectDatasetHash,
  createGeoReproPackage,
  reexecuteAndVerifyReproPackage,
  scanGeospatialFileSecurity,
  GeospatialCache4,
  sha256Hex,
} from './reproducibility4';
import {
  executeEnterpriseJobWithRetry,
  planAiWorkflow4,
} from './enterpriseOps4';
import { computeBearingCapacity } from './geotechPro2';
import { computeAdvancedHydrology } from './hydrology2';
import {
  generateGeoReportDocxBuffer,
  generateGeoReportXlsxBuffer,
} from './reportingAndAtlas4';

function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function makeSampleProject41(): GeotechProject {
  const cols = 12;
  const rows = 12;
  const values: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      values.push(120 + c * 2.5 + r * 1.5);
    }
  }
  const dem: DemGrid = {
    id: 'dem-41',
    name: 'DEM Validacion 4.1',
    cols,
    rows,
    cellSizeMeters: 50,
    bounds: [-77.05, -12.10, -76.95, -12.00],
    crs: 'EPSG:4326',
    noData: -9999,
    unit: 'm.s.n.m.',
    values,
    colorScale: 'elevation',
  };

  return {
    id: 'proj-41',
    organizationId: 'org-1',
    name: 'Proyecto Certificación 4.1',
    code: 'SIG-CERT-41',
    domain: 'geotecnia',
    description: 'Dataset de validación cruzada e interoperabilidad',
    defaultCrs: 'EPSG:32718',
    areaHa: 1200,
    center: [-77.0, -12.05],
    zoom: 12,
    createdAt: '2026-11-19T00:00:00Z',
    updatedAt: '2026-11-19T00:00:00Z',
    dem,
    layers: [
      {
        id: 'lyr-pts-41',
        name: 'Estaciones Muestreo',
        kind: 'vector',
        category: 'ambiental',
        crs: 'EPSG:4326',
        source: 'Levantamiento Campo 4.1',
        visible: true,
        opacity: 0.9,
        symbology: { color: '#0f766e' },
        geojson: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { id: 1, name: 'M-1', arsenic_ppm: 12.5 }, geometry: { type: 'Point', coordinates: [-77.03, -12.08] } },
            { type: 'Feature', properties: { id: 2, name: 'M-2', arsenic_ppm: 24.0 }, geometry: { type: 'Point', coordinates: [-76.98, -12.08] } },
            { type: 'Feature', properties: { id: 3, name: 'M-3', arsenic_ppm: 18.2 }, geometry: { type: 'Point', coordinates: [-77.03, -12.02] } },
            { type: 'Feature', properties: { id: 4, name: 'M-4', arsenic_ppm: 31.4 }, geometry: { type: 'Point', coordinates: [-76.98, -12.02] } },
          ],
        },
      },
      {
        id: 'lyr-poly-41',
        name: 'Polígonos Prediales',
        kind: 'vector',
        category: 'infraestructura',
        crs: 'EPSG:4326',
        source: 'Catastro Base',
        visible: true,
        opacity: 0.6,
        symbology: { color: '#2563eb' },
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { id: 101, name: 'Parcela Norte', area_ha: 42.5 },
              geometry: {
                type: 'Polygon',
                coordinates: [[[-77.04, -12.06], [-76.99, -12.06], [-76.99, -12.02], [-77.04, -12.02], [-77.04, -12.06]]],
              },
            },
          ],
        },
      },
    ],
    boreholes: [
      {
        id: 'bh-41',
        code: 'BH-CERT-01',
        name: 'Sondeo Certificación 01',
        lng: -77.01,
        lat: -12.05,
        collarElevM: 145,
        waterTableDepthM: 4.5,
        totalDepthM: 15,
        strata: [
          { fromM: 0, toM: 5, lithology: 'Arena limosa', uscs: 'SM', sptN60: 14, unitWeightKnM3: 18.2, cohesionKpa: 8, frictionDeg: 31, color: '#d97706' },
          { fromM: 5, toM: 15, lithology: 'Arcilla baja plasticidad', uscs: 'CL', sptN60: 22, unitWeightKnM3: 19.4, cohesionKpa: 28, frictionDeg: 24, color: '#64748b' },
        ],
      },
    ],
    spectralScene: {
      id: 'scn-41',
      name: 'Sentinel-2 QA',
      cols: 4,
      rows: 4,
      cellSizeMeters: 10,
      bounds: [-77.05, -12.10, -76.95, -12.00],
      crs: 'EPSG:4326',
      t1: {
        date: '2025-10-01',
        sensor: 'Sentinel-2A',
        resolutionM: 10,
        blue: new Array(16).fill(0.08),
        green: new Array(16).fill(0.12),
        red: new Array(16).fill(0.10),
        nir: new Array(16).fill(0.50),
        swir1: new Array(16).fill(0.20),
        swir2: new Array(16).fill(0.15),
      },
      t2: {
        date: '2026-10-01',
        sensor: 'Sentinel-2A',
        resolutionM: 10,
        blue: new Array(16).fill(0.09),
        green: new Array(16).fill(0.14),
        red: new Array(16).fill(0.15),
        nir: new Array(16).fill(0.40),
        swir1: new Array(16).fill(0.22),
        swir2: new Array(16).fill(0.18),
      },
    },
    lidarCloud: generateReferenceLidarSurvey(dem),
    operationHistory: [],
    versions: [],
    approvals: [],
  };
}

describe('SIG & GEOTECH AI 4.1 — Final Certification Suite', () => {
  it('1. Round-Trip Interoperability across Native Vector, Raster & LiDAR Formats', async () => {
    const proj = makeSampleProject41();
    const ptsFc = proj.layers[0].geojson!;
    const polyFc = proj.layers[1].geojson!;

    // GeoJSON RFC 7946
    const geojsonParsed = parseGeoJsonText(JSON.stringify(ptsFc));
    assert.equal(geojsonParsed.geojson.features.length, 4);
    assert.equal(geojsonParsed.geojson.features[0].properties?.name, 'M-1');

    // Shapefile .zip binary round-trip (Points + UTM .prj + DBF attributes)
    const shpPtsZip = await exportGeoJsonToShapefileZip(ptsFc, 'pts_41', 'EPSG:32718');
    const shpPtsBack = await parseShapefileZipBuffer(toArrayBuffer(shpPtsZip));
    assert.equal(shpPtsBack.geojson.features.length, 4);
    const pt0Orig = (ptsFc.features[0].geometry as any).coordinates;
    const pt0Back = (shpPtsBack.geojson.features[0].geometry as any).coordinates;
    assert.ok(Math.abs(pt0Orig[0] - pt0Back[0]) < 1e-4, 'Shapefile point lng drift < 1e-4°');
    assert.ok(Math.abs(pt0Orig[1] - pt0Back[1]) < 1e-4, 'Shapefile point lat drift < 1e-4°');
    assert.equal(shpPtsBack.geojson.features[0].properties?.name, 'M-1');

    // Shapefile .zip binary round-trip (Polygon + UTM .prj)
    const shpPolyZip = await exportGeoJsonToShapefileZip(polyFc, 'poly_41', 'EPSG:32718');
    const shpPolyBack = await parseShapefileZipBuffer(toArrayBuffer(shpPolyZip));
    assert.equal(shpPolyBack.geojson.features.length, 1);
    assert.equal(shpPolyBack.geojson.features[0].geometry?.type, 'Polygon');

    // GeoTIFF Float32 full + Windowed COG read
    const tiffBuf = exportDemToGeoTiffBuffer(proj.dem);
    const tiffBack = await parseGeoTiffArrayBuffer(tiffBuf, proj.dem.bounds);
    assert.equal(tiffBack.cols, proj.dem.cols);
    assert.equal(tiffBack.rows, proj.dem.rows);
    const cellDiff = Math.abs(tiffBack.values[0] - proj.dem.values[0]);
    assert.ok(cellDiff < 0.05, `GeoTIFF cell 0 diff=${cellDiff}`);

    const winRead = await readGeoTiffWindowed(tiffBuf, proj.dem.bounds, [2, 2, 8, 8]);
    assert.equal(winRead.sourceWidth, 12);
    assert.equal(winRead.sourceHeight, 12);
    assert.equal(winRead.grid.cols, 6);
    assert.equal(winRead.grid.rows, 6);

    // ASPRS LAS 1.2 binary round-trip
    const cloud = proj.lidarCloud!;
    const lasBuf = exportPointCloudToLasBuffer(cloud, 'EPSG:32718');
    const lasBytes = new Uint8Array(lasBuf);
    assert.equal(String.fromCharCode(lasBytes[0], lasBytes[1], lasBytes[2], lasBytes[3]), 'LASF');
    const lasBack = parseLasBuffer(lasBuf, 'EPSG:32718');
    assert.equal(lasBack.version, '1.2');
    assert.equal(lasBack.points.length, cloud.length);
    assert.ok(Math.abs(lasBack.points[0].z - cloud[0].z) < 0.02);
    assert.equal(lasBack.points[0].classification, cloud[0].classification);

    // CAD DXF, GML 3.2, KML, KMZ, ESRI ASC, CSV
    const dxfText = exportGeoJsonToDxf(polyFc, 'EPSG:32718');
    const dxfBack = parseDxfText(dxfText, 'EPSG:32718');
    assert.equal(dxfBack.geojson.features.length, 1);

    const gmlText = exportGeoJsonToGml(ptsFc, 'pts_layer');
    const gmlBack = parseGmlText(gmlText);
    assert.equal(gmlBack.geojson.features.length, 4);

    const kmlText = exportGeoJsonToKml(ptsFc, 'pts_kml');
    const kmlBack = parseKmlText(kmlText);
    assert.equal(kmlBack.geojson.features.length, 4);

    const kmzBuf = await exportGeoJsonToKmzBuffer(ptsFc, 'pts_kmz');
    const kmzBack = await parseKmzBuffer(toArrayBuffer(kmzBuf));
    assert.equal(kmzBack.geojson.features.length, 4);

    const ascText = exportDemToEsriAsciiGrid(proj.dem);
    const ascBack = parseEsriAsciiGrid(ascText, proj.dem.crs);
    assert.equal(ascBack.cols, proj.dem.cols);
    assert.equal(ascBack.rows, proj.dem.rows);
    assert.ok(Math.abs(ascBack.values[0] - proj.dem.values[0]) < 0.01);

    const csvText = exportFeaturesToCsv(ptsFc);
    const csvBack = parseCsvCoordinates(csvText, 'EPSG:4326');
    assert.equal(csvBack.geojson.features.length, 4);
  });

  it('2. Cross-Validation Matrix against Exact Analytical Reference Formulas', () => {
    const matrix: Array<{ test: string; engineVal: number; refVal: number; tol: number; pass: boolean }> = [];

    // a) Buffer 1000m circle area vs pi*R^2
    const ptFc: GeoFeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { id: 1 }, geometry: { type: 'Point', coordinates: [-77.0, -12.0] } }],
    };
    const bufFc = runVectorBuffer(ptFc, 1000);
    const ring = (bufFc.features[0].geometry as any).coordinates[0];
    const latRad = (-12 * Math.PI) / 180;
    const kx = 111320 * Math.cos(latRad);
    const ky = 110540;
    let shoelace = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      shoelace += ring[i][0] * kx * (ring[i + 1][1] * ky) - ring[i + 1][0] * kx * (ring[i][1] * ky);
    }
    const bufAreaM2 = Math.abs(shoelace) / 2;
    const exactCircleM2 = Math.PI * 1000 * 1000;
    const bufRelDiff = Math.abs(bufAreaM2 - exactCircleM2) / exactCircleM2;
    matrix.push({ test: 'Buffer Area pi*R^2', engineVal: bufAreaM2, refVal: exactCircleM2, tol: 0.03, pass: bufRelDiff < 0.03 });

    // b) Intersect overlapping squares
    const sqA: GeoFeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { a: 1 }, geometry: { type: 'Polygon', coordinates: [[[-77.1, -12.1], [-77.0, -12.1], [-77.0, -12.0], [-77.1, -12.0], [-77.1, -12.1]]] } }],
    };
    const sqB: GeoFeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { b: 2 }, geometry: { type: 'Polygon', coordinates: [[[-77.05, -12.1], [-76.95, -12.1], [-76.95, -12.0], [-77.05, -12.0], [-77.05, -12.1]]] } }],
    };
    const inter = runVectorIntersect(sqA, sqB);
    assert.equal(inter.features.length, 1);

    // c) PROJ4 round-trip EPSG:4326 -> EPSG:32718 -> EPSG:4326
    const utm = projectCoordinate([-77.02824, -12.04637], 'EPSG:4326', 'EPSG:32718');
    const back = projectCoordinate(utm, 'EPSG:32718', 'EPSG:4326');
    const crsDrift = Math.hypot(back[0] - -77.02824, back[1] - -12.04637);
    matrix.push({ test: 'PROJ4 UTM18S Round-Trip', engineVal: crsDrift, refVal: 0, tol: 1e-6, pass: crsDrift < 1e-6 });

    // d) Horn 3x3 slope on exact 10% East-rising ramp (cell=10m, z=c*1.0 -> dz/dx=0.1 -> atan(0.1)=5.71059°)
    const rampValues: number[] = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) rampValues.push(c * 1.0);
    const rampDem: DemGrid = {
      id: 'ramp', name: 'Ramp', cols: 5, rows: 5, cellSizeMeters: 10,
      bounds: [-77.01, -12.01, -77.0, -12.0], crs: 'EPSG:4326', noData: -9999, unit: 'm', values: rampValues, colorScale: 'elevation',
    };
    const slope = computeSlopeGrid(rampDem);
    const centerSlope = slope.grid.values[2 * 5 + 2];
    const refSlopeDeg = (Math.atan(0.1) * 180) / Math.PI;
    matrix.push({ test: 'Horn 3x3 Slope 10%', engineVal: centerSlope, refVal: refSlopeDeg, tol: 0.05, pass: Math.abs(centerSlope - refSlopeDeg) < 0.05 });

    // e) Aspect on West-facing ramp (rises East -> faces West 270°)
    const aspect = computeAspectGrid(rampDem);
    const centerAspect = aspect.values[2 * 5 + 2];
    matrix.push({ test: 'Aspect Downhill Azimuth', engineVal: centerAspect, refVal: 270, tol: 0.5, pass: Math.abs(centerAspect - 270) < 0.5 });

    // f) Hillshade flat terrain sun altitude 45° -> round(255 * cos(45°)) = 180
    const flatDem: DemGrid = { ...rampDem, id: 'flat', values: new Array(25).fill(100) };
    const hill = computeHillshadeGrid(flatDem, 315, 45);
    const centerHill = hill.values[2 * 5 + 2];
    matrix.push({ test: 'Hillshade Flat 45°', engineVal: centerHill, refVal: 180, tol: 1, pass: Math.abs(centerHill - 180) <= 1 });

    // g) Curvature + Hydrology pit fill
    const curv = computeCurvatureGrid(rampDem);
    assert.ok(Math.abs(curv.values[2 * 5 + 2]) < 0.01);
    const pitDem: DemGrid = { ...rampDem, id: 'pit', values: rampValues.slice() };
    pitDem.values[2 * 5 + 2] = -50;
    const hydro = computeHydrologyD8AndTwi(pitDem);
    assert.ok(hydro.maxFlowAccumulation >= 5);

    // h) IDW midpoint
    const idw = computeIdwRasterGrid(
      {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { v: 10 }, geometry: { type: 'Point', coordinates: [-77.0, -12.0] } },
          { type: 'Feature', properties: { v: 30 }, geometry: { type: 'Point', coordinates: [-76.98, -12.0] } },
        ],
      },
      'v',
      [-77.0, -12.01, -76.98, -11.99],
      3,
      3,
      2
    );
    matrix.push({ test: 'IDW Symmetric Midpoint', engineVal: idw.values[1 * 3 + 1], refVal: 20, tol: 0.2, pass: Math.abs(idw.values[1 * 3 + 1] - 20) < 0.2 });

    // i) Terzaghi strip/square (phi=0 -> Nc=5.7, qult = 1.3*c*5.7 + gamma*Df for square or 5.7*c + gamma*Df for strip)
    const terz = computeBearingCapacity({
      method: 'terzaghi', footingShape: 'strip', widthBM: 2, lengthLM: 20,
      embedmentDfM: 1.5, waterTableDepthM: 10, cohesionKpa: 50, frictionDeg: 0, unitWeightKnM3: 18, safetyFactor: 3,
    });
    const refQult = 5.7 * 50 + 18 * 1.5; // 312 kPa
    matrix.push({ test: 'Terzaghi Strip Phi=0', engineVal: terz.qUltKpa, refVal: refQult, tol: 2.0, pass: Math.abs(terz.qUltKpa - refQult) < 2.0 });

    // j) Infinite slope dry c=0 -> Fs = tan(30)/tan(20) = 1.5851
    const fsRes = evaluateSlopeStability({
      method: 'infinite_slope', slopeAngleDeg: 20, slopeHeightM: 10, failureDepthM: 3,
      unitWeightKnM3: 18, cohesionKpa: 0, frictionDeg: 30, porePressureRatioRu: 0,
    });
    const refFs = Math.tan((30 * Math.PI) / 180) / Math.tan((20 * Math.PI) / 180);
    matrix.push({ test: 'Infinite Slope Fs', engineVal: fsRes.safetyFactor, refVal: refFs, tol: 0.02, pass: Math.abs(fsRes.safetyFactor - refFs) < 0.02 });

    // k) Advanced Hydrology Rational Discharge consistency (monotonic positive Q & basin area)
    const advHydro = computeAdvancedHydrology(rampDem, 60, 0.5);
    const qAreaKm2 = advHydro.morphometry.basinAreaKm2;
    const expectedRationalQ = (0.5 * 60 * qAreaKm2) / 3.6;
    const qDiff = Math.abs(advHydro.morphometry.rationalPeakFlowM3s - expectedRationalQ);
    matrix.push({ test: 'Rational Q = CIA/3.6', engineVal: advHydro.morphometry.rationalPeakFlowM3s, refVal: expectedRationalQ, tol: 0.15, pass: qDiff < 0.15 });

    for (const row of matrix) {
      assert.equal(row.pass, true, `Cross-validation failed on ${row.test}: engine=${row.engineVal} ref=${row.refVal}`);
    }
  });

  it('3. Full Reproducibility Cycle (SHA-256) & Mid-Job Checkpoint Recovery Without Duplicates', async () => {
    const proj = makeSampleProject41();
    const pkg1 = createGeoReproPackage({ project: proj, title: 'Cert 4.1 Repro', algorithm: 'slope_horn', user: 'QA' });
    const reexec = reexecuteAndVerifyReproPackage(pkg1, proj);
    assert.equal(reexec.status, 'REPRODUCIBLE_EXACTO');
    assert.equal(reexec.datasetMatch, true);
    assert.equal(reexec.resultMatch, true);

    const rawHash = computeProjectDatasetHash(proj);
    const cloned = JSON.parse(JSON.stringify(proj));
    assert.equal(computeProjectDatasetHash(cloned), rawHash);

    // Mid-job failure -> checkpoint -> resume -> zero duplicate items
    const finalJob = await executeEnterpriseJobWithRetry({
      job: {
        id: 'job-41-retry', user: 'QA', organizationId: 'org-1', projectId: proj.id,
        title: 'Recovery 4.1', operation: 'batch_cert', priority: 'alta', status: 'QUEUED',
        worker: 'worker-local', totalItems: 6, completedItemIds: [], checkpointIndex: 0,
        retries: 0, maxRetries: 2, memoryMb: 32, cpuPct: 15, startedAt: new Date().toISOString(), logs: [],
      },
      simulateFailAtStep: 3,
      onUpdate: () => {},
    });
    assert.equal(finalJob.status, 'COMPLETED');
    assert.equal(finalJob.retries, 1);
    assert.equal(finalJob.completedItemIds.length, 6);
    assert.equal(new Set(finalJob.completedItemIds).size, 6, 'Zero duplicate items after checkpoint resume');
  });

  it('4. Security Hardening: Traversal, Fake Extensions (MZ/PNG as CSV/DXF), Bad Magic, ZIP Traversal', async () => {
    const trav = await scanGeospatialFileSecurity({ fileName: '../../etc/passwd.geojson', bytes: new TextEncoder().encode('{}') });
    assert.equal(trav.safe, false);

    // Fake extension: Windows PE/EXE (MZ) disguised as .csv
    const fakeExe = await scanGeospatialFileSecurity({
      fileName: 'estaciones.csv',
      bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]),
    });
    assert.equal(fakeExe.safe, false);
    assert.ok(fakeExe.blockedReason?.includes('Extensión falsa'));

    // Fake extension: PNG disguised as .geojson
    const fakePng = await scanGeospatialFileSecurity({
      fileName: 'capa.geojson',
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    assert.equal(fakePng.safe, false);

    // Corrupt LAS magic
    const badLas = await scanGeospatialFileSecurity({
      fileName: 'cloud.las',
      bytes: new TextEncoder().encode('NOT_LASF_HEADER_CONTENT'),
    });
    assert.equal(badLas.safe, false);

    // ZIP with dangerous internal traversal entry
    const badZip = new JSZip();
    badZip.file('../../evil.txt', 'payload');
    const badZipBytes = await badZip.generateAsync({ type: 'uint8array' });
    const zipReport = await scanGeospatialFileSecurity({ fileName: 'shapefile.zip', bytes: badZipBytes });
    assert.equal(zipReport.safe, false);

    // Valid GeoJSON passes cleanly
    const validBytes = new TextEncoder().encode('{"type":"FeatureCollection","features":[]}');
    const goodGeo = await scanGeospatialFileSecurity({ fileName: 'valid.geojson', bytes: validBytes });
    assert.equal(goodGeo.safe, true);
    assert.equal(goodGeo.sha256, sha256Hex(validBytes));
  });

  it('5. Geotech AI 4.0 Refuses Ambiguous, Insufficient, Incompatible & Unconfirmed Destructive Prompts', () => {
    const proj = makeSampleProject41();
    const projNoBoreholes = { ...proj, boreholes: [] };
    const projNoSpectral = { ...proj, spectralScene: undefined };
    const projNoLidar = { ...proj, lidarCloud: [] };

    const ambiguous = planAiWorkflow4('haz algo con todo esto', proj);
    assert.equal(ambiguous.needsMoreInfo, true);
    assert.equal(ambiguous.cannotExecute, true);
    assert.equal(ambiguous.steps.length, 0);
    assert.ok(ambiguous.summary.includes('NO SE PUEDE EJECUTAR CON LOS DATOS DISPONIBLES'));

    const missingRadius = planAiWorkflow4('Calcula buffer sin radio', proj);
    assert.equal(missingRadius.needsMoreInfo, true);
    assert.equal(missingRadius.steps.length, 0);

    const missingSpt = planAiWorkflow4('Evalúa licuefacción y cimentación Terzaghi', projNoBoreholes);
    assert.equal(missingSpt.needsMoreInfo, true);
    assert.ok(missingSpt.summary.includes('NO SE PUEDE EJECUTAR CON LOS DATOS DISPONIBLES'));

    const missingScene = planAiWorkflow4('Calcula NDVI satelital', projNoSpectral);
    assert.equal(missingScene.needsMoreInfo, true);

    const missingLidar = planAiWorkflow4('Clasifica nube LiDAR SMRF', projNoLidar);
    assert.equal(missingLidar.needsMoreInfo, true);

    const incompatible = planAiWorkflow4('Ejecuta modelo Plaxis 3D elementos finitos', proj);
    assert.equal(incompatible.needsMoreInfo, true);
    assert.equal(incompatible.steps.length, 0);

    const unconfirmedDelete = planAiWorkflow4('Eliminar capa Polígonos Prediales', proj);
    assert.equal(unconfirmedDelete.requiresApproval, true);
    assert.equal(unconfirmedDelete.needsMoreInfo, true);

    const validPrompt = planAiWorkflow4('Calcula pendiente Horn, TWI D8 y buffer 250 m', proj);
    assert.equal(validPrompt.needsMoreInfo, false);
    assert.equal(validPrompt.cannotExecute, false);
    assert.ok(validPrompt.steps.length >= 3);
    assert.ok(validPrompt.dataKindClassification?.includes('observado'));
    assert.ok(validPrompt.dataKindClassification?.includes('modelo_analitico'));
  });

  it('6. Sustained Multi-Cycle Stability & Memory Benchmark (5 Cycles, 0 Errors, Bounded Heap)', async () => {
    const proj = makeSampleProject41();
    const bigPts: GeoFeatureCollection = {
      type: 'FeatureCollection',
      features: Array.from({ length: 1500 }, (_, i) => ({
        type: 'Feature',
        properties: { id: i, val: (i % 100) + 1.5 },
        geometry: { type: 'Point', coordinates: [-77.05 + (i % 50) * 0.002, -12.10 + Math.floor(i / 50) * 0.003] },
      })),
    };

    const cache = new GeospatialCache4();
    const heapBeforeMb = process.memoryUsage().heapUsed / (1024 * 1024);
    const latencies: number[] = [];
    let errorCount = 0;

    for (let cycle = 0; cycle < 5; cycle++) {
      const t0 = performance.now();
      try {
        const slope = computeSlopeGrid(proj.dem);
        const hydro = computeHydrologyD8AndTwi(proj.dem);
        const reprojected = transformFeatureCollectionCrs(bigPts, 'EPSG:4326', 'EPSG:32718');
        const lidarGround = classifyGroundMorphological(proj.lidarCloud || [], proj.dem.bounds);
        cache.set('rasters', `slope-${cycle}`, proj.id, slope);
        cache.get('rasters', `slope-${cycle}`);
        const tiff = exportDemToGeoTiffBuffer(hydro.twiGrid);
        const docx = await generateGeoReportDocxBuffer({ project: proj, organizationName: 'Org QA', authorName: 'QA', monitoringAlerts: [] });
        const xlsx = await generateGeoReportXlsxBuffer({ project: proj, monitoringAlerts: [] });
        assert.ok(reprojected.features.length === 1500);
        assert.ok(lidarGround.groundCount > 0);
        assert.ok(tiff.byteLength > 100);
        assert.ok(docx.byteLength > 500 && xlsx.byteLength > 500);
      } catch {
        errorCount++;
      }
      latencies.push(performance.now() - t0);
    }

    const heapAfterMb = process.memoryUsage().heapUsed / (1024 * 1024);
    const maxLatency = Math.max(...latencies);
    assert.equal(errorCount, 0, 'Sustained cycles must record zero errors');
    assert.ok(maxLatency < 10000, `Cycle max latency bounded (< 10s), got ${maxLatency.toFixed(1)} ms`);
    assert.ok(heapAfterMb - heapBeforeMb < 250, `Heap growth bounded (< 250 MB), delta ${(heapAfterMb - heapBeforeMb).toFixed(2)} MB`);
  });
});
