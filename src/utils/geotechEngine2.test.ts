import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DemGrid,
  GeoFeatureCollection,
  SpectralScene,
  BoreholeRecord,
} from './geotechEngine';
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
  evaluateMapAlgebraExpression,
  applyMapAlgebra,
  processRasterByBlocks,
  buildRasterPyramids,
  resampleAndReprojectRaster,
  mosaicRasters,
  computeZonalStats,
  RasterLruCache,
} from './rasterEngine2';
import {
  generateReferenceLidarSurvey,
  exportPointCloudToLasBuffer,
  parseLasBuffer,
  filterLidarNoiseSor,
  classifyGroundMorphological,
  classifyVegetationAndBuildings,
  buildLidarProducts,
  extractContourLinesGeoJson,
  extractLidarSwathProfile,
  computeLidarSurveyDiff,
} from './lidarEngine';
import {
  computeExtendedSpectralIndex,
  computeCustomSpectralFormula,
  applyDos1AtmosphericAndCloudMask,
  buildSpectralCompositeRgba,
  runSupervisedClassificationAndValidate,
} from './spectralEngine2';
import {
  buildBoreholeCrossSection,
  interpolateSubsurfaceSurfaces,
  computeBearingCapacity,
  computeSettlement1D,
  evaluateSeismicSlopeStability,
  computeBoreholeLpi,
  computeGeotechZoningMap,
} from './geotechPro2';
import {
  fillDemSinksPriorityFlood,
  computeAdvancedHydrology,
  computeHydroTerritorialExposure,
} from './hydrology2';

// Helper: 12x12 tilted plane + central sink for known mathematical ground truth
function makeTiltedDemWithSink(): DemGrid {
  const cols = 12;
  const rows = 12;
  const values: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Slopes downward towards East & South: z = 200 - 4*c - 2*r
      let z = 200 - 4 * c - 2 * r;
      if (r === 5 && c === 5) z = 110; // Artificial sink pit at (5,5)
      values.push(z);
    }
  }
  return {
    id: 'test-dem',
    name: 'Test DEM',
    cols,
    rows,
    cellSizeMeters: 20,
    bounds: [-76.9, -12.3, -76.86, -12.26],
    crs: 'EPSG:4326',
    noData: -9999,
    unit: 'msnm',
    values,
  };
}

function makeTestVectorFc(): GeoFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Zona Norte', codigo: 101 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-76.895, -12.275],
              [-76.875, -12.275],
              [-76.875, -12.262],
              [-76.895, -12.262],
              [-76.895, -12.275],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { name: 'Zona Sur', codigo: 102 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-76.885, -12.295],
              [-76.865, -12.295],
              [-76.865, -12.282],
              [-76.885, -12.282],
              [-76.885, -12.295],
            ],
          ],
        },
      },
    ],
  };
}

test('gisFormats2: ESRI Shapefile ZIP binary round-trip (.shp/.shx/.dbf/.prj) preserves polygons, attributes & UTM->WGS84 reprojection', async () => {
  const fc = makeTestVectorFc();
  const zipBytes = await exportGeoJsonToShapefileZip(fc, 'zonas_test', 'EPSG:32718');
  assert.ok(zipBytes.byteLength > 200);

  const imported = await parseShapefileZipBuffer(zipBytes.buffer as ArrayBuffer);
  assert.equal(imported.detectedCrs, 'EPSG:32718');
  assert.equal(imported.featureCount, 2);
  assert.equal(imported.geojson.features[0].geometry.type, 'Polygon');
  assert.equal(imported.geojson.features[0].properties?.name, 'Zona Norte');
  assert.equal(imported.geojson.features[0].properties?.codigo, 101);
  // Check WGS84 coordinates match original within proj4 rounding
  const coord = (imported.geojson.features[0].geometry as any).coordinates[0][0];
  assert.ok(Math.abs(coord[0] - -76.895) < 0.0005);
  assert.ok(Math.abs(coord[1] - -12.275) < 0.0005);
});

test('gisFormats2: Float32 GeoTIFF writer + geotiff windowed reader round-trip preserves values and bbox', async () => {
  const dem = makeTiltedDemWithSink();
  const tiffBuf = exportDemToGeoTiffBuffer(dem);
  assert.ok(tiffBuf.byteLength > dem.values.length * 4);

  const full = await readGeoTiffWindowed(tiffBuf, dem.bounds);
  assert.equal(full.sourceWidth, 12);
  assert.equal(full.sourceHeight, 12);
  assert.equal(full.grid.values[0], 200);

  // Read partial window [2, 2, 8, 8]
  const win = await readGeoTiffWindowed(tiffBuf, dem.bounds, [2, 2, 8, 8]);
  assert.equal(win.grid.cols, 6);
  assert.equal(win.grid.rows, 6);
  // Window top-left (r=2, c=2): 200 - 4*2 - 2*2 = 188
  assert.equal(win.grid.values[0], 188);
});

