import test from 'node:test';
import assert from 'node:assert/strict';
import type { Point } from 'geojson';
import type {
  BoreholeRecord,
  DemGrid,
  GeoFeatureCollection,
  GeotechLidarPoint,
  GeotechProject,
  GeotechProjectVersion,
  ModelBuilderGraph,
  SpectralScene,
} from './geotechEngine';
import { GeoEngine, computeSpatialUncertaintyAnalysis } from './geoEngine3';
import {
  computeConsolidatedQualityScore,
  validateLidarDataQuality,
  validateRasterDataQuality,
  validateVectorDataQuality,
} from './dataQualityEngine';
import {
  detectRasterAnomalies,
  runDemVsNdviSpatialRegression,
  runGeoMlClassification,
  runImageSegmentation,
  runThematicRemoteSensingWorkflow,
} from './geoMlEngine';
import {
  executeModelBuilderGraph,
  processBatchQueueItems,
  topologicalSortModelGraph,
} from './batchJobEngine';
import {
  GEOTECH_EQUATIONS_CATALOG,
  classifyAtterbergLabSample,
  computeHydrology3Analysis,
  interpretCptProfile,
} from './geotechHydro3';
import {
  ENTERPRISE_ROLES_MATRIX,
  GEOTECH_PROJECT_TEMPLATES,
  buildDefaultTemporalFrames,
  buildTemplateSeedArtifacts,
  computeProjectVersionDiff,
} from './geotechTemplates3';
import { runTestHMillionVectors } from './stressBenchmarks3';

function createSyntheticDem(cols = 20, rows = 20): DemGrid {
  const values: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      values.push(100 + c * 4 + (rows - r) * 2.5 + 8 * Math.sin(c * 0.4) * Math.cos(r * 0.4));
    }
  }
  return {
    id: 'dem-test-3',
    name: 'DEM Test 3.0',
    cols,
    rows,
    cellSizeMeters: 50,
    bounds: [-76.92, -12.32, -76.82, -12.22],
    crs: 'EPSG:4326',
    noData: -9999,
    unit: 'msnm',
    values,
  };
}

function createSyntheticSpectralScene(cols = 12, rows = 12): SpectralScene {
  const n = cols * rows;
  const makeBands = (shift: number, date: string) => {
    const blue: number[] = [];
    const green: number[] = [];
    const red: number[] = [];
    const nir: number[] = [];
    const swir1: number[] = [];
    const swir2: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const zone = (r * cols + c) % 4;
        if (zone === 0) {
          // Dense vegetation
          blue.push(0.04);
          green.push(0.08);
          red.push(0.05 + shift * 0.15);
          nir.push(0.48 - shift * 0.2);
          swir1.push(0.14);
          swir2.push(0.07 + shift * 0.2);
        } else if (zone === 1) {
          // Water body
          blue.push(0.09);
          green.push(0.12);
          red.push(0.06);
          nir.push(0.03);
          swir1.push(0.02);
          swir2.push(0.01);
        } else if (zone === 2) {
          // Urban / built-up
          blue.push(0.14);
          green.push(0.16);
          red.push(0.2);
          nir.push(0.19);
          swir1.push(0.32 + shift * 0.08);
          swir2.push(0.25);
        } else {
          // Bare soil / agricultural transition
          blue.push(0.09);
          green.push(0.13);
          red.push(0.15);
          nir.push(0.32);
          swir1.push(0.22);
          swir2.push(0.14);
        }
      }
    }
    return { date, sensor: 'Sentinel-2 L2A', resolutionM: 10, blue, green, red, nir, swir1, swir2 };
  };

  return {
    id: 'sc-test-3',
    name: 'Escena Sentinel-2 Bitemporal Test',
    cols,
    rows,
    cellSizeMeters: 20,
    bounds: [-76.92, -12.32, -76.82, -12.22],
    crs: 'EPSG:4326',
    t1: makeBands(0, '2025-05-15'),
    t2: makeBands(0.8, '2026-09-20'),
  };
}

function createSamplePointsFc(): GeoFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'EST-01', pm10: 42 }, geometry: { type: 'Point', coordinates: [-76.90, -12.30] } },
      { type: 'Feature', properties: { name: 'EST-02', pm10: 78 }, geometry: { type: 'Point', coordinates: [-76.87, -12.27] } },
      { type: 'Feature', properties: { name: 'EST-03', pm10: 55 }, geometry: { type: 'Point', coordinates: [-76.84, -12.24] } },
      { type: 'Feature', properties: { name: 'EST-04', pm10: 66 }, geometry: { type: 'Point', coordinates: [-76.88, -12.24] } },
    ],
  };
}

