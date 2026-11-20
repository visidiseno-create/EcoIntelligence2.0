import JSZip from 'jszip';
import {
  DemGrid,
  GeotechProject,
} from './geotechEngine';
import { generateCartographicSvg } from './gisFormats';
import { ProjectQualityReport4, generateProjectQualityReport } from './enterpriseOps4';
import { GeoReproPackage } from './reproducibility4';

// =========================================================
// 1. ENVIRONMENTAL MONITORING 4.0 (STATIONS, CAMPAIGNS & ALERTS)
// =========================================================

export interface EnvironmentalMonitoringStation {
  id: string;
  code: string;
  name: string;
  matrix: 'aire' | 'agua' | 'ruido' | 'suelo' | 'piezometria';
  lng: number;
  lat: number;
  parameter: string;
  unit: string;
  normativeLimit: number;
  normativeRef: string;
  measurements: Array<{
    date: string;
    campaign: string;
    value: number;
  }>;
}

export interface MonitoringAlertItem {
  stationId: string;
  stationCode: string;
  matrix: string;
  parameter: string;
  latestValue: number;
  normativeLimit: number;
  unit: string;
  exceedancePct: number;
  trend: 'ascendente' | 'estable' | 'descendente';
  severity: 'CRÍTICA' | 'ALERTA' | 'CONFORME';
  recommendation: string;
}

export function buildDefaultMonitoringStations(project: GeotechProject): EnvironmentalMonitoringStation[] {
  const [lng, lat] = project.center;
  return [
    {
      id: `mon-${project.id}-air`,
      code: 'EST-AIR-01',
      name: 'Estación Calidad de Aire Barlovento',
      matrix: 'aire',
      lng: Number((lng - 0.008).toFixed(5)),
      lat: Number((lat + 0.006).toFixed(5)),
      parameter: 'PM10',
      unit: 'µg/m³',
      normativeLimit: 100,
      normativeRef: 'D.S. 003-2017-MINAM (ECA Aire 24h)',
      measurements: [
        { date: '2026-08-15', campaign: 'Campaña Q3', value: 64 },
        { date: '2026-09-20', campaign: 'Campaña Q3-B', value: 78 },
        { date: '2026-10-28', campaign: 'Campaña Q4', value: 92 },
      ],
    },
    {
      id: `mon-${project.id}-wat`,
      code: 'EST-AGU-01',
      name: 'Punto Control Efluente / Cuerpo Receptor',
      matrix: 'agua',
      lng: Number((lng + 0.009).toFixed(5)),
      lat: Number((lat - 0.007).toFixed(5)),
      parameter: 'Sólidos Suspendidos Totales (SST)',
      unit: 'mg/L',
      normativeLimit: 50,
      normativeRef: 'D.S. 004-2017-MINAM (ECA Agua Cat. 3/4)',
      measurements: [
        { date: '2026-08-15', campaign: 'Campaña Q3', value: 31 },
        { date: '2026-09-20', campaign: 'Campaña Q3-B', value: 44 },
        { date: '2026-10-28', campaign: 'Campaña Q4', value: 56 },
      ],
    },
    {
      id: `mon-${project.id}-noi`,
      code: 'EST-RUI-01',
      name: 'Estación Perimetral Ruido Ambiental',
      matrix: 'ruido',
      lng: Number((lng + 0.003).toFixed(5)),
      lat: Number((lat + 0.009).toFixed(5)),
      parameter: 'LAeqT Diurno',
      unit: 'dBA',
      normativeLimit: 80,
      normativeRef: 'D.S. 085-2003-PCM (Zona Industrial)',
      measurements: [
        { date: '2026-08-15', campaign: 'Campaña Q3', value: 72 },
        { date: '2026-09-20', campaign: 'Campaña Q3-B', value: 71 },
        { date: '2026-10-28', campaign: 'Campaña Q4', value: 69 },
      ],
    },
  ];
}