test('gisFormats2: AutoCAD DXF, OGC GML 3.2, and KMZ round-trip parsers work accurately', async () => {
  const fc = makeTestVectorFc();
  const dxf = exportGeoJsonToDxf(fc, 'EPSG:32718');
  const parsedDxf = parseDxfText(dxf, 'EPSG:32718');
  assert.equal(parsedDxf.featureCount, 2);
  assert.equal(parsedDxf.geojson.features[0].geometry.type, 'Polygon');

  const gml = exportGeoJsonToGml(fc, 'zonas_gml');
  const parsedGml = parseGmlText(gml);
  assert.equal(parsedGml.featureCount, 2);

  const kmz = await exportGeoJsonToKmzBuffer(fc, 'zonas_kmz');
  const parsedKmz = await parseKmzBuffer(kmz.buffer as ArrayBuffer);
  assert.equal(parsedKmz.featureCount, 2);
});

test('rasterEngine2: Safe Map Algebra parser evaluates arithmetic/functions and blocks unsafe tokens', () => {
  const dem = makeTiltedDemWithSink();
  const val = evaluateMapAlgebraExpression('(dem - 100) * 0.5 + max(2, 5)', { dem: 150 });
  assert.equal(val, 30);

  const mask = evaluateMapAlgebraExpression('slope > 15', { slope: 22 });
  assert.equal(mask, 1);

  assert.throws(() => evaluateMapAlgebraExpression('process.exit(1)', { dem: 1 }), /no soportada|desconocida|Carácter|inválido/i);

  const algRes = applyMapAlgebra('dem * 2 - alt', dem, { alt: dem });
  assert.equal(algRes.grid.values[0], dem.values[0]);
});

test('rasterEngine2: Halo block processing, overview pyramids, resampling, mosaicking, zonal stats & LRU cache', () => {
  const dem = makeTiltedDemWithSink();
  const blk = processRasterByBlocks(dem, 4, 'slope');
  assert.equal(blk.blocksProcessed, 9); // 12x12 divided into 4x4 blocks = 3x3 = 9 blocks
  assert.ok(blk.haloCellsRead > dem.values.length);

  const pyramids = buildRasterPyramids(dem);
  assert.equal(pyramids.length, 3);
  assert.equal(pyramids[1].cols, 6);
  assert.equal(pyramids[2].cols, 4); // clamped min 4

  const resamp = resampleAndReprojectRaster(dem, 24, 24, 'EPSG:32718', 'bilinear');
  assert.equal(resamp.grid.cols, 24);
  assert.ok(resamp.projectedCenter[0] > 200000); // Valid UTM Easting

  const mosaic = mosaicRasters([dem, { ...dem, values: dem.values.map((v) => v + 10) }], 'mean');
  assert.equal(mosaic.values[0], dem.values[0] + 5);

  const zonal = computeZonalStats(dem, makeTestVectorFc());
  assert.equal(zonal.length, 2);
  assert.ok(zonal[0].cellCount > 0 && zonal[0].mean > zonal[1].mean); // North is higher elevation than South

  const cache = new RasterLruCache(2);
  cache.set('a', dem);
  cache.set('b', dem);
  assert.ok(cache.get('a'));
  cache.set('c', dem); // Evicts 'b' since 'a' was just accessed
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.getStats().hits, 1);
  assert.equal(cache.getStats().misses, 1);
});

test('lidarEngine: Reference survey, SOR noise, morphological ground, veg/building classes, binary .las round-trip & contours', () => {
  const dem = makeTiltedDemWithSink();
  const rawCloud = generateReferenceLidarSurvey(dem);
  assert.ok(rawCloud.length > 100);

  const sor = filterLidarNoiseSor(rawCloud, 5, 1.8);
  const ground = classifyGroundMorphological(sor.points, dem.bounds, 12, 1.2);
  const fullCls = classifyVegetationAndBuildings(ground.points, dem.bounds, 12);
  assert.ok(ground.groundCount > 50);
  assert.ok(fullCls.vegCount + fullCls.buildingCount > 5);

  // Binary LAS 1.2 round-trip
  const lasBuf = exportPointCloudToLasBuffer(fullCls.points, 'EPSG:32718');
  const parsedLas = parseLasBuffer(lasBuf, 'EPSG:32718');
  assert.equal(parsedLas.version, '1.2');
  assert.equal(parsedLas.points.length, fullCls.points.length);
  assert.equal(parsedLas.points[0].classification, fullCls.points[0].classification);

  const products = buildLidarProducts(fullCls.points, dem.bounds, dem.crs, 20, 12, 12);
  assert.equal(products.totalPoints, fullCls.points.length);
  assert.ok(products.dsmGrid.values.every((v, i) => v >= products.dtmGrid.values[i] - 0.01));

  const contours = extractContourLinesGeoJson(dem, 10);
  assert.ok(contours.features.length > 3);
  assert.equal(contours.features[0].geometry.type, 'LineString');

  const swath = extractLidarSwathProfile(fullCls.points, [-76.895, -12.28], [-76.865, -12.28], 1000);
  assert.ok(swath.samples.length > 5);

  const diff = computeLidarSurveyDiff(fullCls.points, fullCls.points, dem.bounds, dem.crs, 20, 12, 12);
  assert.equal(diff.meanDeltaM, 0);
});

