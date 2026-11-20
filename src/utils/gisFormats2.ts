import JSZip from 'jszip';
import { fromArrayBuffer } from 'geotiff';
import * as turf from '@turf/turf';
import type { Feature, Geometry, LineString, Point, Polygon } from 'geojson';
import {
  CrsCode,
  DemGrid,
  GeoFeatureCollection,
  detectCrsFromGeoJson,
  projectCoordinate,
  transformFeatureCollectionCrs,
  validateGeometryTopology,
} from './geotechEngine';
import { exportGeoJsonToKml, ImportedVectorResult, parseKmlText } from './gisFormats';

// =========================================================
// QGIS / ARCGIS PRO INTEROPERABILITY MATRIX
// =========================================================

export interface FormatInteropEntry {
  id: string;
  formatName: string;
  extensions: string;
  readSupport: 'Nativo TS' | 'Worker GDAL/PDAL';
  writeSupport: 'Nativo TS' | 'Worker GDAL/PDAL' | 'Solo lectura';
  qgisCompatible: boolean;
  arcgisCompatible: boolean;
  notes: string;
}

export const INTEROP_FORMAT_MATRIX: FormatInteropEntry[] = [
  {
    id: 'geojson',
    formatName: 'GeoJSON (RFC 7946)',
    extensions: '.geojson, .json',
    readSupport: 'Nativo TS',
    writeSupport: 'Nativo TS',
    qgisCompatible: true,
    arcgisCompatible: true,
    notes: 'CRS WGS 84 estándar, atributos completos y topología geodésica.',
  },
  {
    id: 'shapefile',
    formatName: 'ESRI Shapefile ZIP (.shp+.shx+.dbf+.prj)',
    extensions: '.zip',
    readSupport: 'Nativo TS',
    writeSupport: 'Nativo TS',
    qgisCompatible: true,
    arcgisCompatible: true,
    notes: 'Escritor y lector binario puro (.shp/.shx/.dbf dBASE III/.prj WKT) en paquete ZIP.',
  },
  {
    id: 'geotiff',
    formatName: 'GeoTIFF Float32 / COG Ventaneado',
    extensions: '.tif, .tiff',
    readSupport: 'Nativo TS',
    writeSupport: 'Nativo TS',
    qgisCompatible: true,
    arcgisCompatible: true,
    notes: 'IEEE Float32 con GeoKeys EPSG:4326 (33550/33922/34735) + lectura por ventanas/overviews.',
  },
  {
    id: 'las',
    formatName: 'ASPRS LiDAR Point Cloud (.las 1.2/1.4)',
    extensions: '.las, .xyz, .csv',
    readSupport: 'Nativo TS',
    writeSupport: 'Nativo TS',
    qgisCompatible: true,
    arcgisCompatible: true,
    notes: 'Binario ASPRS LAS con escala métrica UTM, clasificación ASPRS (2=Suelo,3-5=Veg,6=Edif,7=Ruido).',
  },
  {
    id: 'dxf',
    formatName: 'AutoCAD DXF ASCII (CAD/Topografía)',
    extensions: '.dxf',
    readSupport: 'Nativo TS',
    writeSupport: 'Nativo TS',
    qgisCompatible: true,
    arcgisCompatible: true,
    notes: 'Soporta entidades POINT, LINE y LWPOLYLINE con capa Layer.',
  },
  {
    id: 'gml',
    formatName: 'OGC GML 3.2 Simple Features',
    extensions: '.gml, .xml',
    readSupport: 'Nativo TS',
    writeSupport: 'Nativo TS',
    qgisCompatible: true,
    arcgisCompatible: true,
    notes: 'Intercambio institucional OGC con srsName EPSG:4326.',
  },
  {
    id: 'kml_kmz',
    formatName: 'OGC KML / KMZ Comprimido',
    extensions: '.kml, .kmz',
    readSupport: 'Nativo TS',
    writeSupport: 'Nativo TS',
    qgisCompatible: true,
    arcgisCompatible: true,
    notes: 'Compatible con Google Earth Pro, QGIS y ArcGIS Earth.',
  },
  {
    id: 'ascii_grid',
    formatName: 'ESRI ASCII Grid DEM',
    extensions: '.asc',
    readSupport: 'Nativo TS',
    writeSupport: 'Nativo TS',
    qgisCompatible: true,
    arcgisCompatible: true,
    notes: 'Grilla matricial raster compatible con GRASS, ArcGIS y QGIS.',
  },
  {
    id: 'gdal_worker_formats',
    formatName: 'GeoPackage / LAZ / FileGDB / GeoParquet / NetCDF / HDF5',
    extensions: '.gpkg, .laz, .gdb, .parquet, .nc, .h5',
    readSupport: 'Worker GDAL/PDAL',
    writeSupport: 'Worker GDAL/PDAL',
    qgisCompatible: true,
    arcgisCompatible: true,
    notes: 'Requiere conectar microservicio externo /services/gdal-worker/ vía GEOSPATIAL_WORKER_URL.',
  },
];

// =========================================================
// 1. ESRI SHAPEFILE BINARY (.shp/.shx/.dbf/.prj) ZIP
// =========================================================

