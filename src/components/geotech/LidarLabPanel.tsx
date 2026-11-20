import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ScanLine,
  Upload,
  Download,
  Layers,
  Filter,
  Mountain,
  Sliders,
} from 'lucide-react';
import { CrsCode, DemGrid, GisLayer } from '../../utils/geotechEngine';
import {
  buildLidarProducts,
  classifyGroundMorphological,
  classifyVegetationAndBuildings,
  computeLidarSurveyDiff,
  exportPointCloudToLasBuffer,
  extractContourLinesGeoJson,
  extractLidarSwathProfile,
  filterLidarNoiseSor,
  LidarPoint,
  parseLasBuffer,
  parsePointCloudCsv,
} from '../../utils/lidarEngine';
import { api } from '../../services/api';

interface LidarLabPanelProps {
  dem: DemGrid;
  defaultCrs: CrsCode;
  initialCloud?: LidarPoint[];
  canEdit: boolean;
  onPublishRaster: (grid: DemGrid, summary: string, toolName: string) => void;
  onPublishVectorLayer: (layer: GisLayer, summary: string) => void;
  onUpdateCloud: (points: LidarPoint[]) => void;
}

const CLASS_COLORS: Record<number, { label: string; hex: string; rgb: [number, number, number] }> = {
  1: { label: 'Sin clasificar (1)', hex: '#94a3b8', rgb: [0.58, 0.64, 0.72] },
  2: { label: 'Terreno / Suelo (2)', hex: '#b45309', rgb: [0.71, 0.33, 0.04] },
  3: { label: 'Veg. Baja (3)', hex: '#84cc16', rgb: [0.52, 0.8, 0.09] },
  4: { label: 'Veg. Media (4)', hex: '#22c55e', rgb: [0.13, 0.77, 0.37] },
  5: { label: 'Veg. Alta / Dosel (5)', hex: '#15803d', rgb: [0.08, 0.5, 0.24] },
  6: { label: 'Edificaciones / Naves (6)', hex: '#ef4444', rgb: [0.94, 0.27, 0.27] },
  7: { label: 'Ruido / Outliers (7)', hex: '#d946ef', rgb: [0.85, 0.27, 0.94] },
};