test('spectralEngine2: 11 spectral indices, custom formula, DOS1 correction, RGB buffer & Supervised Confusion Matrix/Kappa', () => {
  const cols = 8,
    rows = 8,
    n = cols * rows;
  const scene: SpectralScene = {
    id: 'spec-test',
    name: 'Test Scene',
    cols,
    rows,
    cellSizeMeters: 10,
    bounds: [-76.9, -12.3, -76.88, -12.28],
    crs: 'EPSG:4326',
    t1: {
      date: '2025-01-01',
      sensor: 'Sentinel-2',
      resolutionM: 10,
      blue: new Array(n).fill(0.08),
      green: new Array(n).fill(0.11),
      red: new Array(n).fill(0.07),
      nir: new Array(n).fill(0.55),
      swir1: new Array(n).fill(0.14),
      swir2: new Array(n).fill(0.08),
    },
    t2: {
      date: '2026-01-01',
      sensor: 'Sentinel-2',
      resolutionM: 10,
      blue: Array.from({ length: n }, (_, i) => (i < 16 ? 0.09 : i < 32 ? 0.28 : 0.06)), // incl cloud/urban patch
      green: Array.from({ length: n }, (_, i) => (i < 16 ? 0.14 : i < 32 ? 0.26 : 0.10)),
      red: Array.from({ length: n }, (_, i) => (i < 16 ? 0.05 : i < 32 ? 0.23 : 0.06)),
      nir: Array.from({ length: n }, (_, i) => (i < 16 ? 0.03 : i < 32 ? 0.22 : 0.60)),
      swir1: Array.from({ length: n }, (_, i) => (i < 16 ? 0.02 : i < 32 ? 0.34 : 0.14)),
      swir2: Array.from({ length: n }, (_, i) => (i < 16 ? 0.015 : i < 32 ? 0.27 : 0.07)),
    },
  };

  const bsi = computeExtendedSpectralIndex(scene, 't2', 'BSI');
  const ndmi = computeExtendedSpectralIndex(scene, 't2', 'NDMI');
  assert.ok(ndmi.max > 0.5);
  assert.ok(bsi.grid.values.length === n);

  const custom = computeCustomSpectralFormula(scene, 't1', '(nir - green) / (nir + green)');
  assert.ok(Math.abs(custom.mean - (0.55 - 0.11) / (0.55 + 0.11)) < 0.01);

  const dos1 = applyDos1AtmosphericAndCloudMask(scene, 't2', 0.25);
  assert.equal(dos1.cloudMaskedPixels, 16); // i=16..31 have blue=0.28 >= 0.25

  const rgba = buildSpectralCompositeRgba(scene, 't2', 'false_color_nir');
  assert.equal(rgba.length, n * 4);

  const sup = runSupervisedClassificationAndValidate(scene, 't2');
  assert.ok(sup.overallAccuracyPct >= 95);
  assert.ok(sup.kappa >= 0.9);
  assert.equal(sup.confusionMatrix.length, 4);
});