const WKT_BY_CRS: Record<CrsCode, string> = {
  'EPSG:4326':
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]',
  'EPSG:3857':
    'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]',
  'EPSG:32717':
    'PROJCS["WGS_1984_UTM_Zone_17S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-81.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]',
  'EPSG:32718':
    'PROJCS["WGS_1984_UTM_Zone_18S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-75.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]',
  'EPSG:32719':
    'PROJCS["WGS_1984_UTM_Zone_19S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-69.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]',
  'EPSG:24877':
    'PROJCS["PSAD_1956_UTM_Zone_17S",GEOGCS["GCS_Provisional_S_American_1956",DATUM["D_Provisional_S_American_1956",SPHEROID["International_1924",6378388.0,297.0]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-81.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]',
  'EPSG:24878':
    'PROJCS["PSAD_1956_UTM_Zone_18S",GEOGCS["GCS_Provisional_S_American_1956",DATUM["D_Provisional_S_American_1956",SPHEROID["International_1924",6378388.0,297.0]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-75.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]',
};

function sanitizeAscii(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function buildDbfBuffer(features: Feature[]): Uint8Array {
  const rawKeys = Array.from(
    new Set(features.flatMap((f) => Object.keys(f.properties || {})))
  ).slice(0, 24);
  if (rawKeys.length === 0) rawKeys.push('name');

  const fields = rawKeys.map((k, idx) => {
    const clean = sanitizeAscii(k).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 10) || `FLD_${idx}`;
    const isNumeric = features.every((f) => {
      const v = f.properties?.[k];
      return v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isFinite(v));
    });
    return {
      sourceKey: k,
      dbfName: clean,
      type: isNumeric ? 'N' : 'C',
      length: isNumeric ? 14 : 64,
      decimals: isNumeric ? 4 : 0,
    };
  });

  const headerSize = 32 + fields.length * 32 + 1;
  const recordSize = 1 + fields.reduce((s, f) => s + f.length, 0);
  const totalBytes = headerSize + features.length * recordSize + 1; // +1 EOF 0x1A
  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  const now = new Date();
  view.setUint8(0, 0x03); // dBASE III without memo
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setUint32(4, features.length, true);
  view.setUint16(8, headerSize, true);
  view.setUint16(10, recordSize, true);

  let offset = 32;
  for (const fld of fields) {
    for (let i = 0; i < Math.min(10, fld.dbfName.length); i++) {
      bytes[offset + i] = fld.dbfName.charCodeAt(i);
    }
    bytes[offset + 11] = fld.type.charCodeAt(0);
    bytes[offset + 16] = fld.length;
    bytes[offset + 17] = fld.decimals;
    offset += 32;
  }
  bytes[offset] = 0x0d; // header terminator
  offset++;

  for (const feat of features) {
    bytes[offset] = 0x20; // active record
    let colOffset = offset + 1;
    for (const fld of fields) {
      const raw = feat.properties?.[fld.sourceKey];
      let text = '';
      if (raw !== undefined && raw !== null) {
        if (fld.type === 'N') {
          const num = Number(raw);
          text = Number.isFinite(num) ? num.toFixed(fld.decimals).slice(0, fld.length) : '';
          text = text.padStart(fld.length, ' ');
        } else {
          text = sanitizeAscii(String(raw)).slice(0, fld.length).padEnd(fld.length, ' ');
        }
      } else {
        text = ' '.repeat(fld.length);
      }
      for (let i = 0; i < fld.length; i++) {
        bytes[colOffset + i] = text.charCodeAt(i) || 0x20;
      }
      colOffset += fld.length;
    }
    offset += recordSize;
  }
  bytes[totalBytes - 1] = 0x1a; // EOF
  return bytes;
}

function writeShpHeader(
  view: DataView,
  byteLength: number,
  shapeType: number,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number
) {
  view.setInt32(0, 9994, false); // big-endian file code
  view.setInt32(24, byteLength / 2, false); // big-endian length in 16-bit words
  view.setInt32(28, 1000, true); // little-endian version
  view.setInt32(32, shapeType, true); // little-endian shape type
  view.setFloat64(36, xmin, true);
  view.setFloat64(44, ymin, true);
  view.setFloat64(52, xmax, true);
  view.setFloat64(60, ymax, true);
}