export const LidarLabPanel: React.FC<LidarLabPanelProps> = ({
  dem,
  defaultCrs,
  initialCloud,
  canEdit,
  onPublishRaster,
  onPublishVectorLayer,
  onUpdateCloud,
}) => {
  const [cloud, setCloud] = useState<LidarPoint[]>(initialCloud || []);
  const [colorMode, setColorMode] = useState<'classification' | 'elevation'>('classification');
  const [contourIntervalM, setContourIntervalM] = useState<number>(25);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCloud(initialCloud || []);
  }, [initialCloud]);

  const products = useMemo(() => {
    if (!cloud.length) return null;
    return buildLidarProducts(cloud, dem.bounds, defaultCrs, dem.cellSizeMeters, 24, 24);
  }, [cloud, dem.bounds, dem.cellSizeMeters, defaultCrs]);

  const swath = useMemo(() => {
    if (!cloud.length) return null;
    const [minLng, minLat, maxLng, maxLat] = dem.bounds;
    const midLat = (minLat + maxLat) / 2;
    return extractLidarSwathProfile(cloud, [minLng, midLat], [maxLng, midLat], 900);
  }, [cloud, dem.bounds]);

  // Software-WebGL-safe interactive 3D THREE.Points Renderer
  useEffect(() => {
    const container = mountRef.current;
    if (!container || cloud.length === 0) return;

    let renderer: THREE.WebGLRenderer;
    let isSoftwareGl = false;
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) isSoftwareGl = true;
      else {
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const gpu = String(probe.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      }
      renderer = new THREE.WebGLRenderer({ antialias: !isSoftwareGl, powerPreference: 'high-performance' });
    } catch {
      return;
    }

    const width = container.clientWidth || 720;
    const height = 380;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 400);
    camera.position.set(42, 34, 48);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.target.set(0, 4, 0);

    const [minLng, minLat, maxLng, maxLat] = dem.bounds;
    const zs = cloud.map((p) => p.z);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const zSpan = Math.max(maxZ - minZ, 1);

    const worldSize = 64;
    const positions = new Float32Array(cloud.length * 3);
    const colors = new Float32Array(cloud.length * 3);

    cloud.forEach((p, idx) => {
      const nx = (p.lng - minLng) / Math.max(maxLng - minLng, 1e-9);
      const ny = (maxLat - p.lat) / Math.max(maxLat - minLat, 1e-9);
      positions[idx * 3] = (nx - 0.5) * worldSize;
      positions[idx * 3 + 1] = ((p.z - minZ) / zSpan) * 18;
      positions[idx * 3 + 2] = (ny - 0.5) * worldSize;

      if (colorMode === 'classification') {
        const rgb = CLASS_COLORS[p.classification]?.rgb || [0.7, 0.7, 0.7];
        colors[idx * 3] = rgb[0];
        colors[idx * 3 + 1] = rgb[1];
        colors[idx * 3 + 2] = rgb[2];
      } else {
        const t = (p.z - minZ) / zSpan;
        colors[idx * 3] = t;
        colors[idx * 3 + 1] = 0.65 - Math.abs(t - 0.5) * 0.6;
        colors[idx * 3 + 2] = 1 - t;
      }
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 1.45, vertexColors: true });
    const pointsMesh = new THREE.Points(geom, mat);
    scene.add(pointsMesh);

    const grid = new THREE.GridHelper(worldSize + 8, 12, 0x334155, 0x1e293b);
    scene.add(grid);

    let disposed = false;
    let frameId = 0;
    const renderOnce = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
    };
    controls.addEventListener('change', () => {
      frameId = requestAnimationFrame(renderOnce);
    });
    renderOnce();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      controls.dispose();
      geom.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }, [cloud, dem.bounds, colorMode]);

  const handleRunClassificationPipeline = () => {
    setErrorMsg('');
    if (!cloud.length) return;
    const sor = filterLidarNoiseSor(cloud, 6, 1.8);
    const ground = classifyGroundMorphological(sor.points, dem.bounds, 16, 1.2);
    const full = classifyVegetationAndBuildings(ground.points, dem.bounds, 16);
    setCloud(full.points);
    onUpdateCloud(full.points);
    setStatusMsg(
      `Pipeline ASPRS completado: ${sor.noiseCount} outliers ruido (Clase 7), ${ground.groundCount} suelo (Clase 2), ${full.vegCount} vegetación (3–5), ${full.buildingCount} edificaciones (Clase 6).`
    );
  };

  const handleExportLas = () => {
    if (!cloud.length) return;
    const buf = exportPointCloudToLasBuffer(cloud, defaultCrs === 'EPSG:4326' ? 'EPSG:32718' : defaultCrs);
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nube_lidar_asprs_1_2.las`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportPointCloud = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setStatusMsg('');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (ext === 'las') {
        const buf = await file.arrayBuffer();
        const parsed = parseLasBuffer(buf, defaultCrs === 'EPSG:4326' ? 'EPSG:32718' : defaultCrs);
        setCloud(parsed.points);
        onUpdateCloud(parsed.points);
        setStatusMsg(`Importada nube ASPRS LAS v${parsed.version} (${parsed.points.length} puntos).`);
      } else if (ext === 'csv' || ext === 'xyz' || ext === 'txt') {
        const text = await file.text();
        const pts = parsePointCloudCsv(text, defaultCrs);
        setCloud(pts);
        onUpdateCloud(pts);
        setStatusMsg(`Importados ${pts.length} puntos XYZ/CSV.`);
      } else if (ext === 'laz') {
        const buf = new Uint8Array(await file.arrayBuffer());
        const res = await api.inspectLidarViaWorker(file.name, buf, true);
        const ptsRaw = res.data.sample_points || [];
        if (ptsRaw.length === 0) {
          throw new Error('La nube .laz no retornó puntos legibles desde PDAL.');
        }
        const [minLng, minLat, maxLng, maxLat] = dem.bounds;
        const [bMinX, bMinY, bMaxX, bMaxY] = res.data.bounds;
        const looksGeographic = Math.abs(bMinX) <= 180 && Math.abs(bMaxX) <= 180 && Math.abs(bMinY) <= 90 && Math.abs(bMaxY) <= 90;
        const toAsprsClass = (c: number) => ([1, 2, 3, 4, 5, 6, 7].includes(c) ? c : 1) as LidarPoint['classification'];
        const mappedPts: LidarPoint[] = ptsRaw.map((pt) => {
          if (looksGeographic) {
            return {
              lng: pt.x,
              lat: pt.y,
              z: pt.z,
              classification: toAsprsClass(pt.classification),
              intensity: pt.intensity,
              returnNum: 1,
            };
          }
          const nx = (pt.x - bMinX) / Math.max(bMaxX - bMinX, 1e-6);
          const ny = (pt.y - bMinY) / Math.max(bMaxY - bMinY, 1e-6);
          return {
            lng: minLng + nx * (maxLng - minLng),
            lat: minLat + ny * (maxLat - minLat),
            z: pt.z,
            classification: toAsprsClass(pt.classification),
            intensity: pt.intensity,
            returnNum: 1,
          };
        });
        setCloud(mappedPts);
        onUpdateCloud(mappedPts);
        setStatusMsg(
          `Importada nube LAZ comprimida vía ${res.data.engine} (${res.data.point_count.toLocaleString()} puntos totales; ${mappedPts.length.toLocaleString()} renderizados en visor 3D).`
        );
      } else {
        throw new Error(
          `Formato ".${ext}" no soportado. Use .las, .laz (vía Worker PDAL), .xyz o .csv.`
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error importando nube LiDAR.');
    }
    e.target.value = '';
  };

  const handleExtractContours = () => {
    const sourceDem = products?.dtmGrid || dem;
    const fc = extractContourLinesGeoJson(sourceDem, contourIntervalM);
    onPublishVectorLayer(
      {
        id: `lyr-contours-${Date.now()}`,
        name: `Curvas de Nivel LiDAR (${contourIntervalM} m)`,
        category: 'geoproceso',
        kind: 'vector',
        visible: true,
        opacity: 0.9,
        crs: 'EPSG:4326',
        source: 'Extracción Marching Squares sobre DTM LiDAR',
        capturedDate: new Date().toISOString().split('T')[0],
        metadata: { provenance: 'modelo_analitico' },
        symbology: { color: '#b45309', weight: 1.6 },
        geojson: fc,
      },
      `Extraídas ${fc.features.length} curvas de nivel cada ${contourIntervalM} m hacia el Visor 2D.`
    );
    setStatusMsg(`Publicadas ${fc.features.length} curvas de nivel en el Visor 2D.`);
  };

  const handleComputeDiffScenario = () => {
    if (!cloud.length) return;
    // Simulate a realistic excavation/earthwork comparison against initial baseline
    const res = computeLidarSurveyDiff(
      initialCloud || cloud,
      cloud,
      dem.bounds,
      defaultCrs,
      dem.cellSizeMeters,
      24,
      24
    );
    onPublishRaster(
      res.diffGrid,
      `Diferencia LiDAR T2-T1: ΔZ medio ${res.meanDeltaM} m (Corte ${res.cutVolM3} m³ / Relleno ${res.fillVolM3} m³).`,
      'Diferencia LiDAR T1 vs T2'
    );
    setStatusMsg(`Publicado ráster ΔZ T2−T1 (media ${res.meanDeltaM} m).`);
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRunClassificationPipeline}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Clasificar Suelo / Vegetación / Edificios (ASPRS)</span>
          </button>

          {products && (
            <>
              <button
                type="button"
                onClick={() => onPublishRaster(products.dtmGrid, 'DTM LiDAR Clase 2 publicado.', 'DTM LiDAR')}
                className="px-2.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Publicar DTM
              </button>
              <button
                type="button"
                onClick={() => onPublishRaster(products.ndsmGrid, 'Altura Normalizada nDSM publicada.', 'nDSM LiDAR')}
                className="px-2.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Publicar nDSM
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as 'classification' | 'elevation')}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-medium"
          >
            <option value="classification">Color: Clases ASPRS</option>
            <option value="elevation">Color: Elevación Z</option>
          </select>

          {canEdit && (
            <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Importar .LAS/.LAZ/.XYZ</span>
              <input type="file" accept=".las,.laz,.xyz,.csv,.txt" onChange={handleImportPointCloud} className="hidden" />
            </label>
          )}

          <button
            type="button"
            onClick={handleExportLas}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar .LAS</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
          {errorMsg}
        </div>
      )}

      {/* 3D Point Cloud + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-200">
            <span className="font-bold flex items-center gap-1.5 text-emerald-400">
              <ScanLine className="w-4 h-4" />
              Visor 3D Nube de Puntos LiDAR ({cloud.length.toLocaleString()} puntos)
            </span>
            <span className="text-[11px] font-mono text-slate-400">THREE.Points · Arrastrar para orbitar</span>
          </div>
          <div ref={mountRef} className="w-full h-[380px]" data-testid="lidar-3d-canvas" />
          <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 flex flex-wrap gap-3 text-[10px] text-slate-300">
            {Object.entries(CLASS_COLORS).map(([cls, info]) => (
              <span key={cls} className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: info.hex }} />
                <span>{info.label}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          {products && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Métricas Estructurales &amp; Clasificación ASPRS
              </h4>
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-[10px] font-bold text-amber-800 uppercase">Terreno (Clase 2)</p>
                  <p className="text-base font-mono font-bold text-amber-900">{products.groundPct}%</p>
                </div>
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-[10px] font-bold text-emerald-800 uppercase">Vegetación (3–5)</p>
                  <p className="text-base font-mono font-bold text-emerald-900">{products.vegetationPct}%</p>
                </div>
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                  <p className="text-[10px] font-bold text-rose-800 uppercase">Edificaciones (6)</p>
                  <p className="text-base font-mono font-bold text-rose-900">{products.buildingPct}%</p>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-[10px] font-bold text-slate-600 uppercase">Altura Máx nDSM</p>
                  <p className="text-base font-mono font-bold text-slate-900">{products.maxStructureHeightM} m</p>
                </div>
              </div>
            </div>
          )}

          {/* Contour Extraction + T1 vs T2 */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Mountain className="w-3.5 h-3.5 text-amber-700" />
              <span>Curvas de Nivel (Marching Squares) &amp; Diferencia T1/T2</span>
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-600 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>Equidistancia (m):</span>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={contourIntervalM}
                  onChange={(e) => setContourIntervalM(Number(e.target.value) || 25)}
                  className="w-16 px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                />
              </label>
              <button
                type="button"
                onClick={handleExtractContours}
                className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Extraer Curvas al Mapa 2D</span>
              </button>
              <button
                type="button"
                onClick={handleComputeDiffScenario}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                ΔZ Multitemporal
              </button>
            </div>
          </div>

          {/* Swath Profile SVG */}
          {swath && swath.samples.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">Perfil Transversal Swath E–O</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {swath.samples.length} pts · {(swath.totalLengthM / 1000).toFixed(2)} km
                </span>
              </div>
              <svg viewBox="0 0 360 110" className="w-full h-28 bg-slate-950 rounded-lg">
                {(() => {
                  const minZ = Math.min(...swath.samples.map((s) => s.zM));
                  const maxZ = Math.max(...swath.samples.map((s) => s.zM));
                  const zSpan = Math.max(maxZ - minZ, 1);
                  return swath.samples.slice(0, 450).map((s, idx) => {
                    const cx = 12 + (s.distanceM / Math.max(swath.totalLengthM, 1)) * 336;
                    const cy = 96 - ((s.zM - minZ) / zSpan) * 80;
                    const col = CLASS_COLORS[s.classification]?.hex || '#94a3b8';
                    return <circle key={idx} cx={cx} cy={cy} r={1.8} fill={col} />;
                  });
                })()}
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