function createSamplePolygonFc(): GeoFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'ZONA-A', sector: 'Norte' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-76.91, -12.31], [-76.86, -12.31], [-76.86, -12.26], [-76.91, -12.26], [-76.91, -12.31]]],
        },
      },
    ],
  };
}

function createSampleProject(): GeotechProject {
  const dem = createSyntheticDem(12, 12);
  const scene = createSyntheticSpectralScene(12, 12);
  const lidar: GeotechLidarPoint[] = Array.from({ length: 120 }, (_, i) => ({
    lng: -76.91 + (i % 12) * 0.007,
    lat: -12.31 + Math.floor(i / 12) * 0.007,
    z: 115 + (i % 5),
    intensity: 180,
    returnNum: 1,
    classification: i % 3 === 0 ? 2 : i % 3 === 1 ? 4 : 6,
    hag: i % 3 === 0 ? 0 : 4.2,
  }));

  return {
    id: 'prj-test-3',
    code: 'SIG-TEST-3',
    name: 'Proyecto Integración 3.0',
    organizationId: 'org-1',
    domain: 'ambiental',
    areaHa: 1500,
    defaultCrs: 'EPSG:32718',
    center: [-76.87, -12.27],
    zoom: 12,
    description: 'Proyecto sintético para pruebas SIG & GEOTECH AI 3.0',
    createdAt: '2026-11-18',
    updatedAt: '2026-11-18',
    dem,
    spectralScene: scene,
    lidarCloud: lidar,
    layers: [
      {
        id: 'lyr-poly',
        name: 'Polígono AOI',
        category: 'infraestructura',
        kind: 'vector',
        visible: true,
        opacity: 0.8,
        crs: 'EPSG:4326',
        source: 'Campo',
        capturedDate: '2026-11-18',
        symbology: { color: '#059669' },
        geojson: createSamplePolygonFc(),
      },
      {
        id: 'lyr-pts',
        name: 'Estaciones PM10',
        category: 'ambiental',
        kind: 'vector',
        visible: true,
        opacity: 1,
        crs: 'EPSG:4326',
        source: 'Campo',
        capturedDate: '2026-11-18',
        symbology: { color: '#0284c7' },
        geojson: createSamplePointsFc(),
      },
    ],
    boreholes: [],
    operationHistory: [],
  };
}

test('GeoEngine selects backends accurately, emits PrecisionEnvelope, and rejects unconfigured external worker', () => {
  assert.equal(GeoEngine.selectBackend('buffer'), 'Turf / GEOS-JS');
  assert.equal(GeoEngine.selectBackend('reproject'), 'PROJ4 Reprojection Engine');
  assert.equal(GeoEngine.selectBackend('slope'), 'Raster Engine 3.0');
  assert.equal(GeoEngine.selectBackend('hydrology'), 'Hydrology D8/Priority-Flood');
  assert.equal(GeoEngine.selectBackend('gpkg_import', null), 'GDAL / PostGIS Worker (Externo)');

  const dem = createSyntheticDem(16, 16);
  const pts = createSamplePointsFc();

  const bufRes = GeoEngine.dispatch({ operation: 'buffer', featureCollection: pts, distanceMeters: 300 });
  assert.equal(bufRes.engineSelected, 'Turf / GEOS-JS');
  assert.equal(bufRes.featureCollection?.features.length, 4);
  assert.equal(bufRes.precision.dataKind, 'modelo_analitico');

  const repRes = GeoEngine.dispatch({
    operation: 'reproject',
    featureCollection: pts,
    fromCrs: 'EPSG:4326',
    toCrs: 'EPSG:32718',
  });
  assert.equal(repRes.precision.crs, 'EPSG:32718');
  const repGeom = repRes.featureCollection!.features[0].geometry as Point;
  assert.ok(Math.abs(repGeom.coordinates[0]) > 100000);

  const slpRes = GeoEngine.dispatch({ operation: 'slope', dem });
  assert.equal(slpRes.grid?.values.length, dem.values.length);

  const hydRes = GeoEngine.dispatch({ operation: 'hydrology', dem });
  assert.ok(hydRes.precision.warnings.some((w) => w.includes('HEC-RAS')));

  assert.throws(
    () => GeoEngine.dispatch({ operation: 'gpkg_import', externalWorkerUrl: null }),
    /GEOSPATIAL_WORKER_URL/
  );
  assert.throws(
    () => GeoEngine.dispatch({ operation: 'laz_import', externalWorkerUrl: '' }),
    /GEOSPATIAL_WORKER_URL/
  );
});

