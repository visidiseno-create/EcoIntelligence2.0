import { fromArrayBuffer } from 'geotiff';
import {
  CrsCode,
  DemGrid,
  GeoFeatureCollection,
  GeotechProject,
  projectCoordinate,
  transformFeatureCollectionCrs,
  validateGeometryTopology,
  computeVectorLayerStats,
} from './geotechEngine';

export interface ImportedVectorResult {
  geojson: GeoFeatureCollection;
  detectedCrs: CrsCode;
  featureCount: number;
  warnings: string[];
}

export function parseGeoJsonText(text: string): ImportedVectorResult {
  const parsed = JSON.parse(text);
  let fc: GeoFeatureCollection;
  if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
    fc = parsed;
  } else if (parsed.type === 'Feature' && parsed.geometry) {
    fc = { type: 'FeatureCollection', features: [parsed] };
  } else if (parsed.type && parsed.coordinates) {
    fc = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { name: 'Geometría Importada' }, geometry: parsed }],
    };
  } else {
    throw new Error('El archivo no contiene un objeto GeoJSON válido (FeatureCollection / Feature).');
  }

  const report = validateGeometryTopology(fc);
  const warnings = report.issues.slice(0, 5).map((i) => `${i.featureName}: ${i.reason}`);
  const normalized =
    report.likelyCrs !== 'EPSG:4326'
      ? transformFeatureCollectionCrs(fc, report.likelyCrs, 'EPSG:4326')
      : fc;

  return {
    geojson: normalized,
    detectedCrs: report.likelyCrs,
    featureCount: normalized.features.length,
    warnings,
  };
}

function parseKmlCoordString(coordStr: string): Array<[number, number]> {
  return coordStr
    .trim()
    .split(/\s+/)
    .map((tuple) => {
      const parts = tuple.split(',').map(Number);
      if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        return [parts[0], parts[1]] as [number, number];
      }
      return null;
    })
    .filter((c): c is [number, number] => c !== null);
}

export function parseKmlText(xmlText: string): ImportedVectorResult {
  // Lightweight tag parser compatible in both Browser & Node unit tests without external DOM dependencies
  const placemarks = xmlText.match(/<Placemark[\s\S]*?<\/Placemark>/gi) || [];
  const features: GeoFeatureCollection['features'] = [];

  for (let i = 0; i < placemarks.length; i++) {
    const block = placemarks[i];
    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/i);
    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/i);
    const name = nameMatch ? nameMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : `KML-${i + 1}`;
    const description = descMatch ? descMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';

    const polyMatch = block.match(/<Polygon[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Polygon>/i);
    const lineMatch = block.match(/<LineString[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/i);
    const ptMatch = block.match(/<Point[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/i);

    if (polyMatch) {
      const ring = parseKmlCoordString(polyMatch[1]);
      if (ring.length >= 3) {
        if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
          ring.push([ring[0][0], ring[0][1]]);
        }
        features.push({
          type: 'Feature',
          properties: { name, description },
          geometry: { type: 'Polygon', coordinates: [ring] },
        });
      }
    } else if (lineMatch) {
      const coords = parseKmlCoordString(lineMatch[1]);
      if (coords.length >= 2) {
        features.push({
          type: 'Feature',
          properties: { name, description },
          geometry: { type: 'LineString', coordinates: coords },
        });
      }
    } else if (ptMatch) {
      const coords = parseKmlCoordString(ptMatch[1]);
      if (coords.length >= 1) {
        features.push({
          type: 'Feature',
          properties: { name, description },
          geometry: { type: 'Point', coordinates: coords[0] },
        });
      }
    }
  }

  if (features.length === 0) {
    throw new Error('No se encontraron geometrías Placemark válidas en el archivo KML.');
  }

  return {
    geojson: { type: 'FeatureCollection', features },
    detectedCrs: 'EPSG:4326',
    featureCount: features.length,
    warnings: [],
  };
}