export function evaluateMonitoringAlerts(stations: EnvironmentalMonitoringStation[]): MonitoringAlertItem[] {
  return stations.map((st) => {
    const vals = st.measurements;
    const latest = vals[vals.length - 1]?.value ?? 0;
    const prev = vals[vals.length - 2]?.value ?? latest;
    const exceedancePct = Math.round(((latest - st.normativeLimit) / Math.max(st.normativeLimit, 1e-6)) * 1000) / 10;
    const delta = latest - prev;
    const trend: MonitoringAlertItem['trend'] = delta > 2 ? 'ascendente' : delta < -2 ? 'descendente' : 'estable';
    const severity: MonitoringAlertItem['severity'] =
      latest > st.normativeLimit ? 'CRÍTICA' : latest >= st.normativeLimit * 0.85 ? 'ALERTA' : 'CONFORME';

    return {
      stationId: st.id,
      stationCode: st.code,
      matrix: st.matrix.toUpperCase(),
      parameter: st.parameter,
      latestValue: latest,
      normativeLimit: st.normativeLimit,
      unit: st.unit,
      exceedancePct,
      trend,
      severity,
      recommendation:
        severity === 'CRÍTICA'
          ? `Supera límite normativo (${st.normativeRef}). Abrir acción CAPA y verificar control en fuente.`
          : severity === 'ALERTA'
          ? `Acercándose al límite (${Math.round((latest / st.normativeLimit) * 100)}% del ECA/LMP). Incrementar frecuencia.`
          : 'Operación dentro de rango normativo ECA/LMP.',
    };
  });
}

// =========================================================
// 2. PROFESSIONAL ATLAS / MAP SERIES BATCH GENERATOR (MAPA 1..N)
// =========================================================

export interface AtlasSheetItem {
  sheetNumber: number;
  totalSheets: number;
  title: string;
  zoneLabel: string;
  bounds: [number, number, number, number];
  scaleLabel: string;
  meanElevM: number;
  svgMarkup: string;
}

export function generateAtlasMapSeries(params: {
  project: GeotechProject;
  organizationName: string;
  authorName: string;
  sheetCount?: number;
}): AtlasSheetItem[] {
  const count = Math.max(2, Math.min(6, params.sheetCount ?? 4));
  const [minLng, minLat, maxLng, maxLat] = params.project.dem.bounds;
  const colsSplit = count <= 2 ? 2 : 2;
  const rowsSplit = Math.ceil(count / colsSplit);
  const dLng = (maxLng - minLng) / colsSplit;
  const dLat = (maxLat - minLat) / rowsSplit;

  const sheets: AtlasSheetItem[] = [];
  for (let idx = 0; idx < count; idx++) {
    const col = idx % colsSplit;
    const row = Math.floor(idx / colsSplit);
    const sMinLng = minLng + col * dLng;
    const sMaxLng = sMinLng + dLng;
    const sMaxLat = maxLat - row * dLat;
    const sMinLat = sMaxLat - dLat;

    // Sample DEM subset mean elevation for sheet
    const r0 = Math.floor((row / rowsSplit) * params.project.dem.rows);
    const r1 = Math.min(params.project.dem.rows, Math.ceil(((row + 1) / rowsSplit) * params.project.dem.rows));
    const c0 = Math.floor((col / colsSplit) * params.project.dem.cols);
    const c1 = Math.min(params.project.dem.cols, Math.ceil(((col + 1) / colsSplit) * params.project.dem.cols));
    let sum = 0;
    let cnt = 0;
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        sum += params.project.dem.values[r * params.project.dem.cols + c];
        cnt++;
      }
    }
    const meanElevM = cnt > 0 ? Math.round((sum / cnt) * 10) / 10 : 0;

    const zoneLabel = `Cuadrante ${row === 0 ? 'Norte' : 'Sur'}-${col === 0 ? 'Oeste' : 'Este'} (Hoja ${idx + 1}/${count})`;
    const sheetTitle = `Atlas ${params.project.code} — Mapa ${idx + 1} de ${count}: ${zoneLabel}`;
    const baseSvg = generateCartographicSvg({
      project: params.project,
      title: sheetTitle,
      author: params.authorName,
      organizationName: params.organizationName,
      mapTypeLabel: `Serie Cartográfica Atlas (${params.project.defaultCrs})`,
      notes: `Cota media sector: ${meanElevM} msnm · BBOX [${sMinLng.toFixed(4)}, ${sMinLat.toFixed(4)}, ${sMaxLng.toFixed(4)}, ${sMaxLat.toFixed(4)}]`,
    });

    // Inject Locator Inset Frame (Mapa de Ubicación) & Sheet Badge inside SVG before </svg>
    const insetMarkup = `
      <g transform="translate(880, 395)">
        <rect x="0" y="0" width="190" height="92" rx="6" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
        <text x="10" y="16" font-family="sans-serif" font-size="9" font-weight="bold" fill="#94a3b8">MAPA UBICACIÓN (${idx + 1}/${count})</text>
        <rect x="14" y="24" width="162" height="54" fill="#1e293b" stroke="#475569" stroke-width="1"/>
        <rect x="${14 + col * 81}" y="${24 + row * (54 / rowsSplit)}" width="81" height="${54 / rowsSplit}" fill="#10b981" fill-opacity="0.45" stroke="#34d399" stroke-width="1.5"/>
        <text x="16" y="88" font-family="monospace" font-size="8" fill="#cbd5e1">Cota media: ${meanElevM} m · Escala 1:10,000</text>
      </g>
    `;
    const enhancedSvg = baseSvg.replace('</svg>', `${insetMarkup}\n</svg>`);

    sheets.push({
      sheetNumber: idx + 1,
      totalSheets: count,
      title: sheetTitle,
      zoneLabel,
      bounds: [sMinLng, sMinLat, sMaxLng, sMaxLat],
      scaleLabel: '1:10,000',
      meanElevM,
      svgMarkup: enhancedSvg,
    });
  }
  return sheets;
}