test('Data Quality Engine scores clean vs defective vector/raster/LiDAR layers accurately', () => {
  const cleanPoly = createSamplePolygonFc();
  const cleanVecRep = validateVectorDataQuality(cleanPoly, 'Limpia');
  assert.ok(cleanVecRep.score >= 90);
  assert.equal(cleanVecRep.selfIntersections, 0);

  const dirtyPoly: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          // Bowtie self-intersection + out-of-WGS84 coords
          coordinates: [[[300000, 8600000], [300200, 8600200], [300200, 8600000], [300000, 8600200], [300000, 8600000]]],
        },
      },
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[[300000, 8600000], [300200, 8600200], [300200, 8600000], [300000, 8600200], [300000, 8600000]]],
        },
      },
    ],
  };
  const dirtyVecRep = validateVectorDataQuality(dirtyPoly, 'Sucia');
  assert.ok(dirtyVecRep.score < 70);
  assert.ok(dirtyVecRep.crsOutOfBoundsCount >= 1);
  assert.ok(dirtyVecRep.duplicateGeometries >= 1);

  const dem = createSyntheticDem(12, 12);
  const cleanRas = validateRasterDataQuality(dem, dem);
  assert.equal(cleanRas.score, 100);

  const badDem: DemGrid = {
    ...dem,
    crs: 'EPSG:32718',
    values: dem.values.map((v, idx) => (idx < 15 ? Number.NaN : v)),
  };
  const badRas = validateRasterDataQuality(badDem, dem);
  assert.equal(badRas.nanOrInfCount, 15);
  assert.equal(badRas.crsMismatch, true);
  assert.ok(badRas.score < 75);

  const lidarPts: GeotechLidarPoint[] = [
    { lng: -76.9, lat: -12.3, z: 100, intensity: 120, returnNum: 1, classification: 2 },
    { lng: -76.9, lat: -12.3, z: 100, intensity: 120, returnNum: 1, classification: 2 },
    { lng: -76.85, lat: -12.25, z: 112, intensity: 140, returnNum: 1, classification: 6 },
  ];
  const lidRep = validateLidarDataQuality(lidarPts, dem.bounds);
  assert.equal(lidRep.duplicatePoints, 1);

  const consolidated = computeConsolidatedQualityScore({
    vectorLayer: { name: 'Limpia', geojson: cleanPoly },
    rasterGrid: dem,
    referenceDem: dem,
    lidarPoints: lidarPts,
  });
  assert.ok(consolidated.overallScore > 50 && consolidated.overallScore <= 100);
  assert.ok(consolidated.recommendations.length >= 1);
});

test('Spatial Uncertainty Engine produces dual result/confidence grids and AHP sensitivity metrics', () => {
  const dem = createSyntheticDem(14, 14);
  const pts = createSamplePointsFc();
  const report = computeSpatialUncertaintyAnalysis(pts, 'pm10', dem);

  assert.equal(report.resultGrid.values.length, dem.values.length);
  assert.equal(report.confidenceGrid.values.length, dem.values.length);
  assert.ok(report.confidenceGrid.values.every((v) => v >= 5 && v <= 99));
  assert.ok(report.overallConfidenceScore > 0 && report.overallConfidenceScore <= 100);
  assert.equal(report.sensitivitySummary.length, 2);
  assert.equal(report.precisionEnvelope.dataKind, 'interpolado');
});