export function exportGeoJsonToKml(fc: GeoFeatureCollection, documentName: string): string {
  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const placemarks = fc.features
    .filter((f) => Boolean(f.geometry))
    .map((f, idx) => {
      const name = escapeXml(String(f.properties?.name || f.properties?.nombre || `Elemento ${idx + 1}`));
      let geomXml = '';
      if (f.geometry.type === 'Point') {
        const [lng, lat] = f.geometry.coordinates;
        geomXml = `<Point><coordinates>${lng},${lat},0</coordinates></Point>`;
      } else if (f.geometry.type === 'LineString') {
        const str = f.geometry.coordinates.map((c) => `${c[0]},${c[1]},0`).join(' ');
        geomXml = `<LineString><coordinates>${str}</coordinates></LineString>`;
      } else if (f.geometry.type === 'Polygon') {
        const str = f.geometry.coordinates[0].map((c) => `${c[0]},${c[1]},0`).join(' ');
        geomXml = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${str}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
      }
      return `  <Placemark>\n    <name>${name}</name>\n    ${geomXml}\n  </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n  <name>${escapeXml(
    documentName
  )}</name>\n${placemarks}\n</Document>\n</kml>`;
}

export function parseCsvCoordinates(csvText: string, sourceCrs: CrsCode = 'EPSG:4326'): ImportedVectorResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error('El CSV debe incluir fila de encabezados y al menos un registro.');
  }

  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const delimiter = headerLine.includes(';') && !headerLine.includes(',') ? ';' : ',';
  const headers = headerLine.split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
  const lower = headers.map((h) => h.toLowerCase());

  const latIdx = lower.findIndex((h) =>
    ['lat', 'latitude', 'latitud', 'centroid_lat', 'y', 'norte', 'northing'].includes(h)
  );
  const lngIdx = lower.findIndex((h) =>
    ['lng', 'lon', 'longitude', 'longitud', 'centroid_lng', 'x', 'este', 'easting'].includes(h)
  );
  if (latIdx === -1 || lngIdx === -1) {
    throw new Error('No se identificaron columnas de coordenadas (lat/lng, centroid_lat/centroid_lng, x/y o este/norte).');
  }

  const features: GeoFeatureCollection['features'] = [];
  const warnings: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));
    const rawX = Number(cols[lngIdx]);
    const rawY = Number(cols[latIdx]);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      warnings.push(`Fila ${i + 1}: coordenadas inválidas.`);
      continue;
    }

    const effectiveCrs: CrsCode =
      sourceCrs === 'EPSG:4326' && (Math.abs(rawX) > 180 || Math.abs(rawY) > 90)
        ? 'EPSG:32718'
        : sourceCrs;

    const [lng, lat] =
      effectiveCrs !== 'EPSG:4326' ? projectCoordinate([rawX, rawY], effectiveCrs, 'EPSG:4326') : [rawX, rawY];

    const props: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (idx !== latIdx && idx !== lngIdx) {
        const num = Number(cols[idx]);
        props[h] = cols[idx] !== '' && !Number.isNaN(num) ? num : cols[idx];
      }
    });
    if (!props.name) props.name = `Punto CSV #${i}`;

    features.push({
      type: 'Feature',
      properties: props,
      geometry: { type: 'Point', coordinates: [lng, lat] },
    });
  }

  if (features.length === 0) {
    throw new Error('No se pudieron extraer puntos válidos del CSV.');
  }

  return {
    geojson: { type: 'FeatureCollection', features },
    detectedCrs: sourceCrs,
    featureCount: features.length,
    warnings,
  };
}

export function exportFeaturesToCsv(fc: GeoFeatureCollection): string {
  if (fc.features.length === 0) return 'id,geometry_type,lng,lat\n';
  const propKeys = Array.from(
    new Set(fc.features.flatMap((f) => Object.keys(f.properties || {})))
  );
  const header = ['id', 'geometry_type', 'centroid_lng', 'centroid_lat', ...propKeys].join(',');
  const rows = fc.features.map((f, idx) => {
    let lng = '';
    let lat = '';
    if (f.geometry?.type === 'Point') {
      lng = String(f.geometry.coordinates[0]);
      lat = String(f.geometry.coordinates[1]);
    } else if (f.geometry?.type === 'Polygon') {
      const c = f.geometry.coordinates[0][0];
      lng = String(c?.[0] ?? '');
      lat = String(c?.[1] ?? '');
    }
    const vals = [
      String(f.id || idx + 1),
      f.geometry?.type || '',
      lng,
      lat,
      ...propKeys.map((k) => `"${String(f.properties?.[k] ?? '').replace(/"/g, '""')}"`),
    ];
    return vals.join(',');
  });
  return '\uFEFF' + [header, ...rows].join('\n');
}