export async function exportGeoJsonToShapefileZip(
  fc: GeoFeatureCollection,
  layerName: string,
  targetCrs: CrsCode = 'EPSG:4326'
): Promise<Uint8Array> {
  if (!fc.features.length) {
    throw new Error('La capa está vacía; no hay geometrías para exportar a Shapefile.');
  }

  const projectedFc =
    targetCrs !== 'EPSG:4326' ? transformFeatureCollectionCrs(fc, 'EPSG:4326', targetCrs) : fc;

  // Group by dominant geometry type (Shapefile requires homogeneous geometry type per .shp)
  const firstType = projectedFc.features.find((f) => f.geometry)?.geometry.type;
  let shapeType = 1; // Point
  let matchingFeatures: Feature[] = [];

  if (firstType === 'Polygon' || firstType === 'MultiPolygon') {
    shapeType = 5;
    matchingFeatures = projectedFc.features.filter(
      (f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
    );
  } else if (firstType === 'LineString' || firstType === 'MultiLineString') {
    shapeType = 3;
    matchingFeatures = projectedFc.features.filter(
      (f) => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'
    );
  } else {
    shapeType = 1;
    matchingFeatures = projectedFc.features.filter((f) => f.geometry?.type === 'Point');
  }

  if (matchingFeatures.length === 0) {
    throw new Error('No se encontraron geometrías válidas compatibles con Shapefile (.shp).');
  }

  // Compute global bbox and build record buffers
  let gXmin = Infinity,
    gYmin = Infinity,
    gXmax = -Infinity,
    gYmax = -Infinity;

  const recordPayloads: Uint8Array[] = [];

  for (const feat of matchingFeatures) {
    if (shapeType === 1) {
      const [x, y] = (feat.geometry as Point).coordinates;
      gXmin = Math.min(gXmin, x);
      gYmin = Math.min(gYmin, y);
      gXmax = Math.max(gXmax, x);
      gYmax = Math.max(gYmax, y);

      const rec = new ArrayBuffer(20);
      const v = new DataView(rec);
      v.setInt32(0, 1, true);
      v.setFloat64(4, x, true);
      v.setFloat64(12, y, true);
      recordPayloads.push(new Uint8Array(rec));
    } else {
      // PolyLine (3) or Polygon (5)
      const rings: Array<Array<[number, number]>> = [];
      if (feat.geometry.type === 'LineString') {
        rings.push(feat.geometry.coordinates as Array<[number, number]>);
      } else if (feat.geometry.type === 'MultiLineString') {
        for (const line of feat.geometry.coordinates) {
          rings.push(line as Array<[number, number]>);
        }
      } else if (feat.geometry.type === 'Polygon') {
        for (const ring of feat.geometry.coordinates) {
          rings.push(ring as Array<[number, number]>);
        }
      } else if (feat.geometry.type === 'MultiPolygon') {
        for (const poly of feat.geometry.coordinates) {
          for (const ring of poly) {
            rings.push(ring as Array<[number, number]>);
          }
        }
      }

      const numParts = rings.length;
      const flatPts: Array<[number, number]> = [];
      const partStarts: number[] = [];
      let rXmin = Infinity,
        rYmin = Infinity,
        rXmax = -Infinity,
        rYmax = -Infinity;

      for (const ring of rings) {
        partStarts.push(flatPts.length);
        for (const pt of ring) {
          flatPts.push(pt);
          rXmin = Math.min(rXmin, pt[0]);
          rYmin = Math.min(rYmin, pt[1]);
          rXmax = Math.max(rXmax, pt[0]);
          rYmax = Math.max(rYmax, pt[1]);
        }
      }

      gXmin = Math.min(gXmin, rXmin);
      gYmin = Math.min(gYmin, rYmin);
      gXmax = Math.max(gXmax, rXmax);
      gYmax = Math.max(gYmax, rYmax);

      const contentBytes = 44 + 4 * numParts + 16 * flatPts.length;
      const rec = new ArrayBuffer(contentBytes);
      const v = new DataView(rec);
      v.setInt32(0, shapeType, true);
      v.setFloat64(4, rXmin, true);
      v.setFloat64(12, rYmin, true);
      v.setFloat64(20, rXmax, true);
      v.setFloat64(28, rYmax, true);
      v.setInt32(36, numParts, true);
      v.setInt32(40, flatPts.length, true);

      let off = 44;
      for (const ps of partStarts) {
        v.setInt32(off, ps, true);
        off += 4;
      }
      for (const pt of flatPts) {
        v.setFloat64(off, pt[0], true);
        v.setFloat64(off + 8, pt[1], true);
        off += 16;
      }
      recordPayloads.push(new Uint8Array(rec));
    }
  }

  const shpTotalBytes =
    100 + recordPayloads.reduce((sum, p) => sum + 8 + p.byteLength, 0);
  const shxTotalBytes = 100 + recordPayloads.length * 8;

  const shpBuf = new ArrayBuffer(shpTotalBytes);
  const shpView = new DataView(shpBuf);
  const shpBytes = new Uint8Array(shpBuf);
  writeShpHeader(shpView, shpTotalBytes, shapeType, gXmin, gYmin, gXmax, gYmax);

  const shxBuf = new ArrayBuffer(shxTotalBytes);
  const shxView = new DataView(shxBuf);
  writeShpHeader(shxView, shxTotalBytes, shapeType, gXmin, gYmin, gXmax, gYmax);

  let shpCursor = 100;
  recordPayloads.forEach((payload, i) => {
    const contentWords = payload.byteLength / 2;
    const offsetWords = shpCursor / 2;
    // .shp record header (big-endian)
    shpView.setInt32(shpCursor, i + 1, false);
    shpView.setInt32(shpCursor + 4, contentWords, false);
    shpBytes.set(payload, shpCursor + 8);
    // .shx entry (big-endian)
    shxView.setInt32(100 + i * 8, offsetWords, false);
    shxView.setInt32(100 + i * 8 + 4, contentWords, false);
    shpCursor += 8 + payload.byteLength;
  });

  const dbfBytes = buildDbfBuffer(matchingFeatures);
  const baseName = sanitizeAscii(layerName).replace(/[^A-Za-z0-9_-]/g, '_') || 'capa_gis';

  const zip = new JSZip();
  zip.file(`${baseName}.shp`, shpBytes);
  zip.file(`${baseName}.shx`, new Uint8Array(shxBuf));
  zip.file(`${baseName}.dbf`, dbfBytes);
  zip.file(`${baseName}.prj`, WKT_BY_CRS[targetCrs] || WKT_BY_CRS['EPSG:4326']);
  zip.file(`${baseName}.cpg`, 'ISO-8859-1');

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function detectCrsFromPrjWkt(prjText: string): CrsCode | null {
  const u = prjText.toUpperCase();
  if (u.includes('UTM_ZONE_17S') || u.includes('UTM ZONE 17S')) {
    return u.includes('PSAD') ? 'EPSG:24877' : 'EPSG:32717';
  }
  if (u.includes('UTM_ZONE_18S') || u.includes('UTM ZONE 18S')) {
    return u.includes('PSAD') ? 'EPSG:24878' : 'EPSG:32718';
  }
  if (u.includes('UTM_ZONE_19S') || u.includes('UTM ZONE 19S')) {
    return 'EPSG:32719';
  }
  if (u.includes('MERCATOR')) return 'EPSG:3857';
  if (u.includes('WGS_1984') || u.includes('WGS 84')) return 'EPSG:4326';
  return null;
}

function parseDbfBuffer(buf: ArrayBuffer): Array<Record<string, any>> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const numRecords = view.getUint32(4, true);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);

  const fields: Array<{ name: string; type: string; length: number }> = [];
  let offset = 32;
  while (offset + 32 <= headerLength && bytes[offset] !== 0x0d) {
    let name = '';
    for (let i = 0; i < 11; i++) {
      const ch = bytes[offset + i];
      if (ch === 0) break;
      name += String.fromCharCode(ch);
    }
    const type = String.fromCharCode(bytes[offset + 11]);
    const length = bytes[offset + 16];
    fields.push({ name: name.trim(), type, length });
    offset += 32;
  }

  const decoder = new TextDecoder('latin1');
  const rows: Array<Record<string, any>> = [];
  let recOffset = headerLength;
  for (let r = 0; r < numRecords && recOffset + recordLength <= bytes.length; r++) {
    const flag = bytes[recOffset];
    if (flag !== 0x2a) {
      // not deleted
      const row: Record<string, any> = {};
      let cOff = recOffset + 1;
      for (const f of fields) {
        const rawText = decoder.decode(bytes.subarray(cOff, cOff + f.length)).trim();
        if (f.type === 'N' || f.type === 'F') {
          const num = Number(rawText);
          row[f.name] = rawText !== '' && Number.isFinite(num) ? num : rawText;
        } else {
          row[f.name] = rawText;
        }
        cOff += f.length;
      }
      rows.push(row);
    }
    recOffset += recordLength;
  }
  return rows;
}