// =========================================================
// 3. GEOREPORT ENTERPRISE (REAL BINARY DOCX & XLSX + HTML PDF)
// =========================================================

function xmlEscape(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function generateGeoReportDocxBuffer(params: {
  project: GeotechProject;
  organizationName: string;
  authorName: string;
  qualityReport?: ProjectQualityReport4;
  reproPackages?: GeoReproPackage[];
  monitoringAlerts?: MonitoringAlertItem[];
}): Promise<Uint8Array> {
  const qr = params.qualityReport || generateProjectQualityReport(params.project);
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  const p = (text: string, bold = false) =>
    `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;

  const bodyBlocks: string[] = [
    p('ECOINTELLIGENCE SIG & GEOTECH AI 4.0 — INFORME TÉCNICO EMPRESARIAL (GEOREPORT)', true),
    p(`Organización: ${params.organizationName} | Autor: ${params.authorName} | Fecha: ${new Date().toISOString().slice(0, 10)}`),
    p(`Proyecto: ${params.project.code} — ${params.project.name} (${params.project.domain.toUpperCase()})`, true),
    p(`CRS: ${params.project.defaultCrs} | Área: ${params.project.areaHa} ha | DEM: ${params.project.dem.cols}x${params.project.dem.rows} (${params.project.dem.cellSizeMeters} m)`),
    p('1. RESUMEN DE CALIDAD Y CONTROL (AI PROJECT REVIEWER)', true),
    p(`Score Global: ${qr.score}/100 (Grado ${qr.grade}) | Apto Publicación: ${qr.publishReady ? 'SÍ' : 'NO'}`),
    ...qr.findings.slice(0, 10).map((f) => p(`- [${f.severity}] ${f.target}: ${f.detail} -> ${f.recommendation}`)),
    p('2. INVENTARIO DE CAPAS ESPACIALES Y FUENTES', true),
    ...params.project.layers.map(
      (l, i) => p(`${i + 1}. ${l.name} (${l.kind}/${l.crs}) · Entidades: ${l.geojson?.features.length || 0} · Fuente: ${l.source}`)
    ),
    p('3. MONITOREO AMBIENTAL E HISTORIAL DE TRAZABILIDAD', true),
    ...(params.monitoringAlerts || []).map(
      (a) => p(`- ${a.stationCode} [${a.matrix}] ${a.parameter}: ${a.latestValue} ${a.unit} (Límite ${a.normativeLimit}) -> ${a.severity}`)
    ),
    p('4. PAQUETES DE REPRODUCIBILIDAD SHA-256 E INCERTIDUMBRE', true),
    ...(params.reproPackages || []).slice(0, 8).map(
      (r) => p(`- ${r.title} (${r.algorithm}): ${r.resultSummary} | SHA-256 Datos: ${r.datasetHash.slice(0, 16)}...`)
    ),
    p('5. LIMITACIONES METODOLÓGICAS', true),
    p('ANÁLISIS PRELIMINAR / HERRAMIENTA DE APOYO A LA INGENIERÍA: Los cálculos geotécnicos, hidrológicos e interpolaciones dependen de la resolución del DEM y densidad de muestreo. No reemplazan estudios certificados de campo o laboratorio.'),
  ];

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyBlocks.join('\n    ')}
    <w:sectPr/>
  </w:body>
</w:document>`
  );

  return await zip.generateAsync({ type: 'uint8array' });
}