export function parseEsriAsciiGrid(ascText: string, crs: CrsCode = 'EPSG:4326'): DemGrid {
  const lines = ascText.trim().split(/\r?\n/);
  const meta: Record<string, number> = {};
  let dataStart = 0;

  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length === 2 && Number.isFinite(Number(parts[1]))) {
      meta[parts[0].toLowerCase()] = Number(parts[1]);
      dataStart = i + 1;
    } else {
      break;
    }
  }

  const cols = meta.ncols;
  const rows = meta.nrows;
  const cellsize = meta.cellsize || 0.001;
  const xll = meta.xllcorner ?? meta.xllcenter ?? -76.9;
  const yll = meta.yllcorner ?? meta.yllcenter ?? -12.3;
  const noData = meta.nodata_value ?? -9999;

  if (!cols || !rows || cols <= 0 || rows <= 0) {
    throw new Error('Encabezado ESRI ASCII Grid (.asc) inválido (faltan ncols/nrows).');
  }

  const values: number[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const nums = lines[i].trim().split(/\s+/).map(Number);
    for (const v of nums) {
      if (Number.isFinite(v)) values.push(v);
    }
  }

  if (values.length < cols * rows) {
    throw new Error(`El archivo ASCII Grid espera ${cols * rows} celdas y contiene ${values.length}.`);
  }

  // Convert bounding extent into EPSG:4326 if cellsize looks like degrees vs meters
  const isDeg = cellsize < 1;
  const minLng = isDeg ? xll : -76.92;
  const minLat = isDeg ? yll : -12.32;
  const maxLng = isDeg ? xll + cols * cellsize : minLng + (cols * cellsize) / 111000;
  const maxLat = isDeg ? yll + rows * cellsize : minLat + (rows * cellsize) / 111000;

  return {
    id: `dem-asc-${Date.now()}`,
    name: 'DEM Importado (ESRI ASCII Grid)',
    cols,
    rows,
    cellSizeMeters: isDeg ? Math.round(cellsize * 111000) : cellsize,
    bounds: [minLng, minLat, maxLng, maxLat],
    crs,
    noData,
    unit: 'msnm',
    values: values.slice(0, cols * rows),
    colorScale: 'elevation',
  };
}

export function exportDemToEsriAsciiGrid(dem: DemGrid): string {
  const [minLng, minLat, maxLng] = dem.bounds;
  const cellDeg = (maxLng - minLng) / dem.cols;
  const header = [
    `ncols         ${dem.cols}`,
    `nrows         ${dem.rows}`,
    `xllcorner     ${minLng.toFixed(6)}`,
    `yllcorner     ${minLat.toFixed(6)}`,
    `cellsize      ${cellDeg.toFixed(6)}`,
    `NODATA_value  ${dem.noData}`,
  ].join('\n');

  const lines: string[] = [];
  for (let r = 0; r < dem.rows; r++) {
    const rowSlice = dem.values.slice(r * dem.cols, (r + 1) * dem.cols);
    lines.push(rowSlice.map((v) => Number(v.toFixed(2))).join(' '));
  }
  return `${header}\n${lines.join('\n')}`;
}

export async function parseGeoTiffArrayBuffer(
  buffer: ArrayBuffer,
  fallbackBounds: [number, number, number, number]
): Promise<DemGrid> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const rasters = await image.readRasters();
  const band0 = rasters[0] as ArrayLike<number>;
  let bbox = fallbackBounds;
  try {
    const b = image.getBoundingBox();
    if (b.length === 4 && b.every(Number.isFinite) && Math.abs(b[0]) <= 180 && Math.abs(b[1]) <= 90) {
      bbox = [b[0], b[1], b[2], b[3]];
    }
  } catch {
    bbox = fallbackBounds;
  }

  // Downsample cleanly to max 64x64 for interactive browser & 3D mesh responsiveness if huge
  const targetCols = Math.min(width, 64);
  const targetRows = Math.min(height, 64);
  const values: number[] = [];
  for (let r = 0; r < targetRows; r++) {
    const srcR = Math.floor((r / targetRows) * height);
    for (let c = 0; c < targetCols; c++) {
      const srcC = Math.floor((c / targetCols) * width);
      const val = Number(band0[srcR * width + srcC]);
      values.push(Number.isFinite(val) ? Math.round(val * 100) / 100 : 0);
    }
  }

  return {
    id: `geotiff-${Date.now()}`,
    name: `GeoTIFF Ráster (${width}x${height}px)`,
    cols: targetCols,
    rows: targetRows,
    cellSizeMeters: 30,
    bounds: bbox,
    crs: 'EPSG:4326',
    noData: -9999,
    unit: 'valor',
    values,
    colorScale: 'elevation',
  };
}

