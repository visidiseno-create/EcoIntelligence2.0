import type {
  GeotechProject,
  DemGrid,
  SpectralScene,
  BoreholeRecord,
} from '../utils/geotechEngine';
import { generateReferenceLidarSurvey } from '../utils/lidarEngine';
import { buildDefaultTemporalFrames } from '../utils/geotechTemplates3';

function buildRealisticDem(
  id: string,
  name: string,
  bounds: [number, number, number, number],
  cellSizeMeters: number,
  heightFn: (nx: number, ny: number) => number
): DemGrid {
  const cols = 32;
  const rows = 32;
  const values: number[] = new Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const ny = r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const nx = c / (cols - 1);
      values[r * cols + c] = Math.round(heightFn(nx, ny) * 100) / 100;
    }
  }
  return {
    id,
    name,
    cols,
    rows,
    cellSizeMeters,
    bounds,
    crs: 'EPSG:4326',
    noData: -9999,
    unit: 'msnm',
    values,
    colorScale: 'elevation',
  };
}

function buildDualDateSpectralScene(
  id: string,
  name: string,
  bounds: [number, number, number, number],
  cellSizeMeters: number
): SpectralScene {
  const cols = 32;
  const rows = 32;
  const n = cols * rows;

  const t1Blue = new Array<number>(n);
  const t1Green = new Array<number>(n);
  const t1Red = new Array<number>(n);
  const t1Nir = new Array<number>(n);
  const t1Swir1 = new Array<number>(n);
  const t1Swir2 = new Array<number>(n);

  const t2Blue = new Array<number>(n);
  const t2Green = new Array<number>(n);
  const t2Red = new Array<number>(n);
  const t2Nir = new Array<number>(n);
  const t2Swir1 = new Array<number>(n);
  const t2Swir2 = new Array<number>(n);
  const t2Thermal = new Array<number>(n);

  for (let r = 0; r < rows; r++) {
    const ny = r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const nx = c / (cols - 1);
      const idx = r * cols + c;

      // Diagonal river channel across terrain
      const riverDist = Math.abs(ny - (0.25 + 0.45 * nx + 0.06 * Math.sin(nx * 6)));
      const inRiver = riverDist < 0.055;
      const inRiparianVeg = !inRiver && riverDist < 0.24;
      const inClearedPatch = nx > 0.55 && nx < 0.82 && ny > 0.45 && ny < 0.72;

      if (inRiver) {
        // Water spectral signature
        t1Blue[idx] = 0.08; t1Green[idx] = 0.11; t1Red[idx] = 0.06; t1Nir[idx] = 0.04; t1Swir1[idx] = 0.02; t1Swir2[idx] = 0.015;
        t2Blue[idx] = 0.085; t2Green[idx] = 0.115; t2Red[idx] = 0.065; t2Nir[idx] = 0.042; t2Swir1[idx] = 0.022; t2Swir2[idx] = 0.016;
        t2Thermal[idx] = 292.4;
      } else if (inRiparianVeg) {
        // Dense vegetation (cleared patch loses vigor in T2)
        t1Blue[idx] = 0.05; t1Green[idx] = 0.09; t1Red[idx] = 0.06; t1Nir[idx] = 0.58; t1Swir1[idx] = 0.14; t1Swir2[idx] = 0.08;
        if (inClearedPatch) {
          t2Blue[idx] = 0.11; t2Green[idx] = 0.16; t2Red[idx] = 0.22; t2Nir[idx] = 0.27; t2Swir1[idx] = 0.31; t2Swir2[idx] = 0.23;
          t2Thermal[idx] = 304.8;
        } else {
          t2Blue[idx] = 0.052; t2Green[idx] = 0.095; t2Red[idx] = 0.058; t2Nir[idx] = 0.60; t2Swir1[idx] = 0.135; t2Swir2[idx] = 0.075;
          t2Thermal[idx] = 296.1;
        }
      } else if (nx < 0.38 && ny > 0.58) {
        // Urban / industrial facilities zone
        t1Blue[idx] = 0.14; t1Green[idx] = 0.18; t1Red[idx] = 0.21; t1Nir[idx] = 0.24; t1Swir1[idx] = 0.32; t1Swir2[idx] = 0.26;
        t2Blue[idx] = 0.15; t2Green[idx] = 0.19; t2Red[idx] = 0.23; t2Nir[idx] = 0.23; t2Swir1[idx] = 0.35; t2Swir2[idx] = 0.28;
        t2Thermal[idx] = 307.2;
      } else {
        // Sparse shrubland / dry foothill
        const v = 0.03 * Math.sin(nx * 10 + ny * 8);
        t1Blue[idx] = 0.09; t1Green[idx] = 0.14; t1Red[idx] = 0.15; t1Nir[idx] = 0.35 + v; t1Swir1[idx] = 0.24; t1Swir2[idx] = 0.17;
        t2Blue[idx] = 0.095; t2Green[idx] = 0.142; t2Red[idx] = 0.155; t2Nir[idx] = 0.34 + v; t2Swir1[idx] = 0.25; t2Swir2[idx] = 0.18;
        t2Thermal[idx] = 301.5;
      }
    }
  }

  return {
    id,
    name,
    cols,
    rows,
    cellSizeMeters,
    bounds,
    crs: 'EPSG:4326',
    t1: {
      date: '2025-11-10',
      sensor: 'Sentinel-2 L2A',
      resolutionM: 10,
      blue: t1Blue,
      green: t1Green,
      red: t1Red,
      nir: t1Nir,
      swir1: t1Swir1,
      swir2: t1Swir2,
    },
    t2: {
      date: '2026-11-12',
      sensor: 'Sentinel-2 L2A',
      resolutionM: 10,
      blue: t2Blue,
      green: t2Green,
      red: t2Red,
      nir: t2Nir,
      swir1: t2Swir1,
      swir2: t2Swir2,
      thermalK: t2Thermal,
    },
  };
}