export async function parseShapefileZipBuffer(buffer: ArrayBuffer): Promise<ImportedVectorResult> {
  const zip = await JSZip.loadAsync(buffer);
  const fileNames = Object.keys(zip.files);
  const shpFileName = fileNames.find((f) => f.toLowerCase().endsWith('.shp'));
  if (!shpFileName) {
    throw new Error('El archivo ZIP no contiene ningún fichero .shp válido.');
  }

  const basePrefix = shpFileName.slice(0, -4).toLowerCase();
  const dbfFileName = fileNames.find((f) => f.toLowerCase() === `${basePrefix}.dbf`) || fileNames.find((f) => f.toLowerCase().endsWith('.dbf'));
  const prjFileName = fileNames.find((f) => f.toLowerCase() === `${basePrefix}.prj`) || fileNames.find((f) => f.toLowerCase().endsWith('.prj'));

  const shpBuffer = await zip.files[shpFileName].async('arraybuffer');
  const dbfRows = dbfFileName ? parseDbfBuffer(await zip.files[dbfFileName].async('arraybuffer')) : [];
  const prjText = prjFileName ? await zip.files[prjFileName].async('text') : '';

  const view = new DataView(shpBuffer);
  if (shpBuffer.byteLength < 100 || view.getInt32(0, false) !== 9994) {
    throw new Error('Cabecera binaria .shp inválida (Magic FileCode != 9994).');
  }

  const features: Feature<Geometry, Record<string, any>>[] = [];
  let cursor = 100;
  let recIdx = 0;

  while (cursor + 8 <= shpBuffer.byteLength) {
    const contentWords = view.getInt32(cursor + 4, false);
    const contentBytes = contentWords * 2;
    const dataStart = cursor + 8;
    if (dataStart + contentBytes > shpBuffer.byteLength) break;

    const shapeType = view.getInt32(dataStart, true);
    const props = dbfRows[recIdx] || { name: `SHP-${recIdx + 1}` };
    let geometry: Geometry | null = null;

    if (shapeType === 1 || shapeType === 11 || shapeType === 21) {
      const x = view.getFloat64(dataStart + 4, true);
      const y = view.getFloat64(dataStart + 12, true);
      geometry = { type: 'Point', coordinates: [x, y] };
    } else if (
      shapeType === 3 ||
      shapeType === 5 ||
      shapeType === 13 ||
      shapeType === 15 ||
      shapeType === 23 ||
      shapeType === 25
    ) {
      const numParts = view.getInt32(dataStart + 36, true);
      const numPoints = view.getInt32(dataStart + 40, true);
      const parts: number[] = [];
      let off = dataStart + 44;
      for (let p = 0; p < numParts; p++) {
        parts.push(view.getInt32(off, true));
        off += 4;
      }
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < numPoints; i++) {
        const x = view.getFloat64(off, true);
        const y = view.getFloat64(off + 8, true);
        pts.push([x, y]);
        off += 16;
      }
      const ringCoords = parts.map((startIdx, pIdx) => {
        const endIdx = pIdx + 1 < parts.length ? parts[pIdx + 1] : pts.length;
        return pts.slice(startIdx, endIdx);
      });

      if (shapeType === 3 || shapeType === 13 || shapeType === 23) {
        geometry =
          ringCoords.length === 1
            ? { type: 'LineString', coordinates: ringCoords[0] }
            : { type: 'MultiLineString', coordinates: ringCoords };
      } else {
        const closedRings = ringCoords.map((ring) => {
          if (ring.length >= 3) {
            const first = ring[0];
            const last = ring[ring.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
              return [...ring, [first[0], first[1]]];
            }
          }
          return ring;
        });
        geometry = { type: 'Polygon', coordinates: closedRings };
      }
    }

    if (geometry) {
      features.push({
        type: 'Feature',
        properties: { ...props },
        geometry,
      });
    }
    cursor = dataStart + contentBytes;
    recIdx++;
  }

  if (features.length === 0) {
    throw new Error('No se pudieron extraer geometrías válidas del Shapefile.');
  }

  const rawFc: GeoFeatureCollection = { type: 'FeatureCollection', features };
  const detectedCrs = (prjText && detectCrsFromPrjWkt(prjText)) || detectCrsFromGeoJson(rawFc);
  const normalizedFc =
    detectedCrs !== 'EPSG:4326' ? transformFeatureCollectionCrs(rawFc, detectedCrs, 'EPSG:4326') : rawFc;
  const report = validateGeometryTopology(normalizedFc);

  return {
    geojson: normalizedFc,
    detectedCrs,
    featureCount: normalizedFc.features.length,
    warnings: report.issues.slice(0, 5).map((i) => `${i.featureName}: ${i.reason}`),
  };
}