export function generateCartographicSvg(params: {
  project: GeotechProject;
  title: string;
  author: string;
  organizationName: string;
  mapTypeLabel: string;
  notes: string;
}): string {
  const { project, title, author, organizationName, mapTypeLabel, notes } = params;
  const visibleLayers = project.layers.filter((l) => l.visible && l.geojson);
  const [minLng, minLat, maxLng, maxLat] = project.dem.bounds;
  const mapX = 40;
  const mapY = 90;
  const mapW = 720;
  const mapH = 440;

  const toPx = (lng: number, lat: number): [number, number] => {
    const x = mapX + ((lng - minLng) / Math.max(maxLng - minLng, 1e-9)) * mapW;
    const y = mapY + ((maxLat - lat) / Math.max(maxLat - minLat, 1e-9)) * mapH;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };

  // Raster background cells
  const cellW = mapW / project.dem.cols;
  const cellH = mapH / project.dem.rows;
  const minZ = Math.min(...project.dem.values);
  const maxZ = Math.max(...project.dem.values);
  const zSpan = Math.max(maxZ - minZ, 1);

  const rasterRects: string[] = [];
  for (let r = 0; r < project.dem.rows; r++) {
    for (let c = 0; c < project.dem.cols; c++) {
      const z = project.dem.values[r * project.dem.cols + c];
      const t = (z - minZ) / zSpan;
      const g = Math.round(180 - t * 90);
      const red = Math.round(220 - (1 - t) * 70);
      const b = Math.round(190 - t * 110);
      rasterRects.push(
        `<rect x="${(mapX + c * cellW).toFixed(1)}" y="${(mapY + r * cellH).toFixed(1)}" width="${(
          cellW + 0.4
        ).toFixed(1)}" height="${(cellH + 0.4).toFixed(1)}" fill="rgb(${red},${g},${b})" fill-opacity="0.45" />`
      );
    }
  }

  // Vector features
  const vectorSvgs: string[] = [];
  for (const layer of visibleLayers) {
    const color = layer.symbology.color || '#047857';
    for (const f of layer.geojson?.features || []) {
      if (!f.geometry) continue;
      if (f.geometry.type === 'Polygon') {
        const pts = f.geometry.coordinates[0]
          .map((c) => toPx(c[0], c[1]).join(','))
          .join(' ');
        vectorSvgs.push(
          `<polygon points="${pts}" fill="${layer.symbology.fillColor || color}" fill-opacity="${
            layer.symbology.fillOpacity ?? 0.25
          }" stroke="${color}" stroke-width="1.5" />`
        );
      } else if (f.geometry.type === 'LineString') {
        const pts = f.geometry.coordinates.map((c) => toPx(c[0], c[1]).join(',')).join(' ');
        vectorSvgs.push(
          `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" />`
        );
      } else if (f.geometry.type === 'Point') {
        const [px, py] = toPx(f.geometry.coordinates[0], f.geometry.coordinates[1]);
        vectorSvgs.push(
          `<circle cx="${px}" cy="${py}" r="4.5" fill="${color}" stroke="#ffffff" stroke-width="1.2" />`
        );
      }
    }
  }

  // Boreholes
  const bhSvgs = project.boreholes
    .map((bh) => {
      const [px, py] = toPx(bh.lng, bh.lat);
      return `<g><rect x="${px - 4}" y="${py - 4}" width="8" height="8" fill="#b45309" stroke="#fff" stroke-width="1" /><text x="${
        px + 7
      }" y="${py + 3}" font-size="9" font-family="monospace" fill="#1e293b">${bh.code}</text></g>`;
    })
    .join('');

  // Legend rows
  const legendItems = visibleLayers
    .slice(0, 7)
    .map(
      (l, idx) =>
        `<g transform="translate(780, ${135 + idx * 24})">
          <rect width="14" height="10" rx="2" fill="${l.symbology.color}" fill-opacity="0.7" stroke="${l.symbology.color}" />
          <text x="20" y="9" font-size="10" font-family="sans-serif" fill="#1e293b">${l.name.slice(0, 26)}</text>
        </g>`
    )
    .join('');

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const today = new Date().toISOString().split('T')[0];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 620" width="1000" height="620" style="background:#ffffff">
  <rect x="16" y="16" width="968" height="588" fill="#ffffff" stroke="#0f172a" stroke-width="2" />
  <rect x="16" y="16" width="968" height="56" fill="#0f172a" />
  <text x="34" y="42" font-size="16" font-weight="bold" font-family="sans-serif" fill="#ffffff">${esc(title)}</text>
  <text x="34" y="59" font-size="10" font-family="sans-serif" fill="#94a3b8">${esc(mapTypeLabel)} · ${esc(organizationName)} · Proyecto ${esc(project.code)}</text>
  <text x="966" y="47" text-anchor="end" font-size="11" font-family="monospace" fill="#34d399">SIG &amp; GEOTECH AI</text>

  <!-- Map Frame -->
  <g clip-path="url(#mapClip)">
    <defs><clipPath id="mapClip"><rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" /></clipPath></defs>
    <rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" fill="#f8fafc" />
    ${rasterRects.join('')}
    ${vectorSvgs.join('')}
    ${bhSvgs}
  </g>
  <rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" fill="none" stroke="#334155" stroke-width="1.5" />

  <!-- Graticule Labels -->
  <text x="${mapX}" y="${mapY - 6}" font-size="9" font-family="monospace" fill="#475569">${minLng.toFixed(4)}°E, ${maxLat.toFixed(4)}°N</text>
  <text x="${mapX + mapW}" y="${mapY - 6}" text-anchor="end" font-size="9" font-family="monospace" fill="#475569">${maxLng.toFixed(4)}°E, ${maxLat.toFixed(4)}°N</text>
  <text x="${mapX}" y="${mapY + mapH + 14}" font-size="9" font-family="monospace" fill="#475569">${minLng.toFixed(4)}°E, ${minLat.toFixed(4)}°N</text>
  <text x="${mapX + mapW}" y="${mapY + mapH + 14}" text-anchor="end" font-size="9" font-family="monospace" fill="#475569">${maxLng.toFixed(4)}°E, ${minLat.toFixed(4)}°N</text>

  <!-- North Arrow -->
  <g transform="translate(725, 118)">
    <circle cx="0" cy="0" r="18" fill="#ffffff" stroke="#0f172a" stroke-width="1.2" />
    <polygon points="0,-13 5,6 0,2 -5,6" fill="#0f172a" />
    <text x="0" y="15" text-anchor="middle" font-size="8" font-weight="bold" font-family="sans-serif" fill="#0f172a">N</text>
  </g>

  <!-- Scale Bar -->
  <g transform="translate(56, 502)">
    <rect x="0" y="0" width="120" height="22" fill="#ffffff" fill-opacity="0.9" rx="3" />
    <rect x="10" y="12" width="50" height="4" fill="#0f172a" />
    <rect x="60" y="12" width="50" height="4" fill="#ffffff" stroke="#0f172a" stroke-width="1" />
    <text x="10" y="9" font-size="8" font-family="monospace" fill="#0f172a">0</text>
    <text x="110" y="9" text-anchor="end" font-size="8" font-family="monospace" fill="#0f172a">${Math.round((project.dem.cols * project.dem.cellSizeMeters) / 6000 * 10) / 10} km</text>
  </g>

  <!-- Right Cartographic Sidebar -->
  <rect x="770" y="90" width="198" height="440" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
  <text x="782" y="114" font-size="11" font-weight="bold" font-family="sans-serif" fill="#0f172a">LEYENDA TEMÁTICA</text>
  <line x1="782" y1="122" x2="956" y2="122" stroke="#cbd5e1" />
  ${legendItems}

  <line x1="782" y1="340" x2="956" y2="340" stroke="#cbd5e1" />
  <text x="782" y="360" font-size="11" font-weight="bold" font-family="sans-serif" fill="#0f172a">METADATOS TÉCNICOS</text>
  <text x="782" y="380" font-size="9.5" font-family="sans-serif" fill="#334155">Sistema Ref.: ${esc(project.defaultCrs)}</text>
  <text x="782" y="396" font-size="9.5" font-family="sans-serif" fill="#334155">Superficie: ${project.areaHa.toLocaleString()} ha</text>
  <text x="782" y="412" font-size="9.5" font-family="sans-serif" fill="#334155">Resolución DEM: ${project.dem.cellSizeMeters} m</text>
  <text x="782" y="428" font-size="9.5" font-family="sans-serif" fill="#334155">Sondeos SPT: ${project.boreholes.length}</text>
  <text x="782" y="444" font-size="9.5" font-family="sans-serif" fill="#334155">Autor: ${esc(author)}</text>
  <text x="782" y="460" font-size="9.5" font-family="sans-serif" fill="#334155">Fecha: ${today}</text>
  <text x="782" y="486" font-size="8.5" font-family="sans-serif" fill="#64748b">Notas: ${esc(notes.slice(0, 65))}</text>

  <text x="40" y="580" font-size="9" font-family="sans-serif" fill="#475569">Generado determinísticamente por ECOINTELLIGENCE SIG &amp; GEOTECH AI · Coordenadas base WGS 84</text>
</svg>`;
}

export function generateTechnicalReportHtml(params: {
  project: GeotechProject;
  organizationName: string;
  author: string;
  svgMapMarkup: string;
}): string {
  const { project, organizationName, author, svgMapMarkup } = params;
  const layerRows = project.layers
    .map((l) => {
      const stats = l.geojson ? computeVectorLayerStats(l.geojson) : null;
      return `<tr>
        <td>${l.name}</td>
        <td>${l.category}</td>
        <td>${l.crs}</td>
        <td>${stats ? stats.featureCount : l.raster ? `${l.raster.cols}x${l.raster.rows}` : '-'}</td>
        <td>${stats ? `${stats.totalAreaHa} ha / ${stats.totalLengthKm} km` : l.raster?.unit || '-'}</td>
        <td>${l.metadata?.provenance || 'observado'}</td>
      </tr>`;
    })
    .join('');

  const opRows = project.operationHistory
    .slice(0, 15)
    .map(
      (op) => `<tr>
        <td>${op.timestamp}</td>
        <td>${op.tool}</td>
        <td>${op.agent || 'SIG Core'}</td>
        <td>${op.durationMs} ms</td>
        <td>${op.summary}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Informe Técnico Geoespacial — ${project.name}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; line-height: 1.5; }
    h1, h2 { color: #064e3b; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; }
    .meta { background: #f8fafc; border: 1px solid #cbd5e1; padding: 14px; border-radius: 6px; font-size: 13px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0 24px; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 10px; text-align: left; }
    th { background: #f1f5f9; }
    .disclaimer { background: #fffbeb; border: 1px solid #fde68a; padding: 12px; font-size: 12px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>INFORME TÉCNICO DE INGENIERÍA GEOESPACIAL Y GEOTECNIA</h1>
  <div class="meta">
    <strong>Organización:</strong> ${organizationName} &nbsp;|&nbsp;
    <strong>Proyecto:</strong> ${project.name} (${project.code})<br/>
    <strong>Dominio:</strong> ${project.domain.toUpperCase()} &nbsp;|&nbsp;
    <strong>Extensión Territorial:</strong> ${project.areaHa.toLocaleString()} ha &nbsp;|&nbsp;
    <strong>CRS:</strong> ${project.defaultCrs}<br/>
    <strong>Responsable:</strong> ${author} &nbsp;|&nbsp;
    <strong>Fecha Emisión:</strong> ${new Date().toISOString().split('T')[0]}
  </div>

  <h2>1. Alcance y Descripción del Proyecto</h2>
  <p>${project.description}</p>

  <h2>2. Mapa Cartográfico Principal</h2>
  <div style="max-width:960px; margin: 16px 0;">${svgMapMarkup}</div>

  <h2>3. Inventario de Capas Espaciales y Metadatos</h2>
  <table>
    <thead><tr><th>Capa</th><th>Categoría</th><th>CRS</th><th>Registros / Celdas</th><th>Métrica</th><th>Procedencia</th></tr></thead>
    <tbody>${layerRows}</tbody>
  </table>

  <h2>4. Trazabilidad de Operaciones y Geoprocesamiento Ejecutado</h2>
  <table>
    <thead><tr><th>Fecha/Hora</th><th>Herramienta</th><th>Agente / Motor</th><th>Duración</th><th>Resultado</th></tr></thead>
    <tbody>${opRows || '<tr><td colspan="5">Sin operaciones registradas en historial.</td></tr>'}</tbody>
  </table>

  <div class="disclaimer">
    <strong>Nota Metodológica y Limitaciones Técnicas:</strong> Los análisis vectoriales se ejecutan mediante geometría esférica geodésica (@turf/turf + proj4). Los análisis topográficos, hidrológicos (D8/TWI), espectrales y modelos de estabilidad de taludes (Talud Infinito / Bishop Simplificado) constituyen herramientas analíticas basadas en las mallas numéricas cargadas en proyecto; los resultados de modelamiento e IA no sustituyen estudios geotécnicos de campo ni ensayos de laboratorio certificados.
  </div>
</body>
</html>`;
}