export async function generateGeoReportXlsxBuffer(params: {
  project: GeotechProject;
  qualityReport?: ProjectQualityReport4;
  monitoringAlerts?: MonitoringAlertItem[];
}): Promise<Uint8Array> {
  const qr = params.qualityReport || generateProjectQualityReport(params.project);
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  );

  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Resumen_Capas" sheetId="1" r:id="rId1"/>
    <sheet name="Calidad_Monitoreo" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`
  );

  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`
  );

  const buildRowsXml = (rows: Array<Array<string | number>>) =>
    rows
      .map((row, rIdx) => {
        const cells = row
          .map((val, cIdx) => {
            const colLetter = String.fromCharCode(65 + cIdx);
            const ref = `${colLetter}${rIdx + 1}`;
            if (typeof val === 'number' && Number.isFinite(val)) {
              return `<c r="${ref}"><v>${val}</v></c>`;
            }
            return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(String(val))}</t></is></c>`;
          })
          .join('');
        return `<row r="${rIdx + 1}">${cells}</row>`;
      })
      .join('');

  const sheet1Rows: Array<Array<string | number>> = [
    ['ECOINTELLIGENCE SIG 4.0 — INVENTARIO DE PROYECTO', params.project.code, params.project.name, params.project.defaultCrs],
    ['Capa', 'Tipo', 'Categoría', 'CRS', 'Entidades', 'Fuente'],
    ...params.project.layers.map((l) => [
      l.name, l.kind, l.category, l.crs, l.geojson?.features.length || 0, l.source || '',
    ]),
  ];

  const sheet2Rows: Array<Array<string | number>> = [
    ['PROJECT QUALITY REPORT SCORE', qr.score, 'Grado', qr.grade],
    ['Severidad / Estación', 'Objetivo / Parámetro', 'Detalle / Medición', 'Estado / Recomendación'],
    ...qr.findings.map((f) => [f.severity, f.target, f.detail, f.recommendation]),
    ...(params.monitoringAlerts || []).map((a) => [a.stationCode, a.parameter, `${a.latestValue} ${a.unit}`, `${a.severity} (Límite ${a.normativeLimit})`]),
  ];

  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${buildRowsXml(sheet1Rows)}</sheetData></worksheet>`
  );
  zip.file(
    'xl/worksheets/sheet2.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${buildRowsXml(sheet2Rows)}</sheetData></worksheet>`
  );

  return await zip.generateAsync({ type: 'uint8array' });
}

// =========================================================
// 4. AUTO-GENERATED TOOL TECHNICAL DOCUMENTATION
// =========================================================

export interface ToolTechnicalDocItem {
  toolId: string;
  name: string;
  category: 'Vector' | 'Ráster/DEM' | 'Hidrología' | 'Geotecnia' | 'Teledetección' | 'LiDAR' | 'Interoperabilidad';
  purpose: string;
  inputs: string;
  outputs: string;
  parameters: string;
  mathMethod: string;
  limitations: string;
}

export const AUTO_TOOL_TECHNICAL_DOCS: ToolTechnicalDocItem[] = [
  {
    toolId: 'slope_horn', name: 'Pendiente Topográfica (Horn 3×3)', category: 'Ráster/DEM',
    purpose: 'Calcula el gradiente máximo de inclinación del terreno en grados (°).',
    inputs: 'DEM / Ráster de elevaciones (m)', outputs: 'Ráster de pendientes (°) + min/media/máx',
    parameters: 'cellSizeMeters, bounds', mathMethod: 'Diferencias finitas ponderadas Horn (1981) 3×3',
    limitations: 'Suaviza micro-escarpes menores al tamaño de celda.',
  },
  {
    toolId: 'hydro_priority_flood', name: 'Hidrología Priority-Flood + Strahler + Racional', category: 'Hidrología',
    purpose: 'Elimina depresiones, traza flujo D8, órdenes Strahler, Horton y caudal pico.',
    inputs: 'DEM sin vacíos', outputs: 'DEM relleno, Acumulación D8, TWI, Red Strahler, Q_pico',
    parameters: 'rainfallMmHr, runoffCoeffC, returnPeriodYears', mathMethod: 'Barnes (2014) Priority-Flood + D8 + Kirpich + Q=CIA/3.6',
    limitations: 'Hidrología preliminar; propagación hidráulica 2D requiere HEC-RAS/IBER.',
  },
  {
    toolId: 'bearing_capacity', name: 'Capacidad Portante Terzaghi / Meyerhof', category: 'Geotecnia',
    purpose: 'Estima carga última y admisible de cimentaciones superficiales con nivel freático.',
    inputs: 'Parámetros c′, φ′, γ, B, L, Df, profundidad freática', outputs: 'q_ult (kPa), q_adm (kPa), Nc, Nq, Nγ',
    parameters: 'method, footingShape, safetyFactor', mathMethod: 'Terzaghi (1943) / Meyerhof (1963)',
    limitations: 'ANÁLISIS PRELIMINAR / APOYO INGENIERÍA; asume suelo homogéneo.',
  },
  {
    toolId: 'bishop_stability', name: 'Estabilidad de Taludes Bishop + Sismo', category: 'Geotecnia',
    purpose: 'Calcula el factor de seguridad FS estático y pseudo-estático.',
    inputs: 'Geometría talud, c′, φ′, γ, ru, kh', outputs: 'FS estático, FS sísmico, clasificación',
    parameters: 'slopeAngleDeg, slopeHeightM, seismicKh, porePressureRatioRu', mathMethod: 'Bishop Simplificado iterativo (10 dovelas)',
    limitations: 'No reemplaza análisis FEM/LEM certificado con búsqueda automática de falla.',
  },
  {
    toolId: 'spectral_ndvi', name: 'Teledetección Multiespectral & Cambio Δ', category: 'Teledetección',
    purpose: 'Calcula NDVI, NDWI, MNDWI, NDBI, SAVI, EVI, NBR y cambios T1→T2.',
    inputs: 'Escena multibanda T1/T2', outputs: 'Grilla índice [-1, 1] + hectáreas cambio',
    parameters: 'indexType, dateSlot', mathMethod: 'Álgebra espectral normalizada por banda',
    limitations: 'Dependiente de nubosidad residual y corrección atmosférica.',
  },
  {
    toolId: 'lidar_asprs', name: 'LiDAR ASPRS .LAS 1.2 + DTM/DSM/nDSM', category: 'LiDAR',
    purpose: 'Lee/escribe binarios LASF, filtra ruido SOR y separa suelo/vegetación/edificaciones.',
    inputs: 'Nube .las/.csv', outputs: 'DTM, DSM, nDSM (altura normalizada), curvas nivel',
    parameters: 'utmCrs, sorThreshold, gridSize', mathMethod: 'Filtro morfológico progresivo + SOR k-vecinos',
    limitations: 'Archivos .laz comprimidos requieren GDAL/PDAL Worker externo.',
  },
  {
    toolId: 'georeport_4', name: 'GeoReport Enterprise (DOCX/XLSX/PDF/GeoTIFF)', category: 'Interoperabilidad',
    purpose: 'Genera entregables ejecutivos reproducibles con hash SHA-256 y trazabilidad.',
    inputs: 'Proyecto, Quality Report, Monitoreo, ReproPackages', outputs: 'DOCX, XLSX, HTML Print, GeoJSON, GeoTIFF',
    parameters: 'format, crs', mathMethod: 'OpenXML (DOCX/XLSX) + IEEE-754 GeoTIFF + SVG',
    limitations: 'Exportación GeoPackage (.gpkg) delegada al Worker GDAL externo.',
  },
];