// =========================================================
// 2. BINARY FLOAT32 GEOTIFF WRITER & WINDOWED COG READER
// =========================================================

export function exportDemToGeoTiffBuffer(dem: DemGrid): ArrayBuffer {
  const width = dem.cols;
  const height = dem.rows;
  const pixelCount = width * height;
  const dataByteLen = pixelCount * 4;

  const [minLng, minLat, maxLng, maxLat] = dem.bounds;
  const scaleX = (maxLng - minLng) / Math.max(width, 1);
  const scaleY = (maxLat - minLat) / Math.max(height, 1);

  // Strictly sorted IFD tags required by TIFF 6.0 & geotiff.js
  const numTags = 13;
  const ifdStart = 8;
  const ifdSize = 2 + numTags * 12 + 4;
  const extraStart = ifdStart + ifdSize;

  // Extra arrays: ModelPixelScale (3*8=24B), ModelTiepoint (6*8=48B), GeoKeyDirectory (16*2=32B)
  const pixelScaleOff = extraStart;
  const tiepointOff = pixelScaleOff + 24;
  const geoKeyOff = tiepointOff + 48;
  const stripOffset = geoKeyOff + 32;
  const totalBytes = stripOffset + dataByteLen;

  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);

  // TIFF Header: Little-Endian ('II'), Magic 42, First IFD offset 8
  view.setUint8(0, 0x49);
  view.setUint8(1, 0x49);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdStart, true);

  view.setUint16(ifdStart, numTags, true);
  let tOff = ifdStart + 2;
  const writeTag = (tag: number, type: number, count: number, valueOrOffset: number, isFloat = false) => {
    view.setUint16(tOff, tag, true);
    view.setUint16(tOff + 2, type, true);
    view.setUint32(tOff + 4, count, true);
    if (isFloat) {
      view.setFloat32(tOff + 8, valueOrOffset, true);
    } else if (type === 3 && count === 1) {
      view.setUint16(tOff + 8, valueOrOffset, true);
      view.setUint16(tOff + 10, 0, true);
    } else {
      view.setUint32(tOff + 8, valueOrOffset, true);
    }
    tOff += 12;
  };

  writeTag(256, 4, 1, width); // ImageWidth (LONG)
  writeTag(257, 4, 1, height); // ImageLength (LONG)
  writeTag(258, 3, 1, 32); // BitsPerSample = 32 (SHORT)
  writeTag(259, 3, 1, 1); // Compression = Uncompressed (SHORT)
  writeTag(262, 3, 1, 1); // PhotometricInterpretation = BlackIsZero
  writeTag(273, 4, 1, stripOffset); // StripOffsets
  writeTag(277, 3, 1, 1); // SamplesPerPixel = 1
  writeTag(278, 4, 1, height); // RowsPerStrip = height
  writeTag(279, 4, 1, dataByteLen); // StripByteCounts
  writeTag(339, 3, 1, 3); // SampleFormat = IEEEFloat (3)
  writeTag(33550, 12, 3, pixelScaleOff); // ModelPixelScaleTag (DOUBLE x 3)
  writeTag(33922, 12, 6, tiepointOff); // ModelTiepointTag (DOUBLE x 6)
  writeTag(34735, 3, 16, geoKeyOff); // GeoKeyDirectoryTag (SHORT x 16)
  view.setUint32(tOff, 0, true); // Next IFD = 0

  // ModelPixelScale [ScaleX, ScaleY, ScaleZ]
  view.setFloat64(pixelScaleOff, scaleX, true);
  view.setFloat64(pixelScaleOff + 8, scaleY, true);
  view.setFloat64(pixelScaleOff + 16, 0, true);

  // ModelTiepoint [I=0, J=0, K=0, X=minLng, Y=maxLat, Z=0]
  view.setFloat64(tiepointOff, 0, true);
  view.setFloat64(tiepointOff + 8, 0, true);
  view.setFloat64(tiepointOff + 16, 0, true);
  view.setFloat64(tiepointOff + 24, minLng, true);
  view.setFloat64(tiepointOff + 32, maxLat, true);
  view.setFloat64(tiepointOff + 40, 0, true);

  // GeoKeyDirectoryTag: WGS84 Geographic 4326
  const epsgCode = dem.crs === 'EPSG:32718' ? 32718 : dem.crs === 'EPSG:32717' ? 32717 : 4326;
  const modelType = epsgCode === 4326 ? 2 : 1; // 2=Geographic, 1=Projected
  const geoKeyType = epsgCode === 4326 ? 2048 : 3072; // GeographicTypeGeoKey vs ProjectedCSTypeGeoKey
  const keys = [
    1, 1, 0, 3, // Header: Version 1.1.0, 3 keys
    1024, 0, 1, modelType, // GTModelTypeGeoKey
    1025, 0, 1, 1, // GTRasterTypeGeoKey = PixelIsArea
    geoKeyType, 0, 1, epsgCode,
  ];
  keys.forEach((val, idx) => {
    view.setUint16(geoKeyOff + idx * 2, val, true);
  });

  // Pixel values IEEE Float32 row-major
  for (let i = 0; i < pixelCount; i++) {
    const val = Number.isFinite(dem.values[i]) ? dem.values[i] : dem.noData;
    view.setFloat32(stripOffset + i * 4, val, true);
  }

  return buf;
}