test('GeoML 3.0 executes Random Forest, SVM, Decision Tree, OLS Regression, Anomalies, Segmentation & 6 Thematic Flows', () => {
  const scene = createSyntheticSpectralScene(12, 12);
  const dem = createSyntheticDem(12, 12);

  for (const algo of ['random_forest', 'svm', 'decision_tree'] as const) {
    const res = runGeoMlClassification(scene, 't1', algo, 'Tester');
    assert.equal(res.predictedGrid.values.length, 144);
    assert.ok(res.metrics.accuracyPct >= 0 && res.metrics.accuracyPct <= 100);
    assert.ok(res.metrics.confusionMatrix.length >= 2);
    assert.equal(res.precisionEnvelope.dataKind, 'prediccion_ml');
    assert.ok(res.savedModel.isPredictionWarning.includes('PREDICCIÓN ML'));
  }

  const ols = runDemVsNdviSpatialRegression(dem, scene, 't1');
  assert.equal(ols.predictedGrid.values.length, 144);
  assert.ok(Number.isFinite(ols.rmse) && Number.isFinite(ols.mae));
  assert.ok(ols.r2 >= 0 && ols.r2 <= 1);

  const anom = detectRasterAnomalies(dem, 1.5);
  assert.equal(anom.anomalyGrid.values.length, 144);
  assert.ok(anom.anomalyCount > 0);

  const seg = runImageSegmentation(scene, 't1', 0.08);
  assert.ok(seg.segmentCount >= 4);
  assert.equal(seg.segmentGrid.values.length, 144);

  const themes = ['deforestation', 'wildfire', 'agriculture', 'water_bodies', 'urbanization', 'soil_moisture'] as const;
  for (const wf of themes) {
    const out = runThematicRemoteSensingWorkflow(scene, wf);
    assert.equal(out.resultGrid.values.length, 144);
    assert.ok(out.affectedHa >= 0);
  }
});

