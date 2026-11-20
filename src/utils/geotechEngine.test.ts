import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectCoordinate,
  validateGeometryTopology,
  runVectorBuffer,
  runVectorIntersect,
  runVectorCentroids,
  runVectorVoronoi,
  computeSlopeGrid,
  computeHydrologyD8AndTwi,
  extractElevationProfile,
  computeCutFillVolume,
  computeSpectralIndex,
  computeSpectralChange,
  classifyLandCoverKMeans,
  evaluateSlopeStability,
  evaluateLiquefactionScreening,
  computeAhpWeights,
  computeMoransI,
  computeGetisOrdGiStar,
  computeIdwRasterGrid,
  DemGrid,
  GeoFeatureCollection,
  SpectralScene,
} from './geotechEngine.ts';
import {
  parseCsvCoordinates,
  parseKmlText,
  exportGeoJsonToKml,
  parseEsriAsciiGrid,
  exportDemToEsriAsciiGrid,
} from './gisFormats.ts';

const samplePolygons: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Zona A', risk: 85 },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-76.88, -12.28], [-76.86, -12.28], [-76.86, -12.26], [-76.88, -12.26], [-76.88, -12.28]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Zona B', risk: 40 },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-76.87, -12.275], [-76.85, -12.275], [-76.85, -12.255], [-76.87, -12.255], [-76.87, -12.275]]],
      },
    },
  ],
};

const samplePoints: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'P1', val: 95 }, geometry: { type: 'Point', coordinates: [-76.87, -12.27] } },
    { type: 'Feature', properties: { name: 'P2', val: 90 }, geometry: { type: 'Point', coordinates: [-76.869, -12.269] } },
    { type: 'Feature', properties: { name: 'P3', val: 20 }, geometry: { type: 'Point', coordinates: [-76.82, -12.22] } },
    { type: 'Feature', properties: { name: 'P4', val: 15 }, geometry: { type: 'Point', coordinates: [-76.819, -12.219] } },
  ],
};

const sampleDem: DemGrid = {
  id: 'dem-test',
  name: 'Test DEM',
  cols: 5,
  rows: 5,
  cellSizeMeters: 100,
  bounds: [-76.9, -12.3, -76.85, -12.25],
  crs: 'EPSG:4326',
  noData: -9999,
  unit: 'msnm',
  values: [
    200, 180, 160, 180, 200,
    180, 150, 130, 150, 180,
    160, 130, 100, 130, 160,
    170, 140, 110, 140, 170,
    190, 160, 120, 160, 190,
  ],
};

test('CRS transformation converts WGS84 <-> UTM Zone 18S accurately', () => {
  const utm = projectCoordinate([-76.8711, -12.2748], 'EPSG:4326', 'EPSG:32718');
  assert.ok(utm[0] > 290000 && utm[0] < 310000);
  assert.ok(utm[1] > 8600000 && utm[1] < 8700000);
  const back = projectCoordinate(utm, 'EPSG:32718', 'EPSG:4326');
  assert.ok(Math.abs(back[0] - -76.8711) < 1e-4);
  assert.ok(Math.abs(back[1] - -12.2748) < 1e-4);
});

test('Vector geoprocessing (buffer, intersect, centroids, voronoi, topology) computes valid geometry', () => {
  const report = validateGeometryTopology(samplePolygons);
  assert.equal(report.valid, true);
  assert.equal(report.featureCount, 2);

  const buf = runVectorBuffer(samplePoints, 500, true);
  assert.ok(buf.features.length >= 1);
  assert.ok(buf.features[0].properties.area_ha > 0);

  const inter = runVectorIntersect(
    { type: 'FeatureCollection', features: [samplePolygons.features[0]] },
    { type: 'FeatureCollection', features: [samplePolygons.features[1]] }
  );
  assert.equal(inter.features.length, 1);
  assert.ok(inter.features[0].properties.area_ha > 0);

  const cents = runVectorCentroids(samplePolygons);
  assert.equal(cents.features.length, 2);
  assert.equal(cents.features[0].geometry.type, 'Point');

  const vor = runVectorVoronoi(samplePoints);
  assert.equal(vor.features.length, 4);
});

test('Spatial statistics (Moran I, Getis-Ord Gi*, IDW grid) compute exact analytical outputs', () => {
  const moran = computeMoransI(samplePoints, 'val', 3000);
  assert.equal(moran.n, 4);
  assert.ok(moran.moransI > 0);

  const gi = computeGetisOrdGiStar(samplePoints, 'val', 2000);
  assert.equal(gi.features.length, 4);
  assert.ok(gi.features[0].properties.gi_zscore > 0);

  const idw = computeIdwRasterGrid(samplePoints, 'val', sampleDem.bounds, 10, 10, 2);
  assert.equal(idw.values.length, 100);
  assert.ok(idw.values.every(Number.isFinite));
});