test('geotechPro2: Cross-section, subsurface IDW + uncertainty, Terzaghi/Meyerhof bearing capacity, 1D settlement, seismic Bishop & LPI', () => {
  const dem = makeTiltedDemWithSink();
  const boreholes: BoreholeRecord[] = [
    {
      id: 'bh-1',
      code: 'SPT-01',
      name: 'Sondeo Oeste',
      lng: -76.89,
      lat: -12.28,
      collarElevM: 150,
      totalDepthM: 18,
      waterTableDepthM: 3.0,
      pgaG: 0.38,
      strata: [
        { fromM: 0, toM: 5, lithology: 'Arena fina suelta', uscs: 'SP', sptN60: 8, unitWeightKnM3: 17.5, cohesionKpa: 2, frictionDeg: 28, color: '#fde68a' },
        { fromM: 5, toM: 18, lithology: 'Grava densa / Conglomerado', uscs: 'GW', sptN60: 44, unitWeightKnM3: 21.0, cohesionKpa: 18, frictionDeg: 38, color: '#94a3b8' },
      ],
    },
    {
      id: 'bh-2',
      code: 'SPT-02',
      name: 'Sondeo Este',
      lng: -76.87,
      lat: -12.28,
      collarElevM: 120,
      totalDepthM: 18,
      waterTableDepthM: 5.5,
      pgaG: 0.38,
      strata: [
        { fromM: 0, toM: 8, lithology: 'Limo arenoso', uscs: 'ML', sptN60: 14, unitWeightKnM3: 18.2, cohesionKpa: 8, frictionDeg: 30, color: '#cbd5e1' },
        { fromM: 8, toM: 18, lithology: 'Roca fracturada', uscs: 'R', sptN60: 50, unitWeightKnM3: 22.5, cohesionKpa: 45, frictionDeg: 40, color: '#475569' },
      ],
    },
  ];

  const section = buildBoreholeCrossSection(boreholes);
  assert.equal(section.columns.length, 2);
  assert.ok(section.totalLengthM > 1500);

  const sub = interpolateSubsurfaceSurfaces(boreholes, dem);
  assert.ok(sub.meanUncertaintyM > 0);
  assert.ok(sub.bedrockDepthGrid.values.every((v) => v >= 5 && v <= 8));

  // Textbook check: Meyerhof bearing capacity phi=30, c=0, B=2, Df=1.5, gamma=18
  const bearing = computeBearingCapacity({
    method: 'meyerhof',
    footingShape: 'strip',
    widthBM: 2.0,
    lengthLM: 10.0,
    embedmentDfM: 1.5,
    waterTableDepthM: 10.0,
    cohesionKpa: 0,
    frictionDeg: 30,
    unitWeightKnM3: 18,
    safetyFactor: 3.0,
  });
  // Nq for phi=30 is 18.40
  assert.ok(Math.abs(bearing.nq - 18.4) < 0.1);
  assert.ok(bearing.qUltKpa > 600 && bearing.qAdmKpa > 200);

  const settle = computeSettlement1D({
    appliedPressureKpa: 150,
    footingWidthBM: 2.0,
    soilElasticModulusKpa: 25000,
    poissonRatio: 0.3,
    compressibleLayerHm: 4.0,
    compressionIndexCc: 0.18,
    initialVoidRatioE0: 0.75,
    initialEffectiveStressKpa: 60,
  });
  assert.ok(settle.totalSettlementMm > settle.elasticImmediateMm);

  const seismic = evaluateSeismicSlopeStability({
    method: 'simplified_bishop',
    slopeAngleDeg: 32,
    slopeHeightM: 12,
    failureDepthM: 5,
    unitWeightKnM3: 19,
    cohesionKpa: 15,
    frictionDeg: 30,
    porePressureRatioRu: 0.2,
    seismicKh: 0.18,
  });
  assert.ok(seismic.seismicFs < seismic.staticFs); // Seismic inertia must reduce FS

  const lpi = computeBoreholeLpi(boreholes[0], 0.38);
  assert.ok(lpi.lpi > 0); // Shallow loose saturated sand (wt=3m, 0..5m N60=8) under 0.38g should yield positive LPI

  const zoning = computeGeotechZoningMap(dem, boreholes);
  assert.equal(zoning.zoningGrid.values.length, dem.values.length);
});

test('hydrology2: Priority-Flood eliminates sink pit and generates Strahler streams, watershed & Kirpich/Rational peak flow', () => {
  const dem = makeTiltedDemWithSink();
  // Cell (5,5) is an interior pit (110 vs neighbors ~168)
  const filled = fillDemSinksPriorityFlood(dem);
  assert.ok(filled.sinksFilledCount >= 1);
  assert.ok(filled.filledDem.values[5 * 12 + 5] >= 164); // Pit must be filled up to lowest rim (164m)!

  const hydro = computeAdvancedHydrology(dem, 50, 0.6);
  assert.ok(hydro.streamSegmentCount >= 1);
  assert.ok(hydro.maxStrahlerOrder >= 1);
  assert.ok(hydro.watershedGeoJson.features.length === 1);
  assert.ok(hydro.morphometry.kirpichTcMin > 0);
  assert.ok(hydro.morphometry.rationalPeakFlowM3s > 0);

  const ptsFc: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Planta Test' },
        geometry: { type: 'Point', coordinates: [-76.87, -12.29] },
      },
    ],
  };
  const exposure = computeHydroTerritorialExposure(hydro.twiGrid, hydro.streamNetworkGeoJson, ptsFc);
  assert.equal(exposure.length, 1);
  assert.ok(exposure[0].twiAtLocation > 0);
});
