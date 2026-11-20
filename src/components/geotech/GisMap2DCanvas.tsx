import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import type { Point, Polygon } from 'geojson';
import {
  MousePointer,
  Ruler,
  Pentagon,
  MapPin,
  TrendingUp,
  Crosshair,
  Trash2,
  Layers,
} from 'lucide-react';
import {
  CrsCode,
  DemGrid,
  GisLayer,
  BoreholeRecord,
  projectCoordinate,
} from '../../utils/geotechEngine';

export type MapToolMode =
  | 'pan'
  | 'measure_distance'
  | 'measure_area'
  | 'profile_line'
  | 'draw_point'
  | 'draw_polygon';

export type BaseMapId = 'osm' | 'satellite' | 'topo' | 'clean';

interface GisMap2DCanvasProps {
  center: [number, number]; // [lng, lat]
  zoom: number;
  activeCrs: CrsCode;
  layers: GisLayer[];
  activeRaster?: DemGrid | null;
  activeRasterOpacity?: number;
  boreholes: BoreholeRecord[];
  selectedFeatureInfo: Record<string, any> | null;
  canEdit: boolean;
  onSelectFeature: (props: Record<string, any> | null, layerName?: string) => void;
  onSelectBorehole: (bh: BoreholeRecord) => void;
  onProfileLineComplete: (coords: Array<[number, number]>) => void;
  onDigitizeFeature: (geometry: Point | Polygon) => void;
}

function rasterValueToRgba(
  val: number,
  min: number,
  max: number,
  scale: DemGrid['colorScale'] = 'elevation'
): [number, number, number, number] {
  if (!Number.isFinite(val) || val === -9999) return [0, 0, 0, 0];
  const t = Math.max(0, Math.min(1, (val - min) / Math.max(max - min, 1e-6)));

  if (scale === 'classes') {
    const palette: Array<[number, number, number]> = [
      [37, 99, 235],   // 0: Water / Hidden
      [217, 119, 6],   // 1: Bare / Visible
      [132, 204, 22],  // 2: Sparse Veg
      [21, 128, 61],   // 3: Dense Veg
    ];
    const idx = Math.max(0, Math.min(palette.length - 1, Math.round(val)));
    return [palette[idx][0], palette[idx][1], palette[idx][2], 195];
  }

  if (scale === 'hillshade') {
    const g = Math.max(0, Math.min(255, Math.round(val)));
    return [g, g, g, 185];
  }

  if (scale === 'ndvi' || scale === 'suitability') {
    // Red/Amber -> Yellow -> Emerald Green
    if (t < 0.5) {
      const k = t * 2;
      return [Math.round(220 - k * 20), Math.round(60 + k * 145), Math.round(50 + k * 20), 190];
    }
    const k = (t - 0.5) * 2;
    return [Math.round(200 - k * 180), Math.round(205 - k * 55), Math.round(70 - k * 10), 190];
  }

  if (scale === 'ndwi' || scale === 'twi') {
    // Pale beige -> Cyan -> Deep Blue
    return [
      Math.round(225 - t * 200),
      Math.round(235 - t * 115),
      Math.round(210 + t * 45),
      195,
    ];
  }

  if (scale === 'slope' || scale === 'thermal' || scale === 'idw') {
    // Cool green/blue -> Amber -> Crimson
    if (t < 0.5) {
      const k = t * 2;
      return [Math.round(45 + k * 200), Math.round(170 + k * 25), Math.round(130 - k * 90), 190];
    }
    const k = (t - 0.5) * 2;
    return [Math.round(245 - k * 25), Math.round(195 - k * 155), Math.round(40 - k * 15), 195];
  }

  // Elevation hypsometric ramp (green valley -> tan -> brown ridge -> light peak)
  if (t < 0.35) {
    const k = t / 0.35;
    return [Math.round(55 + k * 130), Math.round(145 + k * 45), Math.round(80 + k * 30), 175];
  }
  if (t < 0.7) {
    const k = (t - 0.35) / 0.35;
    return [Math.round(185 - k * 35), Math.round(190 - k * 80), Math.round(110 - k * 50), 175];
  }
  const k = (t - 0.7) / 0.3;
  return [Math.round(150 + k * 85), Math.round(110 + k * 120), Math.round(60 + k * 170), 180];
}