export async function readGeoTiffWindowed(
  buffer: ArrayBuffer,
  fallbackBounds: [number, number, number, number],
  windowBox?: [number, number, number, number] // [x0, y0, x1, y1] in pixels
): Promise<{
  grid: DemGrid;
  sourceWidth: number;
  sourceHeight: number;
  overviewCount: number;
}> {
  const tiff = await fromArrayBuffer(buffer);
  const overviewCount = await tiff.getImageCount();
  const image = await tiff.getImage(0);
  const sourceWidth = image.getWidth();
  const sourceHeight = image.getHeight();

  const x0 = windowBox ? Math.max(0, Math.min(sourceWidth - 1, Math.floor(windowBox[0]))) : 0;
  const y0 = windowBox ? Math.max(0, Math.min(sourceHeight - 1, Math.floor(windowBox[1]))) : 0;
  const x1 = windowBox ? Math.max(x0 + 1, Math.min(sourceWidth, Math.ceil(windowBox[2]))) : sourceWidth;
  const y1 = windowBox ? Math.max(y0 + 1, Math.min(sourceHeight, Math.ceil(windowBox[3]))) : sourceHeight;

  const rasters = await image.readRasters({ window: [x0, y0, x1, y1] });
  const band0 = rasters[0] as ArrayLike<number>;
  const winW = x1 - x0;
  const winH = y1 - y0;

  let bbox = fallbackBounds;
  try {
    const b = image.getBoundingBox();
    if (b.length === 4 && b.every(Number.isFinite) && Math.abs(b[0]) <= 180 && Math.abs(b[1]) <= 90) {
      const lngSpan = b[2] - b[0];
      const latSpan = b[3] - b[1];
      bbox = [
        b[0] + (x0 / sourceWidth) * lngSpan,
        b[3] - (y1 / sourceHeight) * latSpan,
        b[0] + (x1 / sourceWidth) * lngSpan,
        b[3] - (y0 / sourceHeight) * latSpan,
      ];
    }
  } catch {
    bbox = fallbackBounds;
  }

  const targetCols = Math.min(winW, 64);
  const targetRows = Math.min(winH, 64);
  const values: number[] = [];
  for (let r = 0; r < targetRows; r++) {
    const srcR = Math.floor((r / targetRows) * winH);
    for (let c = 0; c < targetCols; c++) {
      const srcC = Math.floor((c / targetCols) * winW);
      const val = Number(band0[srcR * winW + srcC]);
      values.push(Number.isFinite(val) ? Math.round(val * 1000) / 1000 : 0);
    }
  }

  const widthMeters = turf.distance([bbox[0], (bbox[1] + bbox[3]) / 2], [bbox[2], (bbox[1] + bbox[3]) / 2], {
    units: 'meters',
  });

  return {
    grid: {
      id: `tiff-win-${Date.now()}`,
      name: `GeoTIFF Ventaneado (${winW}×${winH}px de ${sourceWidth}×${sourceHeight})`,
      cols: targetCols,
      rows: targetRows,
      cellSizeMeters: Math.max(5, Math.round(widthMeters / Math.max(targetCols, 1))),
      bounds: bbox,
      crs: 'EPSG:4326',
      noData: -9999,
      unit: 'valor',
      values,
      colorScale: 'elevation',
    },
    sourceWidth,
    sourceHeight,
    overviewCount,
  };
}

// =========================================================
// 3. AUTOCAD DXF ASCII READER & WRITER
// =========================================================