export function createInitialGeotechProjects(): GeotechProject[] {
  const lurinBounds: [number, number, number, number] = [-76.915, -12.315, -76.825, -12.235];
  const lurinDem = buildRealisticDem(
    'dem-lurin-01',
    'DEM Valle Lurín (SRTM/LiDAR 30m)',
    lurinBounds,
    300,
    (nx, ny) => {
      // Valley axis roughly diagonal from NE highlands to SW coast
      const valleyDist = Math.abs(ny - (0.25 + 0.45 * nx));
      const baseSlope = 45 + nx * 165 + (1 - ny) * 95;
      const hillRidges = Math.pow(valleyDist, 1.35) * 420 + 28 * Math.sin(nx * 7) * Math.cos(ny * 6);
      return Math.max(25, baseSlope + hillRidges);
    }
  );

  const icaBounds: [number, number, number, number] = [-75.805, -14.025, -75.715, -13.945];
  const icaDem = buildRealisticDem(
    'dem-ica-02',
    'DEM Taludes & Quebrada Villacurí',
    icaBounds,
    280,
    (nx, ny) => {
      // Steep escarpment running N-S on east side
      const scarp = 1 / (1 + Math.exp(-(nx - 0.62) * 14));
      return 380 + scarp * 290 + ny * 55 + 18 * Math.sin(ny * 9);
    }
  );

  const callaoBounds: [number, number, number, number] = [-77.148, -12.012, -77.118, -11.986];
  const callaoDem = buildRealisticDem(
    'dem-callao-03',
    'DEM Parque Industrial Callao–Ventanilla',
    callaoBounds,
    95,
    (nx, ny) => 14 + nx * 24 + ny * 11 + 4 * Math.sin(nx * 6) * Math.cos(ny * 5)
  );

  const lurinBoreholes: BoreholeRecord[] = [
    {
      id: 'bh-lur-1',
      code: 'CPT-LUR-01',
      name: 'Sondeo Planta PTAR Norte',
      lng: -76.872,
      lat: -12.274,
      collarElevM: 92,
      totalDepthM: 18,
      waterTableDepthM: 4.2,
      pgaG: 0.35,
      strata: [
        { fromM: 0, toM: 2.5, lithology: 'Relleno granular compactado', uscs: 'GM', sptN60: 14, unitWeightKnM3: 18.2, cohesionKpa: 5, frictionDeg: 31, color: '#d97706' },
        { fromM: 2.5, toM: 7.5, lithology: 'Arena limosa aluvial saturada', uscs: 'SM', sptN60: 11, unitWeightKnM3: 18.6, cohesionKpa: 4, frictionDeg: 29, color: '#f59e0b' },
        { fromM: 7.5, toM: 13.0, lithology: 'Grava mal gradada densa', uscs: 'GP', sptN60: 36, unitWeightKnM3: 20.5, cohesionKpa: 2, frictionDeg: 38, color: '#78716c' },
        { fromM: 13.0, toM: 18.0, lithology: 'Basamento andesítico moderadamente fracturado', uscs: 'Roca', sptN60: 50, unitWeightKnM3: 24.5, cohesionKpa: 120, frictionDeg: 42, color: '#475569' },
      ],
      cptProfile: [
        { depthM: 1.5, qcMpa: 6.4, fsKpa: 48, u2Kpa: 5 },
        { depthM: 4.5, qcMpa: 3.1, fsKpa: 52, u2Kpa: 42 },
        { depthM: 9.0, qcMpa: 16.8, fsKpa: 95, u2Kpa: 78 },
        { depthM: 14.0, qcMpa: 28.5, fsKpa: 140, u2Kpa: 110 },
      ],
      labTests: [
        { sampleId: 'M-LUR-01', depthM: 3.2, moisturePct: 22.4, liquidLimitPct: 31.0, plasticLimitPct: 22.5, plasticityIndexPct: 8.5, finesPct: 38, bulkDensityKnM3: 18.6, cohesionKpa: 4, frictionDeg: 29 },
        { sampleId: 'M-LUR-02', depthM: 6.0, moisturePct: 24.1, liquidLimitPct: 28.5, plasticLimitPct: 21.0, plasticityIndexPct: 7.5, finesPct: 34, bulkDensityKnM3: 18.8, cohesionKpa: 5, frictionDeg: 30 },
      ],
    },
    {
      id: 'bh-lur-2',
      code: 'SPT-LUR-02',
      name: 'Sondeo Ladera Este Almacén',
      lng: -76.854,
      lat: -12.266,
      collarElevM: 168,
      totalDepthM: 15,
      waterTableDepthM: 9.8,
      pgaG: 0.35,
      strata: [
        { fromM: 0, toM: 3.0, lithology: 'Limo arcilloso coluvial', uscs: 'CL', sptN60: 12, unitWeightKnM3: 17.8, cohesionKpa: 18, frictionDeg: 24, color: '#b45309' },
        { fromM: 3.0, toM: 9.0, lithology: 'Grava arcillosa densa', uscs: 'GC', sptN60: 28, unitWeightKnM3: 19.8, cohesionKpa: 12, frictionDeg: 34, color: '#78716c' },
        { fromM: 9.0, toM: 15.0, lithology: 'Roca intrusiva sana', uscs: 'Roca', sptN60: 50, unitWeightKnM3: 25.0, cohesionKpa: 150, frictionDeg: 44, color: '#334155' },
      ],
    },
  ];

  const icaBoreholes: BoreholeRecord[] = [
    {
      id: 'bh-ica-1',
      code: 'SPT-ICA-01',
      name: 'Pie de Talud Este Villacurí',
      lng: -75.752,
      lat: -13.982,
      collarElevM: 432,
      totalDepthM: 22,
      waterTableDepthM: 12.5,
      pgaG: 0.40,
      strata: [
        { fromM: 0, toM: 4.5, lithology: 'Arena eólica suelta a media', uscs: 'SP', sptN60: 9, unitWeightKnM3: 17.2, cohesionKpa: 2, frictionDeg: 28, color: '#eab308' },
        { fromM: 4.5, toM: 11.0, lithology: 'Limo de alta plasticidad (Fm. Pisco)', uscs: 'MH', sptN60: 16, unitWeightKnM3: 18.0, cohesionKpa: 24, frictionDeg: 22, color: '#a16207' },
        { fromM: 11.0, toM: 17.5, lithology: 'Conglomerado cementado', uscs: 'GW', sptN60: 42, unitWeightKnM3: 21.0, cohesionKpa: 15, frictionDeg: 39, color: '#57534e' },
        { fromM: 17.5, toM: 22.0, lithology: 'Lutita diatomácea compacta', uscs: 'Roca', sptN60: 50, unitWeightKnM3: 22.8, cohesionKpa: 95, frictionDeg: 37, color: '#475569' },
      ],
    },
    {
      id: 'bh-ica-2',
      code: 'SPT-ICA-02',
      name: 'Corona de Escarpe Norte',
      lng: -75.736,
      lat: -13.968,
      collarElevM: 645,
      totalDepthM: 20,
      waterTableDepthM: 18.0,
      pgaG: 0.40,
      strata: [
        { fromM: 0, toM: 3.5, lithology: 'Coluvio gravoso heterogéneo', uscs: 'GM', sptN60: 18, unitWeightKnM3: 18.9, cohesionKpa: 8, frictionDeg: 33, color: '#d97706' },
        { fromM: 3.5, toM: 12.0, lithology: 'Arenisca tobácea fracturada', uscs: 'Roca', sptN60: 44, unitWeightKnM3: 22.4, cohesionKpa: 65, frictionDeg: 38, color: '#64748b' },
        { fromM: 12.0, toM: 20.0, lithology: 'Macizo granodiorítico competente', uscs: 'Roca', sptN60: 50, unitWeightKnM3: 25.6, cohesionKpa: 180, frictionDeg: 45, color: '#334155' },
      ],
    },
  ];

  const callaoBoreholes: BoreholeRecord[] = [
    {
      id: 'bh-cal-1',
      code: 'SPT-CAL-01',
      name: 'Sector Naves Sur (Zona Costera)',
      lng: -77.133,
      lat: -12.002,
      collarElevM: 19,
      totalDepthM: 16,
      waterTableDepthM: 2.1,
      pgaG: 0.45,
      strata: [
        { fromM: 0, toM: 2.2, lithology: 'Relleno de afirmado industrial', uscs: 'GW', sptN60: 22, unitWeightKnM3: 19.5, cohesionKpa: 4, frictionDeg: 35, color: '#9ca3af' },
        { fromM: 2.2, toM: 8.5, lithology: 'Arena fina limosa saturada (Susceptible)', uscs: 'SM', sptN60: 10, unitWeightKnM3: 18.4, cohesionKpa: 2, frictionDeg: 28, color: '#f59e0b' },
        { fromM: 8.5, toM: 16.0, lithology: 'Conglomerado aluvial compacto (Lima)', uscs: 'GP', sptN60: 48, unitWeightKnM3: 21.5, cohesionKpa: 8, frictionDeg: 41, color: '#57534e' },
      ],
    },
  ];

  return [
    {
      id: 'gis-proj-1',
      organizationId: 'org-1',
      code: 'SIG-AMB-2026-01',
      name: 'Cuenca Baja Lurín & Área de Influencia Ambiental',
      domain: 'ambiental',
      description:
        'Proyecto integral de ingeniería ambiental (Prueba A): monitoreo de calidad de aire/agua, red hidrográfica, zonas de amortiguamiento ecológico y análisis multitemporal Sentinel-2 sobre 50,000 ha territoriales.',
      areaHa: 50000,
      defaultCrs: 'EPSG:32718',
      center: [-76.87, -12.275],
      zoom: 12,
      dem: lurinDem,
      spectralScene: buildDualDateSpectralScene(
        'sc-lurin-2026',
        'Escena Bitemporal Sentinel-2 Valle Lurín',
        lurinBounds,
        300
      ),
      boreholes: lurinBoreholes,
      layers: [
        {
          id: 'lyr-lur-fac',
          name: 'Instalaciones Corporativas & Plantas',
          category: 'infraestructura',
          kind: 'vector',
          visible: true,
          opacity: 1,
          crs: 'EPSG:4326',
          source: 'Registro Maestro ECOINTELLIGENCE (db.facilities)',
          capturedDate: '2026-11-17',
          metadata: { provenance: 'observado', notes: 'Sincronizado con coordenadas verificadas.' },
          symbology: { color: '#059669', fillColor: '#10b981', fillOpacity: 0.85, radius: 8, labelField: 'name' },
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { id: 'fac-1', name: 'Planta Principal Lurín', code: 'PLT-LUR-01', permiso: 'DIA-PRODUCE-2023-049', riesgo_indice: 42 },
                geometry: { type: 'Point', coordinates: [-76.8711, -12.2748] },
              },
              {
                type: 'Feature',
                properties: { id: 'fac-1b', name: 'Planta Tratamiento Efluentes (PTAR)', code: 'PTAR-LUR-01', permiso: 'PAMA-MVCS-2024', riesgo_indice: 68 },
                geometry: { type: 'Point', coordinates: [-76.879, -12.281] },
              },
            ],
          },
        },
        {
          id: 'lyr-lur-mon',
          name: 'Red de Monitoreo Calidad Aire & Agua',
          category: 'ambiental',
          kind: 'vector',
          visible: true,
          opacity: 1,
          crs: 'EPSG:4326',
          source: 'Campaña Monitoreo Ambiental Q4-2026',
          capturedDate: '2026-11-04',
          metadata: { provenance: 'observado', notes: 'Valores acreditados INACAL (PM10 µg/m³, DQO mg/L).' },
          symbology: { color: '#0284c7', fillColor: '#38bdf8', fillOpacity: 0.85, radius: 6, labelField: 'station' },
          geojson: {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', properties: { station: 'CA-01 Barlovento', pm10_ugm3: 48.2, dqo_mgl: 35, ph: 7.2 }, geometry: { type: 'Point', coordinates: [-76.892, -12.289] } },
              { type: 'Feature', properties: { station: 'CA-02 Chimenea Sur', pm10_ugm3: 94.6, dqo_mgl: 112, ph: 7.4 }, geometry: { type: 'Point', coordinates: [-76.874, -12.277] } },
              { type: 'Feature', properties: { station: 'CA-03 Sotavento Industrial', pm10_ugm3: 108.4, dqo_mgl: 128, ph: 7.8 }, geometry: { type: 'Point', coordinates: [-76.863, -12.269] } },
              { type: 'Feature', properties: { station: 'CA-04 Quebrada Alta', pm10_ugm3: 32.5, dqo_mgl: 28, ph: 7.1 }, geometry: { type: 'Point', coordinates: [-76.842, -12.252] } },
              { type: 'Feature', properties: { station: 'CA-05 Poblado Receptor', pm10_ugm3: 76.1, dqo_mgl: 64, ph: 7.3 }, geometry: { type: 'Point', coordinates: [-76.885, -12.262] } },
              { type: 'Feature', properties: { station: 'CA-06 Zona Agrícola', pm10_ugm3: 54.0, dqo_mgl: 45, ph: 7.0 }, geometry: { type: 'Point', coordinates: [-76.855, -12.292] } },
            ],
          },
        },
        {
          id: 'lyr-lur-rio',
          name: 'Eje Hidrográfico Río Lurín',
          category: 'hidrologia',
          kind: 'vector',
          visible: true,
          opacity: 0.9,
          crs: 'EPSG:4326',
          source: 'ANA — Red Hidrográfica Oficial Escala 1:25,000',
          capturedDate: '2025-08-15',
          metadata: { provenance: 'oficial' },
          symbology: { color: '#2563eb', weight: 3 },
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'Río Lurín Tramo Bajo', orden: 4, caudal_m3s: 6.8 },
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [-76.828, -12.254],
                    [-76.852, -12.266],
                    [-76.875, -12.279],
                    [-76.898, -12.295],
                    [-76.912, -12.306],
                  ],
                },
              },
            ],
          },
        },
        {
          id: 'lyr-lur-prot',
          name: 'Lomas & Faja Marginal Protegida',
          category: 'ambiental',
          kind: 'vector',
          visible: true,
          opacity: 0.65,
          crs: 'EPSG:4326',
          source: 'SERNANP / Zonificación Ecológica',
          capturedDate: '2026-01-10',
          metadata: { provenance: 'oficial' },
          symbology: { color: '#15803d', fillColor: '#22c55e', fillOpacity: 0.22, weight: 2 },
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'Ecosistema Frágil Lomas de Lurín', category: 'Conservación Prioritaria', restriccion: 'Exclusión Absoluta' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [[
                    [-76.865, -12.265],
                    [-76.835, -12.265],
                    [-76.835, -12.242],
                    [-76.865, -12.242],
                    [-76.865, -12.265],
                  ]],
                },
              },
              {
                type: 'Feature',
                properties: { name: 'Área de Amortiguamiento Agrícola Sur', category: 'Uso Restringido', restriccion: 'Condicionada' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [[
                    [-76.895, -12.305],
                    [-76.862, -12.305],
                    [-76.862, -12.285],
                    [-76.895, -12.285],
                    [-76.895, -12.305],
                  ]],
                },
              },
            ],
          },
        },
      ],
      operationHistory: [
        {
          id: 'op-init-1',
          timestamp: '2026-11-17 09:00:00',
          tool: 'Sincronización de Proyecto Base',
          module: 'SIG Core',
          agent: 'Agente de Datos',
          parameters: { crs: 'EPSG:32718', demCellSizeM: 300 },
          inputLayers: ['Instalaciones Corporativas', 'Red Monitoreo', 'Río Lurín', 'Lomas Protegidas'],
          durationMs: 14,
          status: 'completado',
          summary: 'Proyecto ambiental inicializado con 4 capas vectoriales, DEM 32x32 y escena Sentinel-2 T1/T2.',
        },
      ],
      lidarCloud: generateReferenceLidarSurvey(lurinDem, undefined, 1),
      savedWorkflows: [
        {
          id: 'wf-env-baseline',
          name: 'Auditoría Territorial Ambiental & Riesgo Hídrico',
          description: 'Calcula pendientes Horn, TWI sin sumideros, NDVI actual e idoneidad multicriterio AHP.',
          createdAt: '2026-11-17T09:00:00Z',
          createdBy: 'Sistema SIG 2.0',
          steps: [
            { tool: 'slope', label: 'Pendiente Topográfica Horn 3x3', agent: 'Agente Topográfico', params: {} },
            { tool: 'twi_hydrology', label: 'Flujo D8 e Índice TWI', agent: 'Agente Hidrológico', params: {} },
            { tool: 'ahp_suitability', label: 'Mapa Multicriterio AHP', agent: 'Agente Territorial', params: {} },
          ],
        },
      ],
      modelGraphs: [
        {
          id: 'mb-lurin-eia-1',
          name: 'Modelo Territorial Ambiental Cuenca Lurín',
          version: 'v1.0',
          description: 'DEM → Fill Sinks → Pendiente → Reclasificar >18° → Buffer 250m → AHP → Salida',
          updatedAt: '2026-11-18T08:00:00Z',
          nodes: [
            { id: 'n1', kind: 'dem_input', label: 'DEM Valle Lurín', x: 35, y: 75, params: {} },
            { id: 'n2', kind: 'fill_sinks', label: 'Fill Sinks', x: 185, y: 75, params: {} },
            { id: 'n3', kind: 'slope', label: 'Slope Horn (°)', x: 335, y: 75, params: {} },
            { id: 'n4', kind: 'reclassify', label: 'Reclasif >18°', x: 485, y: 75, params: { threshold: 18 } },
            { id: 'n5', kind: 'ahp_suitability', label: 'AHP Idoneidad', x: 635, y: 75, params: { maxSlopeDeg: 35 } },
            { id: 'n6', kind: 'output_layer', label: 'Capa Salida', x: 785, y: 75, params: { outputName: 'Aptitud Territorial Lurín' } },
          ],
          edges: [
            { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
            { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
            { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4' },
            { id: 'e4', fromNodeId: 'n4', toNodeId: 'n5' },
            { id: 'e5', fromNodeId: 'n5', toNodeId: 'n6' },
          ],
        },
      ],
      temporalFrames: buildDefaultTemporalFrames(),
      iotSensors: [
        { id: 'iot-lur-1', code: 'PZ-LUR-01', name: 'Piezómetro Automático PTAR', sensorType: 'piezometro', lng: -76.872, lat: -12.274, lastValue: 4.15, unit: 'm b.s.', thresholdWarning: 2.5, status: 'normal', updatedAt: '2026-11-18 08:30' },
        { id: 'iot-lur-2', code: 'AQ-LUR-03', name: 'Estación PM10 Sotavento', sensorType: 'estacion_aire', lng: -76.863, lat: -12.269, lastValue: 108.4, unit: 'µg/m³', thresholdWarning: 100, status: 'alerta', updatedAt: '2026-11-18 08:30' },
      ],
      comments: [
        { id: 'cmt-1', author: 'Dr. Roberto Santillán', authorRole: 'Auditor Ambiental', createdAt: '2026-11-18 08:15', targetType: 'project', targetName: 'Cuenca Baja Lurín', message: 'Validar faja marginal del Río Lurín con umbral de período de retorno Tr=100 años antes de aprobar ampliación.', resolved: false },
      ],
      approvals: [
        { id: 'apr-1', stage: 'Línea Base Cartográfica & Hidrología D8', requestedBy: 'Ing. Valeria Mendoza', reviewer: 'Dr. Roberto Santillán', status: 'aprobado', notes: 'Conformidad verificada en EPSG:32718.', updatedAt: '2026-11-18 09:00' },
      ],
      createdAt: '2026-11-10T09:00:00Z',
      updatedAt: '2026-11-18T09:00:00Z',
    },
    {
      id: 'gis-proj-2',
      organizationId: 'org-1',
      code: 'GEO-TAL-2026-02',
      name: 'Zonificación Geotécnica & Taludes Villacurí – Ica',
      domain: 'geotecnia',
      description:
        'Proyecto geotécnico y geológico (Prueba B): cartografía de fallas, unidades litológicas, 2 sondeos SPT con perfil estratigráfico 3D y análisis de estabilidad de laderas mediante Bishop Simplificado.',
      areaHa: 12400,
      defaultCrs: 'EPSG:32718',
      center: [-75.76, -13.985],
      zoom: 12,
      dem: icaDem,
      boreholes: icaBoreholes,
      layers: [
        {
          id: 'lyr-ica-units',
          name: 'Unidades Geotécnicas & Litología',
          category: 'geotecnia',
          kind: 'vector',
          visible: true,
          opacity: 0.7,
          crs: 'EPSG:4326',
          source: 'INGEMMET — Carta Geológica Nacional 1:50,000',
          capturedDate: '2025-11-20',
          metadata: { provenance: 'oficial' },
          symbology: { color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.24, weight: 2 },
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'Unidad U-I: Depósito Eólico / Aluvial', uscs: 'SP-SM', capacidad_portante_kgcm2: 1.4, susceptibilidad: 'Media-Alta' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [[[-75.798, -14.018], [-75.756, -14.018], [-75.756, -13.952], [-75.798, -13.952], [-75.798, -14.018]]],
                },
              },
              {
                type: 'Feature',
                properties: { name: 'Unidad U-II: Escarpe Formación Pisco / Macizo', uscs: 'Roca / MH', capacidad_portante_kgcm2: 3.8, susceptibilidad: 'Alta por Pendiente' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [[[-75.756, -14.018], [-75.720, -14.018], [-75.720, -13.952], [-75.756, -13.952], [-75.756, -14.018]]],
                },
              },
            ],
          },
        },
        {
          id: 'lyr-ica-faults',
          name: 'Lineamientos & Fallas Geológicas',
          category: 'geotecnia',
          kind: 'vector',
          visible: true,
          opacity: 0.95,
          crs: 'EPSG:4326',
          source: 'Levantamiento Estructural Campo 2026',
          capturedDate: '2026-09-12',
          metadata: { provenance: 'observado' },
          symbology: { color: '#dc2626', weight: 2.5 },
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'Falla Inversa Villacurí Este', tipo: 'Inversa Activa Cuaternaria', buzamiento_deg: 62 },
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [-75.754, -13.952],
                    [-75.749, -13.978],
                    [-75.743, -14.012],
                  ],
                },
              },
            ],
          },
        },
      ],
      operationHistory: [],
      lidarCloud: generateReferenceLidarSurvey(icaDem, undefined, 1),
      savedWorkflows: [
        {
          id: 'wf-geo-talud',
          name: 'Tamizaje Geotécnico & Estabilidad de Taludes',
          description: 'Evalúa pendientes críticas y estabilidad Bishop sobre escarpe Villacurí.',
          createdAt: '2026-11-17T09:00:00Z',
          createdBy: 'Sistema SIG 2.0',
          steps: [
            { tool: 'slope', label: 'Mapa de Pendientes del Escarpe', agent: 'Agente Topográfico', params: {} },
            { tool: 'slope_stability', label: 'Evaluación Bishop Simplificado', agent: 'Agente Geotécnico', params: { method: 'simplified_bishop' } },
          ],
        },
      ],
      createdAt: '2026-11-11T11:00:00Z',
      updatedAt: '2026-11-17T09:00:00Z',
    },
    {
      id: 'gis-proj-3',
      organizationId: 'org-2',
      code: 'IND-PARQ-2026-03',
      name: 'Parque Industrial Callao–Ventanilla (50 ha · 12 Naves)',
      domain: 'industrial',
      description:
        'Proyecto industrial (Prueba C): ordenamiento espacial de 50 hectáreas con 12 naves industriales, red vial interna, cinturón verde amortiguador, análisis de corte/relleno de plataformas y tamizaje de licuefacción costera.',
      areaHa: 50,
      defaultCrs: 'EPSG:32718',
      center: [-77.133, -11.999],
      zoom: 14,
      dem: callaoDem,
      spectralScene: buildDualDateSpectralScene(
        'sc-callao-2026',
        'Monitoreo Isla de Calor & Cobertura Callao',
        callaoBounds,
        95
      ),
      boreholes: callaoBoreholes,
      layers: [
        {
          id: 'lyr-cal-naves',
          name: '12 Naves Industriales & Plataformas',
          category: 'infraestructura',
          kind: 'vector',
          visible: true,
          opacity: 0.9,
          crs: 'EPSG:4326',
          source: 'Catastro de Ingeniería Parque Industrial 2026',
          capturedDate: '2026-10-25',
          metadata: { provenance: 'observado' },
          symbology: { color: '#4f46e5', fillColor: '#6366f1', fillOpacity: 0.45, weight: 1.5, labelField: 'name' },
          geojson: {
            type: 'FeatureCollection',
            features: Array.from({ length: 12 }, (_, idx) => {
              const col = idx % 4;
              const row = Math.floor(idx / 4);
              const lng0 = -77.142 + col * 0.0052;
              const lat0 = -12.006 + row * 0.0052;
              return {
                type: 'Feature' as const,
                properties: {
                  name: `Nave Industrial N-${String(idx + 1).padStart(2, '0')}`,
                  uso: idx < 6 ? 'Fundición & Laminación' : 'Galvanizado & Logística',
                  cota_proyecto_msnm: 26,
                  superficie_m2: 12500,
                  height_m: 10 + (idx % 3) * 3,
                  floors: 2 + (idx % 2),
                },
                geometry: {
                  type: 'Polygon' as const,
                  coordinates: [[
                    [lng0, lat0],
                    [lng0 + 0.0036, lat0],
                    [lng0 + 0.0036, lat0 + 0.0032],
                    [lng0, lat0 + 0.0032],
                    [lng0, lat0],
                  ]],
                },
              };
            }),
          },
        },
        {
          id: 'lyr-cal-vias',
          name: 'Red Vial Interna & Corredor Logístico',
          category: 'infraestructura',
          kind: 'vector',
          visible: true,
          opacity: 0.9,
          crs: 'EPSG:4326',
          source: 'Plan Vial Callao',
          capturedDate: '2026-10-25',
          metadata: { provenance: 'observado' },
          symbology: { color: '#334155', weight: 3 },
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'Eje Vial Principal E-O', ancho_m: 18 },
                geometry: {
                  type: 'LineString',
                  coordinates: [[-77.145, -12.0005], [-77.121, -12.0005]],
                },
              },
              {
                type: 'Feature',
                properties: { name: 'Colectora N-S Carga Pesada', ancho_m: 14 },
                geometry: {
                  type: 'LineString',
                  coordinates: [[-77.132, -12.009], [-77.132, -11.989]],
                },
              },
            ],
          },
        },
      ],
      operationHistory: [],
      lidarCloud: generateReferenceLidarSurvey(callaoDem, undefined, 1),
      savedWorkflows: [
        {
          id: 'wf-ind-callao',
          name: 'Control Territorial Parque Industrial',
          description: 'Genera pendientes de drenaje, TWI y hotspots de monitoreo.',
          createdAt: '2026-11-17T09:00:00Z',
          createdBy: 'Sistema SIG 2.0',
          steps: [
            { tool: 'slope', label: 'Pendiente Plataformas Industriales', agent: 'Agente Topográfico', params: {} },
            { tool: 'twi_hydrology', label: 'Drenaje Pluvial D8 / TWI', agent: 'Agente Hidrológico', params: {} },
          ],
        },
      ],
      temporalFrames: buildDefaultTemporalFrames(),
      iotSensors: [
        { id: 'iot-cal-1', code: 'PZ-CAL-01', name: 'Piezómetro Zona Costera Sur', sensorType: 'piezometro', lng: -77.133, lat: -12.002, lastValue: 2.05, unit: 'm b.s.', thresholdWarning: 2.0, status: 'alerta', updatedAt: '2026-11-18 08:30' },
      ],
      createdAt: '2026-11-12T14:00:00Z',
      updatedAt: '2026-11-18T09:00:00Z',
    },
  ];
}