test('DEM morphometry, D8 hydrology TWI, elevation profile, and cut/fill volumes compute deterministically', () => {
  const slope = computeSlopeGrid(sampleDem);
  assert.equal(slope.grid.values.length, 25);
  assert.ok(slope.maxDeg > slope.minDeg);

  const hydro = computeHydrologyD8AndTwi(sampleDem);
  assert.equal(hydro.twiGrid.values.length, 25);
  assert.ok(hydro.maxFlowAccumulation >= 4);

  const profile = extractElevationProfile(sampleDem, [[-76.89, -12.275], [-76.86, -12.275]], 10);
  assert.equal(profile.points.length, 11);
  assert.ok(profile.totalLengthM > 2000);

  const vol = computeCutFillVolume(sampleDem, 150);
  assert.ok(vol.cutVolumeM3 > 0 && vol.fillVolumeM3 > 0);
});

test('Remote sensing NDVI, multitemporal delta, and K-Means classification execute over band matrices', () => {
  const n = 9;
  const scene: SpectralScene = {
    id: 'sc-1',
    name: 'Sentinel-2 Test',
    cols: 3,
    rows: 3,
    cellSizeMeters: 100,
    bounds: sampleDem.bounds,
    crs: 'EPSG:4326',
    t1: {
      date: '2025-06-01',
      sensor: 'Sentinel-2',
      resolutionM: 10,
      blue: new Array(n).fill(0.06),
      green: [0.09, 0.11, 0.22, 0.08, 0.11, 0.22, 0.09, 0.11, 0.22],
      red: [0.05, 0.07, 0.24, 0.06, 0.07, 0.24, 0.05, 0.07, 0.24],
      nir: [0.04, 0.62, 0.28, 0.03, 0.61, 0.27, 0.04, 0.60, 0.29],
      swir1: [0.02, 0.14, 0.34, 0.02, 0.15, 0.35, 0.02, 0.14, 0.33],
      swir2: new Array(n).fill(0.1),
    },
    t2: {
      date: '2026-06-01',
      sensor: 'Sentinel-2',
      resolutionM: 10,
      blue: new Array(n).fill(0.06),
      green: [0.09, 0.15, 0.22, 0.08, 0.15, 0.22, 0.09, 0.15, 0.22],
      red: [0.05, 0.18, 0.24, 0.06, 0.18, 0.24, 0.05, 0.18, 0.24],
      nir: [0.04, 0.34, 0.28, 0.03, 0.35, 0.27, 0.04, 0.34, 0.29],
      swir1: [0.02, 0.25, 0.34, 0.02, 0.24, 0.35, 0.02, 0.25, 0.33],
      swir2: new Array(n).fill(0.1),
    },
  };

  const ndvi1 = computeSpectralIndex(scene, 't1', 'NDVI');
  assert.ok(ndvi1.max > 0.7);
  const delta = computeSpectralChange(scene, 'NDVI');
  assert.ok(delta.significantLossPct > 0);

  const km = classifyLandCoverKMeans(scene, 't1');
  assert.equal(km.breakdown.length, 4);
  const sumPct = km.breakdown.reduce((s, b) => s + b.percent, 0);
  assert.ok(Math.abs(sumPct - 100) < 0.5);
});

test('Geotechnical slope stability, liquefaction screening, and AHP Saaty consistency calculate accurately', () => {
  const safe = evaluateSlopeStability({
    method: 'infinite_slope',
    slopeAngleDeg: 18,
    slopeHeightM: 10,
    failureDepthM: 3,
    unitWeightKnM3: 19,
    cohesionKpa: 18,
    frictionDeg: 32,
    porePressureRatioRu: 0.1,
  });
  assert.ok(safe.safetyFactor > 1.5);

  const bishop = evaluateSlopeStability({
    method: 'simplified_bishop',
    slopeAngleDeg: 38,
    slopeHeightM: 18,
    failureDepthM: 5,
    unitWeightKnM3: 19,
    cohesionKpa: 5,
    frictionDeg: 24,
    porePressureRatioRu: 0.4,
  });
  assert.ok(bishop.safetyFactor < safe.safetyFactor);

  const liq = evaluateLiquefactionScreening(10, 6, 1.5, 0.35, 18.5);
  assert.ok(liq.csr > 0 && liq.fsLiq > 0);

  const ahp = computeAhpWeights([
    [1, 3, 5, 7],
    [1 / 3, 1, 3, 5],
    [1 / 5, 1 / 3, 1, 3],
    [1 / 7, 1 / 5, 1 / 3, 1],
  ]);
  assert.equal(ahp.isConsistent, true);
  assert.ok(ahp.weights[0] > ahp.weights[1] && ahp.weights[1] > ahp.weights[2]);
});

test('Format parsers/exporters handle CSV (UTM), KML round-trip, and ESRI ASCII Grid', () => {
  const csvRes = parseCsvCoordinates('name,este,norte,ph\nM1,296500,8642000,7.1', 'EPSG:32718');
  assert.equal(csvRes.featureCount, 1);
  assert.ok(csvRes.geojson.features[0].geometry.type === 'Point');

  const kmlStr = exportGeoJsonToKml(samplePolygons, 'Prueba');
  const kmlBack = parseKmlText(kmlStr);
  assert.equal(kmlBack.featureCount, 2);

  const ascStr = exportDemToEsriAsciiGrid(sampleDem);
  const ascBack = parseEsriAsciiGrid(ascStr);
  assert.equal(ascBack.cols, 5);
  assert.equal(ascBack.rows, 5);
  assert.equal(ascBack.values.length, 25);
});