export function exportGeoJsonToDxf(
  fc: GeoFeatureCollection,
  targetCrs: CrsCode = 'EPSG:32718'
): string {
  const projected =
    targetCrs !== 'EPSG:4326' ? transformFeatureCollectionCrs(fc, 'EPSG:4326', targetCrs) : fc;

  const lines: string[] = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1015',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];

  for (const f of projected.features) {
    if (!f.geometry) continue;
    const layer = sanitizeAscii(String(f.properties?.category || f.properties?.tipo || 'GIS_LAYER'))
      .replace(/\s+/g, '_')
      .slice(0, 24);

    if (f.geometry.type === 'Point') {
      const [x, y] = f.geometry.coordinates;
      lines.push('0', 'POINT', '8', layer, '10', String(x), '20', String(y), '30', '0');
    } else if (f.geometry.type === 'LineString') {
      const coords = f.geometry.coordinates;
      lines.push('0', 'LWPOLYLINE', '8', layer, '90', String(coords.length), '70', '0');
      for (const [x, y] of coords) {
        lines.push('10', String(x), '20', String(y));
      }
    } else if (f.geometry.type === 'Polygon') {
      const ring = f.geometry.coordinates[0] || [];
      const uniquePts =
        ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
          ? ring.slice(0, -1)
          : ring;
      lines.push('0', 'LWPOLYLINE', '8', layer, '90', String(uniquePts.length), '70', '1');
      for (const [x, y] of uniquePts) {
        lines.push('10', String(x), '20', String(y));
      }
    }
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

export function parseDxfText(dxfText: string, sourceCrs: CrsCode = 'EPSG:32718'): ImportedVectorResult {
  const rawLines = dxfText.split(/\r?\n/).map((l) => l.trim());
  const pairs: Array<[number, string]> = [];
  for (let i = 0; i + 1 < rawLines.length; i += 2) {
    const code = Number(rawLines[i]);
    if (Number.isFinite(code)) {
      pairs.push([code, rawLines[i + 1]]);
    }
  }

  const features: Feature<Geometry, Record<string, any>>[] = [];
  let inEntities = false;
  let i = 0;

  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === 2 && val === 'ENTITIES') {
      inEntities = true;
      i++;
      continue;
    }
    if (code === 0 && val === 'ENDSEC' && inEntities) {
      break;
    }
    if (!inEntities) {
      i++;
      continue;
    }

    if (code === 0 && (val === 'POINT' || val === 'LINE' || val === 'LWPOLYLINE' || val === 'POLYLINE')) {
      const entityType = val;
      let layer = 'CAD';
      let flags = 0;
      const xs: number[] = [];
      const ys: number[] = [];
      let x1 = NaN,
        y1 = NaN,
        x2 = NaN,
        y2 = NaN;

      i++;
      while (i < pairs.length && pairs[i][0] !== 0) {
        const [ec, ev] = pairs[i];
        if (ec === 8) layer = ev;
        else if (ec === 70) flags = Number(ev);
        else if (ec === 10) {
          if (entityType === 'LINE') x1 = Number(ev);
          else xs.push(Number(ev));
        } else if (ec === 20) {
          if (entityType === 'LINE') y1 = Number(ev);
          else ys.push(Number(ev));
        } else if (ec === 11 && entityType === 'LINE') x2 = Number(ev);
        else if (ec === 21 && entityType === 'LINE') y2 = Number(ev);
        i++;
      }

      if (entityType === 'POINT' && Number.isFinite(xs[0]) && Number.isFinite(ys[0])) {
        features.push({
          type: 'Feature',
          properties: { name: `${layer} Punto`, layer },
          geometry: { type: 'Point', coordinates: [xs[0], ys[0]] },
        });
      } else if (entityType === 'LINE' && Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
        features.push({
          type: 'Feature',
          properties: { name: `${layer} Línea`, layer },
          geometry: { type: 'LineString', coordinates: [[x1, y1], [x2, y2]] },
        });
      } else if (entityType === 'LWPOLYLINE' && xs.length >= 2 && ys.length >= 2) {
        const coords: Array<[number, number]> = xs
          .slice(0, ys.length)
          .map((x, idx) => [x, ys[idx]]);
        const isClosed = (flags & 1) === 1;
        if (isClosed && coords.length >= 3) {
          const ring = [...coords, [coords[0][0], coords[0][1]] as [number, number]];
          features.push({
            type: 'Feature',
            properties: { name: `${layer} Polígono`, layer },
            geometry: { type: 'Polygon', coordinates: [ring] },
          });
        } else {
          features.push({
            type: 'Feature',
            properties: { name: `${layer} Polilínea`, layer },
            geometry: { type: 'LineString', coordinates: coords },
          });
        }
      }
      continue;
    }
    i++;
  }

  if (features.length === 0) {
    throw new Error('No se encontraron entidades DXF válidas (POINT, LINE o LWPOLYLINE).');
  }

  const rawFc: GeoFeatureCollection = { type: 'FeatureCollection', features };
  const detectedCrs = sourceCrs || detectCrsFromGeoJson(rawFc);
  const autoCrs = detectedCrs === 'EPSG:4326' && detectCrsFromGeoJson(rawFc) !== 'EPSG:4326'
    ? detectCrsFromGeoJson(rawFc)
    : detectedCrs;
  const normalized =
    autoCrs !== 'EPSG:4326' ? transformFeatureCollectionCrs(rawFc, autoCrs, 'EPSG:4326') : rawFc;

  return {
    geojson: normalized,
    detectedCrs: autoCrs,
    featureCount: normalized.features.length,
    warnings: [],
  };
}