export function renderGridToDataUrl(grid: DemGrid): string {
  const canvas = document.createElement('canvas');
  canvas.width = grid.cols;
  canvas.height = grid.rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const validVals = grid.values.filter((v) => Number.isFinite(v) && v !== grid.noData);
  const min = validVals.length ? Math.min(...validVals) : 0;
  const max = validVals.length ? Math.max(...validVals) : 1;

  const img = ctx.createImageData(grid.cols, grid.rows);
  for (let i = 0; i < grid.values.length; i++) {
    const [r, g, b, a] = rasterValueToRgba(grid.values[i], min, max, grid.colorScale);
    const p = i * 4;
    img.data[p] = r;
    img.data[p + 1] = g;
    img.data[p + 2] = b;
    img.data[p + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export const GisMap2DCanvas: React.FC<GisMap2DCanvasProps> = ({
  center,
  zoom,
  activeCrs,
  layers,
  activeRaster,
  activeRasterOpacity = 0.7,
  boreholes,
  canEdit,
  onSelectFeature,
  onSelectBorehole,
  onProfileLineComplete,
  onDigitizeFeature,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseTileRef = useRef<L.TileLayer | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const sketchGroupRef = useRef<L.LayerGroup | null>(null);
  const rasterOverlayRef = useRef<L.ImageOverlay | null>(null);

  const [toolMode, setToolMode] = useState<MapToolMode>('pan');
  const [baseMap, setBaseMap] = useState<BaseMapId>('osm');
  const [cursorCoord, setCursorCoord] = useState<[number, number]>(center);
  const [sketchPts, setSketchPts] = useState<Array<[number, number]>>([]);
  const [measureResult, setMeasureResult] = useState<string>('');

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center[1], center[0]],
      zoom,
      zoomControl: true,
      preferCanvas: true,
    });

    const overlays = L.layerGroup().addTo(map);
    const sketches = L.layerGroup().addTo(map);
    overlayGroupRef.current = overlays;
    sketchGroupRef.current = sketches;
    mapRef.current = map;

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoord([e.latlng.lng, e.latlng.lat]);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      overlayGroupRef.current = null;
      sketchGroupRef.current = null;
      baseTileRef.current = null;
      rasterOverlayRef.current = null;
    };
  }, []);

  // Recenter smoothly when switching projects
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([center[1], center[0]], zoom, { animate: false });
    setSketchPts([]);
    setMeasureResult('');
  }, [center[0], center[1], zoom]);

  // Base map tiles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (baseTileRef.current) {
      map.removeLayer(baseTileRef.current);
      baseTileRef.current = null;
    }

    if (baseMap === 'clean') return;

    const tileConfigs: Record<Exclude<BaseMapId, 'clean'>, { url: string; attr: string }> = {
      osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attr: '© OpenStreetMap',
      },
      satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attr: '© Esri World Imagery',
      },
      topo: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attr: '© OpenTopoMap',
      },
    };

    const cfg = tileConfigs[baseMap];
    baseTileRef.current = L.tileLayer(cfg.url, { attribution: cfg.attr, maxZoom: 19 }).addTo(map);
    baseTileRef.current.bringToBack();
  }, [baseMap]);

  // Raster Overlay Rendering
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (rasterOverlayRef.current) {
      map.removeLayer(rasterOverlayRef.current);
      rasterOverlayRef.current = null;
    }
    if (!activeRaster) return;

    const url = renderGridToDataUrl(activeRaster);
    if (!url) return;
    const [minLng, minLat, maxLng, maxLat] = activeRaster.bounds;
    rasterOverlayRef.current = L.imageOverlay(
      url,
      [
        [minLat, minLng],
        [maxLat, maxLng],
      ],
      { opacity: activeRasterOpacity, interactive: false }
    ).addTo(map);
  }, [activeRaster, activeRasterOpacity]);

  // Vector, WMS/XYZ & Borehole Layers Rendering
  useEffect(() => {
    const group = overlayGroupRef.current;
    if (!group) return;
    group.clearLayers();

    for (const lyr of layers) {
      if (!lyr.visible) continue;

      if (lyr.kind === 'wms' && lyr.serviceUrl) {
        L.tileLayer
          .wms(lyr.serviceUrl, {
            layers: lyr.wmsLayers || '0',
            format: 'image/png',
            transparent: true,
            opacity: lyr.opacity,
          })
          .addTo(group);
        continue;
      }

      if (lyr.kind === 'xyz' && lyr.serviceUrl) {
        L.tileLayer(lyr.serviceUrl, { opacity: lyr.opacity }).addTo(group);
        continue;
      }

      if (lyr.kind === 'raster' && lyr.raster) {
        const url = renderGridToDataUrl(lyr.raster);
        if (url) {
          const [minLng, minLat, maxLng, maxLat] = lyr.raster.bounds;
          L.imageOverlay(
            url,
            [
              [minLat, minLng],
              [maxLat, maxLng],
            ],
            { opacity: lyr.opacity }
          ).addTo(group);
        }
        continue;
      }

      if (lyr.geojson) {
        const color = lyr.symbology.color || '#059669';
        const fillColor = lyr.symbology.fillColor || color;
        const fillOpacity = (lyr.symbology.fillOpacity ?? 0.35) * lyr.opacity;
        const weight = lyr.symbology.weight ?? 2;
        const radius = lyr.symbology.radius ?? 6;

        L.geoJSON(lyr.geojson as any, {
          style: () => ({
            color,
            fillColor,
            fillOpacity,
            weight,
            opacity: lyr.opacity,
          }),
          pointToLayer: (_feature, latlng) =>
            L.circleMarker(latlng, {
              radius,
              color: '#ffffff',
              weight: 1.5,
              fillColor: fillColor,
              fillOpacity: Math.min(1, lyr.opacity * 0.92),
            }),
          onEachFeature: (feature, leafletLayer) => {
            const props = feature.properties || {};
            const title =
              props[lyr.symbology.labelField || 'name'] ||
              props.name ||
              props.station ||
              props.gi_class ||
              lyr.name;
            const rows = Object.entries(props)
              .slice(0, 6)
              .map(([k, v]) => `<div><span style="color:#64748b">${k}:</span> <strong>${String(v)}</strong></div>`)
              .join('');
            leafletLayer.bindPopup(
              `<div style="font-size:11px;min-width:170px"><div style="font-weight:700;margin-bottom:4px;color:#0f172a">${title}</div>${rows}</div>`
            );
            leafletLayer.on('click', () => {
              onSelectFeature(props, lyr.name);
            });
          },
        }).addTo(group);
      }
    }

    // Plot Geotechnical Boreholes (Sondeos SPT)
    for (const bh of boreholes) {
      const marker = L.circleMarker([bh.lat, bh.lng], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#b45309',
        fillOpacity: 1,
      });
      marker.bindTooltip(`${bh.code} (${bh.totalDepthM}m)`, { direction: 'top', offset: [0, -6] });
      marker.on('click', () => onSelectBorehole(bh));
      marker.addTo(group);
    }
  }, [layers, boreholes]);

  // Interactive Click Sketching (Measure, Profile, Digitize)
  useEffect(() => {
    const map = mapRef.current;
    const sketchGroup = sketchGroupRef.current;
    if (!map || !sketchGroup) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (toolMode === 'pan') return;
      const pt: [number, number] = [Number(e.latlng.lng.toFixed(6)), Number(e.latlng.lat.toFixed(6))];

      if (toolMode === 'draw_point' && canEdit) {
        onDigitizeFeature({ type: 'Point', coordinates: pt });
        setToolMode('pan');
        return;
      }

      setSketchPts((prev) => [...prev, pt]);
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [toolMode, canEdit]);

  // Render active sketch geometry and calculate geodesic measurement
  useEffect(() => {
    const group = sketchGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (sketchPts.length === 0) {
      setMeasureResult('');
      return;
    }

    for (const p of sketchPts) {
      L.circleMarker([p[1], p[0]], {
        radius: 4.5,
        color: '#0f172a',
        weight: 1.5,
        fillColor: '#10b981',
        fillOpacity: 1,
      }).addTo(group);
    }

    if (sketchPts.length >= 2) {
      if (toolMode === 'measure_area' || toolMode === 'draw_polygon') {
        const ring = [...sketchPts, sketchPts[0]];
        L.polygon(
          ring.map((p): [number, number] => [p[1], p[0]]),
          { color: '#059669', fillColor: '#10b981', fillOpacity: 0.25, weight: 2, dashArray: '4 4' }
        ).addTo(group);

        if (sketchPts.length >= 3) {
          const poly = turf.polygon([ring]);
          const areaM2 = turf.area(poly);
          const areaHa = areaM2 / 10000;
          setMeasureResult(`Área: ${areaHa.toFixed(2)} ha (${Math.round(areaM2).toLocaleString()} m²)`);
        } else {
          const lenM = turf.length(turf.lineString(sketchPts), { units: 'meters' });
          setMeasureResult(`Segmento: ${Math.round(lenM).toLocaleString()} m`);
        }
      } else {
        L.polyline(
          sketchPts.map((p): [number, number] => [p[1], p[0]]),
          { color: '#0284c7', weight: 3, dashArray: '5 4' }
        ).addTo(group);
        const lenM = turf.length(turf.lineString(sketchPts), { units: 'meters' });
        setMeasureResult(
          lenM >= 1000
            ? `Distancia: ${(lenM / 1000).toFixed(3)} km (${Math.round(lenM).toLocaleString()} m)`
            : `Distancia: ${Math.round(lenM).toLocaleString()} m`
        );
      }
    }
  }, [sketchPts, toolMode]);

  const handleFinishSketch = () => {
    if (toolMode === 'profile_line' && sketchPts.length >= 2) {
      onProfileLineComplete(sketchPts);
      setSketchPts([]);
      setToolMode('pan');
    } else if (toolMode === 'draw_polygon' && sketchPts.length >= 3 && canEdit) {
      const ring = [...sketchPts, sketchPts[0]];
      onDigitizeFeature({ type: 'Polygon', coordinates: [ring] });
      setSketchPts([]);
      setToolMode('pan');
    }
  };

  const handleFitBounds = () => {
    const map = mapRef.current;
    if (!map) return;
    if (activeRaster) {
      const [minLng, minLat, maxLng, maxLat] = activeRaster.bounds;
      map.fitBounds([
        [minLat, minLng],
        [maxLat, maxLng],
      ]);
      return;
    }
    map.setView([center[1], center[0]], zoom);
  };

  const utmCoord = projectCoordinate(cursorCoord, 'EPSG:4326', activeCrs === 'EPSG:4326' ? 'EPSG:32718' : activeCrs);

  return (
    <div className="relative w-full h-full min-h-[460px] bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
      {/* Leaflet Target */}
      <div ref={containerRef} className="w-full h-full min-h-[460px] z-0" data-testid="gis-map-2d" />

      {/* Top Bar: GIS Tools Ribbon (left) + Base Map Switcher (right) without overlap */}
      <div className="absolute top-3 left-14 right-3 z-[400] flex flex-wrap items-start justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg p-1 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setToolMode('pan');
              setSketchPts([]);
            }}
            title="Navegar / Identificar"
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
              toolMode === 'pan' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Identificar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setToolMode('measure_distance');
              setSketchPts([]);
            }}
            title="Medir distancia geodésica"
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
              toolMode === 'measure_distance' ? 'bg-sky-700 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Dist.</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setToolMode('measure_area');
              setSketchPts([]);
            }}
            title="Medir área en hectáreas"
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
              toolMode === 'measure_area' ? 'bg-sky-700 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Pentagon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Área</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setToolMode('profile_line');
              setSketchPts([]);
            }}
            title="Trazar perfil topográfico sobre DEM"
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
              toolMode === 'profile_line' ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Perfil DEM</span>
          </button>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => {
                  setToolMode('draw_point');
                  setSketchPts([]);
                }}
                title="Digitalizar punto en capa editable"
                className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                  toolMode === 'draw_point' ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">+Punto</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setToolMode('draw_polygon');
                  setSketchPts([]);
                }}
                title="Digitalizar polígono en capa editable"
                className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                  toolMode === 'draw_polygon' ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Pentagon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">+Polígono</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleFitBounds}
            title="Centrar extensión del proyecto"
            className="px-2 py-1 rounded text-[11px] font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Base Map Switcher */}
        <div className="pointer-events-auto flex items-center gap-1 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg p-1.5 shadow-sm shrink-0">
          <Layers className="w-3.5 h-3.5 text-slate-500 ml-0.5" />
          <select
            value={baseMap}
            onChange={(e) => setBaseMap(e.target.value as BaseMapId)}
            aria-label="Mapa base cartográfico"
            className="text-[11px] font-semibold text-slate-700 bg-transparent pr-1 focus:outline-none cursor-pointer"
          >
            <option value="osm">OpenStreetMap</option>
            <option value="satellite">Satélite (ESRI)</option>
            <option value="topo">Topográfico (OTM)</option>
            <option value="clean">Lienzo Blanco</option>
          </select>
        </div>
      </div>

      {/* Active Sketch / Measurement Banner */}
      {(toolMode !== 'pan' || measureResult) && (
        <div className="absolute top-14 left-14 z-[400] bg-slate-900/95 text-white px-3 py-1.5 rounded-lg text-[11px] flex items-center gap-2.5 shadow-md">
          <span className="font-semibold">
            {toolMode === 'measure_distance' && 'Clic en mapa para medir distancia'}
            {toolMode === 'measure_area' && 'Clic para trazar polígono (mín. 3 vértices)'}
            {toolMode === 'profile_line' && 'Trace una línea sobre el terreno para extraer perfil DEM'}
            {toolMode === 'draw_point' && 'Clic en el mapa para agregar punto a capa digitalizada'}
            {toolMode === 'draw_polygon' && 'Clic para dibujar polígono (mín. 3 vértices)'}
          </span>
          {measureResult && <span className="font-mono text-emerald-300 font-bold">{measureResult}</span>}
          {((toolMode === 'profile_line' && sketchPts.length >= 2) ||
            (toolMode === 'draw_polygon' && sketchPts.length >= 3)) && (
            <button
              type="button"
              onClick={handleFinishSketch}
              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 rounded text-[10px] font-bold cursor-pointer"
            >
              Finalizar
            </button>
          )}
          {sketchPts.length > 0 && (
            <button
              type="button"
              onClick={() => setSketchPts([])}
              aria-label="Limpiar trazo"
              className="p-0.5 text-slate-300 hover:text-white cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Bottom Left Coordinate HUD */}
      <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/90 text-slate-100 px-3 py-1.5 rounded-lg text-[10px] font-mono flex flex-wrap items-center gap-3 shadow-sm">
        <span>
          WGS84: {cursorCoord[1].toFixed(5)}°, {cursorCoord[0].toFixed(5)}°
        </span>
        <span className="text-emerald-300">
          {activeCrs === 'EPSG:4326' ? 'UTM 18S' : activeCrs}: E {Math.round(utmCoord[0]).toLocaleString()} · N{' '}
          {Math.round(utmCoord[1]).toLocaleString()}
        </span>
        {activeRaster && (
          <span className="text-sky-300">
            Ráster activo: {activeRaster.name} ({activeRaster.cols}×{activeRaster.rows})
          </span>
        )}
      </div>
    </div>
  );
};