test('Model Builder DAG detects cycles cleanly and executes end-to-end graph deterministically', () => {
  const proj = createSampleProject();
  const cyclicGraph: ModelBuilderGraph = {
    id: 'cyc',
    name: 'Cyclic',
    version: 'v1',
    description: 'Invalid',
    updatedAt: '2026-11-18',
    nodes: [
      { id: 'a', kind: 'dem_input', label: 'A', x: 0, y: 0, params: {} },
      { id: 'b', kind: 'slope', label: 'B', x: 100, y: 0, params: {} },
    ],
    edges: [
      { id: 'e1', fromNodeId: 'a', toNodeId: 'b' },
      { id: 'e2', fromNodeId: 'b', toNodeId: 'a' },
    ],
  };
  assert.throws(() => topologicalSortModelGraph(cyclicGraph), /ciclo cerrado/);

  const validGraph: ModelBuilderGraph = {
    id: 'dag-ok',
    name: 'Pipeline Completo',
    version: 'v1.0',
    description: 'Valid DAG',
    updatedAt: '2026-11-18',
    nodes: [
      { id: 'n1', kind: 'dem_input', label: 'DEM', x: 0, y: 0, params: {} },
      { id: 'n2', kind: 'fill_sinks', label: 'Fill', x: 100, y: 0, params: {} },
      { id: 'n3', kind: 'slope', label: 'Slope', x: 200, y: 0, params: {} },
      { id: 'n4', kind: 'reclassify', label: 'Reclass', x: 300, y: 0, params: { threshold: 10 } },
      { id: 'n5', kind: 'vector_input', label: 'Vec', x: 0, y: 100, params: {} },
      { id: 'n6', kind: 'buffer', label: 'Buf', x: 150, y: 100, params: { distanceMeters: 200 } },
      { id: 'n7', kind: 'output_layer', label: 'Out', x: 400, y: 50, params: { outputName: 'Salida DAG' } },
    ],
    edges: [
      { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
      { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
      { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4' },
      { id: 'e4', fromNodeId: 'n5', toNodeId: 'n6' },
      { id: 'e5', fromNodeId: 'n4', toNodeId: 'n7' },
      { id: 'e6', fromNodeId: 'n6', toNodeId: 'n7' },
    ],
  };

  const res = executeModelBuilderGraph(validGraph, proj);
  assert.equal(res.executionOrder.length, 7);
  assert.ok(res.producedRasters.length >= 3);
  assert.equal(res.producedLayers.length, 1);
  assert.ok(res.traces.every((t) => t.status === 'completado'));
});

test('Batch Queue supports checkpoint pause and exact resume without duplicating processed items', async () => {
  const items = Array.from({ length: 10 }, (_, i) => i + 1);
  const processed: number[] = [];

  const paused = await processBatchQueueItems({
    items,
    chunkSize: 2,
    shouldPauseOrCancel: () => (processed.length >= 4 ? 'pause' : 'run'),
    onItem: (item) => {
      processed.push(item);
      return `ok-${item}`;
    },
    onProgress: () => {},
  });

  assert.equal(paused.finalStatus, 'pausado');
  assert.equal(paused.completedItems, 4);

  const resumed = await processBatchQueueItems({
    items,
    startIndex: paused.completedItems,
    chunkSize: 2,
    shouldPauseOrCancel: () => 'run',
    onItem: (item) => {
      processed.push(item);
      return `ok-${item}`;
    },
    onProgress: () => {},
  });

  assert.equal(resumed.finalStatus, 'completado');
  assert.equal(resumed.completedItems, 10);
  assert.deepEqual(processed, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('Hydrology 3.0 & Geotech 3.0 produce Horton Rb/Rl/Ra, IDF curves, CPT SBT Ic and Atterberg classification', () => {
  const dem = createSyntheticDem(18, 18);
  const hydro3 = computeHydrology3Analysis(dem, 48, 0.6);

  assert.ok(hydro3.horton.bifurcationRatioRb > 0);
  assert.ok(hydro3.horton.lengthRatioRl > 0);
  assert.ok(hydro3.horton.areaRatioRa > 0);
  assert.equal(hydro3.idfMatrix.length, 20); // 5 return periods * 4 durations
  assert.equal(hydro3.scenarioComparison.length, 4);
  assert.ok(hydro3.taxonomyDistinction.hydraulicExternal.includes('HEC-RAS'));

  assert.equal(GEOTECH_EQUATIONS_CATALOG.length, 5);

  const bh: BoreholeRecord = {
    id: 'bh-cpt',
    code: 'CPT-01',
    name: 'Cono Sísmico Sur',
    lng: -76.88,
    lat: -12.28,
    collarElevM: 120,
    totalDepthM: 15,
    waterTableDepthM: 3.5,
    strata: [],
    cptProfile: [
      { depthM: 2, qcMpa: 1.2, fsKpa: 48, u2Kpa: 12 },
      { depthM: 6, qcMpa: 14.5, fsKpa: 95, u2Kpa: 28 },
    ],
  };
  const cptRows = interpretCptProfile(bh);
  assert.equal(cptRows.length, 2);
  assert.ok(cptRows[0].sbtIndexIc > cptRows[1].sbtIndexIc);

  const clay = classifyAtterbergLabSample(62, 24);
  assert.equal(clay.ipPct, 38);
  assert.ok(clay.casagrandeClass.startsWith('CH'));
  assert.equal(clay.expansivityRisk, 'Alto');
});

test('Templates, Enterprise Roles Matrix, Version Diff & 1M Vector Stress Test H function properly', () => {
  assert.equal(GEOTECH_PROJECT_TEMPLATES.length, 10);
  assert.equal(ENTERPRISE_ROLES_MATRIX.length, 10);
  assert.equal(buildDefaultTemporalFrames().length, 3);

  const seed = buildTemplateSeedArtifacts(
    GEOTECH_PROJECT_TEMPLATES[0],
    [-76.88, -12.28],
    'org-1',
    'EIA Prueba'
  );
  assert.ok((seed.layers?.length || 0) >= 2);
  assert.ok((seed.modelGraphs?.length || 0) === 1);

  const proj = createSampleProject();
  const verA: GeotechProjectVersion = {
    id: 'v1',
    label: 'v1.0',
    createdAt: '2026-11-18',
    author: 'Tester',
    layerCount: proj.layers.length,
    historyCount: 0,
    snapshot: {
      dem: proj.dem,
      layers: proj.layers,
      boreholes: proj.boreholes,
      defaultCrs: 'EPSG:32718',
    },
  };
  const verB: GeotechProjectVersion = {
    id: 'v2',
    label: 'v2.0',
    createdAt: '2026-11-18',
    author: 'Tester',
    layerCount: proj.layers.length + 1,
    historyCount: 1,
    snapshot: {
      dem: { ...proj.dem, values: proj.dem.values.map((v) => v + 2) },
      layers: [
        ...proj.layers,
        {
          id: 'lyr-extra',
          name: 'Capa Nueva V2',
          category: 'geoproceso',
          kind: 'vector',
          visible: true,
          opacity: 1,
          crs: 'EPSG:4326',
          source: 'Diff Test',
          capturedDate: '2026-11-18',
          symbology: { color: '#ef4444' },
          geojson: createSamplePointsFc(),
        },
      ],
      boreholes: proj.boreholes,
      defaultCrs: 'EPSG:4326',
    },
  };

  const diff = computeProjectVersionDiff(verA, verB);
  assert.equal(diff.crsChanged, true);
  assert.deepEqual(diff.layersAdded, ['Capa Nueva V2']);
  assert.equal(diff.demMeanElevationDeltaM, 2);

  const testH = runTestHMillionVectors();
  assert.equal(testH.status, 'APROBADO');
  assert.ok(testH.details.includes('entidades exactas'));
});