// =========================================================
// 4. OGC GML 3.2 & COMPRESSED KMZ
// =========================================================

export function exportGeoJsonToGml(fc: GeoFeatureCollection, layerName: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const members = fc.features
    .filter((f) => Boolean(f.geometry))
    .map((f, idx) => {
      const name = esc(String(f.properties?.name || f.properties?.nombre || `Feature_${idx + 1}`));
      let geomXml = '';
      if (f.geometry.type === 'Point') {
        const [lng, lat] = f.geometry.coordinates;
        geomXml = `<gml:Point srsName="EPSG:4326"><gml:pos>${lng} ${lat}</gml:pos></gml:Point>`;
      } else if (f.geometry.type === 'LineString') {
        const posList = f.geometry.coordinates.map((c) => `${c[0]} ${c[1]}`).join(' ');
        geomXml = `<gml:LineString srsName="EPSG:4326"><gml:posList>${posList}</gml:posList></gml:LineString>`;
      } else if (f.geometry.type === 'Polygon') {
        const posList = f.geometry.coordinates[0].map((c) => `${c[0]} ${c[1]}`).join(' ');
        geomXml = `<gml:Polygon srsName="EPSG:4326"><gml:exterior><gml:LinearRing><gml:posList>${posList}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon>`;
      }
      return `  <gml:featureMember>\n    <eco:GeoFeature gml:id="f_${idx + 1}">\n      <eco:name>${name}</eco:name>\n      <eco:geometry>${geomXml}</eco:geometry>\n    </eco:GeoFeature>\n  </gml:featureMember>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:eco="https://ecointelligence.gis/ns" gml:id="${esc(
    layerName.replace(/\s+/g, '_')
  )}">\n${members}\n</gml:FeatureCollection>`;
}

function parsePosList(text: string): Array<[number, number]> {
  const nums = text.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  const coords: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    coords.push([nums[i], nums[i + 1]]);
  }
  return coords;
}

export function parseGmlText(gmlText: string): ImportedVectorResult {
  const members = gmlText.match(/<gml:featureMember[\s\S]*?<\/gml:featureMember>/gi) || [];
  const features: Feature<Geometry, Record<string, any>>[] = [];

  for (let i = 0; i < members.length; i++) {
    const block = members[i];
    const nameMatch = block.match(/<(?:eco:)?name>([\s\S]*?)<\/(?:eco:)?name>/i);
    const name = nameMatch ? nameMatch[1].trim() : `GML-${i + 1}`;

    const polyMatch = block.match(/<gml:Polygon[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>[\s\S]*?<\/gml:Polygon>/i);
    const lineMatch = block.match(/<gml:LineString[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>[\s\S]*?<\/gml:LineString>/i);
    const ptMatch = block.match(/<gml:Point[\s\S]*?<gml:pos[^>]*>([\s\S]*?)<\/gml:pos>[\s\S]*?<\/gml:Point>/i);

    if (polyMatch) {
      const ring = parsePosList(polyMatch[1]);
      if (ring.length >= 3) {
        if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
          ring.push([ring[0][0], ring[0][1]]);
        }
        features.push({
          type: 'Feature',
          properties: { name },
          geometry: { type: 'Polygon', coordinates: [ring] },
        });
      }
    } else if (lineMatch) {
      const coords = parsePosList(lineMatch[1]);
      if (coords.length >= 2) {
        features.push({
          type: 'Feature',
          properties: { name },
          geometry: { type: 'LineString', coordinates: coords },
        });
      }
    } else if (ptMatch) {
      const coords = parsePosList(ptMatch[1]);
      if (coords.length >= 1) {
        features.push({
          type: 'Feature',
          properties: { name },
          geometry: { type: 'Point', coordinates: coords[0] },
        });
      }
    }
  }

  if (features.length === 0) {
    throw new Error('No se encontraron entidades featureMember GML 3.2 válidas.');
  }

  const rawFc: GeoFeatureCollection = { type: 'FeatureCollection', features };
  const detectedCrs = detectCrsFromGeoJson(rawFc);
  const normalized =
    detectedCrs !== 'EPSG:4326' ? transformFeatureCollectionCrs(rawFc, detectedCrs, 'EPSG:4326') : rawFc;

  return {
    geojson: normalized,
    detectedCrs,
    featureCount: normalized.features.length,
    warnings: [],
  };
}

export async function exportGeoJsonToKmzBuffer(
  fc: GeoFeatureCollection,
  documentName: string
): Promise<Uint8Array> {
  const kml = exportGeoJsonToKml(fc, documentName);
  const zip = new JSZip();
  zip.file('doc.kml', kml);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export async function parseKmzBuffer(buffer: ArrayBuffer): Promise<ImportedVectorResult> {
  const zip = await JSZip.loadAsync(buffer);
  const kmlEntry =
    zip.files['doc.kml'] ||
    Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith('.kml'));
  if (!kmlEntry) {
    throw new Error('El paquete KMZ no contiene ningún archivo .kml.');
  }
  const kmlText = await kmlEntry.async('text');
  return parseKmlText(kmlText);
}

// Re-export projectCoordinate to avoid unused import warnings if consumers need it
export { projectCoordinate };
