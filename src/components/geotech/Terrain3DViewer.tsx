import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Box, Layers, Eye, RotateCcw, Building2, Scissors, Clock, Radio } from 'lucide-react';
import {
  BoreholeRecord,
  DemGrid,
  DigitalTwin4DFrame,
  DigitalTwinIotSensor,
  GisLayer,
} from '../../utils/geotechEngine';
import { buildDefaultTemporalFrames } from '../../utils/geotechTemplates3';
import { renderGridToDataUrl } from './GisMap2DCanvas';

interface Terrain3DViewerProps {
  dem: DemGrid;
  overlayGrid?: DemGrid | null;
  boreholes: BoreholeRecord[];
  layers?: GisLayer[];
  temporalFrames?: DigitalTwin4DFrame[];
  iotSensors?: DigitalTwinIotSensor[];
  onSelectBorehole?: (bh: BoreholeRecord) => void;
}

export const Terrain3DViewer: React.FC<Terrain3DViewerProps> = ({
  dem,
  overlayGrid,
  boreholes,
  layers = [],
  temporalFrames,
  iotSensors = [],
  onSelectBorehole,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [exaggeration, setExaggeration] = useState<number>(2.0);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [showWaterPlane, setShowWaterPlane] = useState<boolean>(true);
  const [showBuildings3D, setShowBuildings3D] = useState<boolean>(true);
  const [showSubsurface, setShowSubsurface] = useState<boolean>(false);
  const [showSlicePlane, setShowSlicePlane] = useState<boolean>(false);
  const [showIotSensors, setShowIotSensors] = useState<boolean>(true);
  const [hoveredBh, setHoveredBh] = useState<string>('');
  const [webglError, setWebglError] = useState<string>('');

  const frames = useMemo(
    () => (temporalFrames && temporalFrames.length > 0 ? temporalFrames : buildDefaultTemporalFrames()),
    [temporalFrames]
  );
  const [frameIndex, setFrameIndex] = useState<number>(0);
  const activeFrame = frames[Math.min(frameIndex, frames.length - 1)] || frames[0];

  const minZ = Math.min(...dem.values);
  const maxZ = Math.max(...dem.values);
  const relief = Math.max(maxZ - minZ, 1);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    setWebglError('');

    let renderer: THREE.WebGLRenderer;
    let isSoftwareGl = false;

    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) {
        isSoftwareGl = true;
      } else {
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      }

      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL no disponible en este navegador.');
      return;
    }

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 480;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.Fog(0x0f172a, 140, 290);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 600);
    camera.position.set(55, 48, 62);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 18;
    controls.maxDistance = 190;
    controls.target.set(0, 4, 0);

    const hemi = new THREE.HemisphereLight(0xe2e8f0, 0x334155, 0.75);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.35);
    sun.position.set(45, 75, 40);
    scene.add(sun);

    const worldSize = 80;
    const geom = new THREE.PlaneGeometry(worldSize, worldSize, dem.cols - 1, dem.rows - 1);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position;
    const heightScale = (14 * exaggeration) / relief;
    for (let r = 0; r < dem.rows; r++) {
      for (let c = 0; c < dem.cols; c++) {
        const idx = r * dem.cols + c;
        const elev = dem.values[idx];
        const y = (elev - minZ) * heightScale;
        pos.setY(idx, y);
      }
    }
    geom.computeVertexNormals();

    const texGrid = overlayGrid || dem;
    const texUrl = renderGridToDataUrl(texGrid);
    const texImg = new Image();
    const texture = new THREE.Texture(texImg);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    const terrainMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.78,
      metalness: 0.05,
      wireframe: showWireframe,
    });

    const terrainMesh = new THREE.Mesh(geom, terrainMat);
    scene.add(terrainMesh);

    const gridHelper = new THREE.GridHelper(worldSize + 10, 16, 0x334155, 0x1e293b);
    gridHelper.position.y = -0.2;
    scene.add(gridHelper);

    const [minLng, minLat, maxLng, maxLat] = dem.bounds;
    const sampleY = (lng: number, lat: number) => {
      const nx = (lng - minLng) / Math.max(maxLng - minLng, 1e-9);
      const ny = (maxLat - lat) / Math.max(maxLat - minLat, 1e-9);
      const gc = Math.max(0, Math.min(dem.cols - 1, Math.round(nx * (dem.cols - 1))));
      const gr = Math.max(0, Math.min(dem.rows - 1, Math.round(ny * (dem.rows - 1))));
      return {
        wx: (nx - 0.5) * worldSize,
        wz: (ny - 0.5) * worldSize,
        wy: (dem.values[gr * dem.cols + gc] - minZ) * heightScale,
        inBounds: nx >= -0.05 && nx <= 1.05 && ny >= -0.05 && ny <= 1.05,
      };
    };

    const disposableGeoms: THREE.BufferGeometry[] = [];
    const disposableMats: THREE.Material[] = [];

    // 4D Dynamic Phreatic Water Plane
    if (showWaterPlane) {
      const waterGeom = new THREE.PlaneGeometry(worldSize, worldSize);
      waterGeom.rotateX(-Math.PI / 2);
      const waterMat = new THREE.MeshStandardMaterial({
        color: activeFrame.waterTableShiftM > 0.5 ? 0x0ea5e9 : 0x0284c7,
        roughness: 0.25,
        metalness: 0.2,
        transparent: true,
        opacity: activeFrame.waterTableShiftM > 0.5 ? 0.56 : 0.42,
      });
      const waterMesh = new THREE.Mesh(waterGeom, waterMat);
      waterMesh.position.y = Math.max(0.5, (3.2 + activeFrame.waterTableShiftM * 1.4) * exaggeration);
      scene.add(waterMesh);
      disposableGeoms.push(waterGeom);
      disposableMats.push(waterMat);
    }

    if (showSubsurface) {
      const rockGeom = new THREE.PlaneGeometry(worldSize, worldSize, 12, 12);
      rockGeom.rotateX(-Math.PI / 2);
      const rockMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.9,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      });
      const bedrockMesh = new THREE.Mesh(rockGeom, rockMat);
      bedrockMesh.position.y = -4.5;
      scene.add(bedrockMesh);
      disposableGeoms.push(rockGeom);
      disposableMats.push(rockMat);
    }

    if (showSlicePlane) {
      const sliceGeom = new THREE.PlaneGeometry(worldSize, 26);
      const sliceMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
      });
      const sliceMesh = new THREE.Mesh(sliceGeom, sliceMat);
      sliceMesh.position.set(0, 6, 0);
      scene.add(sliceMesh);
      disposableGeoms.push(sliceGeom);
      disposableMats.push(sliceMat);
    }

    // 3D Extruded Buildings / Networks + 4D Vegetation
    if (showBuildings3D && layers.length > 0) {
      const infraGroup = new THREE.Group();
      for (const lyr of layers) {
        if (!lyr.visible || !lyr.geojson) continue;
        for (const f of lyr.geojson.features) {
          if (!f.geometry) continue;
          if (f.geometry.type === 'Polygon' && (f.properties?.height_m || f.properties?.floors || lyr.category === 'infraestructura')) {
            const ring = f.geometry.coordinates[0] || [];
            if (ring.length < 3) continue;
            const lngs = ring.map((c) => c[0]);
            const lats = ring.map((c) => c[1]);
            const cx = (Math.min(...lngs) + Math.max(...lngs)) / 2;
            const cy = (Math.min(...lats) + Math.max(...lats)) / 2;
            const p0 = sampleY(Math.min(...lngs), Math.max(...lats));
            const p1 = sampleY(Math.max(...lngs), Math.min(...lats));
            const center = sampleY(cx, cy);
            if (!center.inBounds) continue;

            const bw = Math.max(1.2, Math.abs(p1.wx - p0.wx));
            const bd = Math.max(1.2, Math.abs(p1.wz - p0.wz));
            const bhMeters = Number(f.properties?.height_m || (Number(f.properties?.floors) || 2) * 3.5);
            const bh = Math.max(1.5, Math.min(10, bhMeters * 0.22 * activeFrame.newBuildingsScale));
            const settleOffset = activeFrame.settlementMm * 0.015;
            const boxGeo = new THREE.BoxGeometry(bw, bh, bd);
            const boxMat = new THREE.MeshStandardMaterial({
              color: 0x6366f1,
              roughness: 0.45,
              metalness: 0.25,
            });
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.set(center.wx, Math.max(0, center.wy - settleOffset) + bh / 2, center.wz);
            infraGroup.add(box);
            disposableGeoms.push(boxGeo);
            disposableMats.push(boxMat);
          } else if (f.geometry.type === 'LineString' && (lyr.category === 'hidrologia' || lyr.category === 'infraestructura')) {
            const pts: THREE.Vector3[] = [];
            for (const c of f.geometry.coordinates) {
              const s = sampleY(c[0], c[1]);
              if (s.inBounds) pts.push(new THREE.Vector3(s.wx, s.wy + 0.35, s.wz));
            }
            if (pts.length >= 2) {
              const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
              const lineMat = new THREE.LineBasicMaterial({
                color: lyr.category === 'hidrologia' ? 0x38bdf8 : 0xfbbf24,
              });
              infraGroup.add(new THREE.Line(lineGeo, lineMat));
              disposableGeoms.push(lineGeo);
              disposableMats.push(lineMat);
            }
          }
        }
      }
      scene.add(infraGroup);
    }

    // 4D Riparian Vegetation Canopy Markers
    const vegScale = Math.max(0.4, activeFrame.vegetationFactor);
    const treeGeo = new THREE.ConeGeometry(0.9 * vegScale, 2.5 * vegScale, 7);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85 });
    disposableGeoms.push(treeGeo);
    disposableMats.push(treeMat);
    for (let i = 0; i < 10; i++) {
      const lx = minLng + (maxLng - minLng) * (0.15 + ((i * 37) % 70) / 100);
      const ly = minLat + (maxLat - minLat) * (0.18 + ((i * 53) % 65) / 100);
      const s = sampleY(lx, ly);
      if (s.inBounds) {
        const tree = new THREE.Mesh(treeGeo, treeMat);
        tree.position.set(s.wx, s.wy + 1.2 * vegScale, s.wz);
        scene.add(tree);
      }
    }

    // 3D IoT Sensor Beacons (4D Digital Twin)
    if (showIotSensors && iotSensors.length > 0) {
      for (const sen of iotSensors) {
        const s = sampleY(sen.lng, sen.lat);
        if (!s.inBounds) continue;
        const color = sen.status === 'critico' ? 0xf43f5e : sen.status === 'alerta' ? 0xf59e0b : 0x10b981;
        const poleGeo = new THREE.CylinderGeometry(0.18, 0.18, 3.2, 8);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.3 });
        const beaconGeo = new THREE.SphereGeometry(0.68, 12, 12);
        const beaconMat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.55,
          roughness: 0.25,
        });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(s.wx, s.wy + 1.6, s.wz);
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(s.wx, s.wy + 3.4, s.wz);
        scene.add(pole);
        scene.add(beacon);
        disposableGeoms.push(poleGeo, beaconGeo);
        disposableMats.push(poleMat, beaconMat);
      }
    }

    // 3D Composite Geotechnical Boreholes
    const bhPickTargets: THREE.Object3D[] = [];
    const bhGroup = new THREE.Group();

    boreholes.forEach((bh) => {
      const s = sampleY(bh.lng, bh.lat);
      if (!s.inBounds) return;

      const colGroup = new THREE.Group();
      colGroup.position.set(s.wx, s.wy, s.wz);

      const capGeo = new THREE.CylinderGeometry(1.1, 1.3, 1.2, 12);
      const capMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.4 });
      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.y = 1.6;
      capMesh.userData = { borehole: bh };
      colGroup.add(capMesh);
      bhPickTargets.push(capMesh);
      disposableGeoms.push(capGeo);
      disposableMats.push(capMat);

      const mastGeo = new THREE.CylinderGeometry(0.28, 0.28, 2.2, 8);
      const mastMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, metalness: 0.7 });
      const mastMesh = new THREE.Mesh(mastGeo, mastMat);
      mastMesh.position.y = 0.6;
      colGroup.add(mastMesh);
      disposableGeoms.push(mastGeo);
      disposableMats.push(mastMat);

      bh.strata.forEach((st) => {
        const thick = Math.max(0.4, (st.toM - st.fromM) * 0.45);
        const topY = -st.fromM * 0.45;
        const stGeo = new THREE.CylinderGeometry(0.75, 0.75, thick, 10);
        const stMat = new THREE.MeshStandardMaterial({
          color: st.color || '#94a3b8',
          roughness: 0.85,
          metalness: 0.05,
        });
        const stMesh = new THREE.Mesh(stGeo, stMat);
        stMesh.position.y = topY - thick / 2;
        stMesh.userData = { borehole: bh };
        colGroup.add(stMesh);
        bhPickTargets.push(stMesh);
        disposableGeoms.push(stGeo);
        disposableMats.push(stMat);
      });

      bhGroup.add(colGroup);
    });
    scene.add(bhGroup);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    texImg.onload = () => {
      texture.needsUpdate = true;
      requestRender();
    };
    texImg.src = texUrl;

    controls.addEventListener('change', requestRender);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePointerDown = (ev: PointerEvent) => {
      if (!bhPickTargets.length) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(bhPickTargets, false);
      if (hits.length > 0) {
        const bh = hits[0].object.userData?.borehole as BoreholeRecord | undefined;
        if (bh) {
          setHoveredBh(`${bh.code}: ${bh.name} (${bh.totalDepthM}m)`);
          onSelectBorehole?.(bh);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    requestRender();

    return () => {
      disposed = true;
      window.clearTimeout(frameId);
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      controls.dispose();
      geom.dispose();
      terrainMat.dispose();
      texture.dispose();
      envTex.dispose();
      gridHelper.dispose();
      disposableGeoms.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, [
    dem,
    overlayGrid,
    boreholes,
    layers,
    exaggeration,
    showWireframe,
    showWaterPlane,
    showBuildings3D,
    showSubsurface,
    showSlicePlane,
    showIotSensors,
    iotSensors,
    activeFrame,
    relief,
    minZ,
  ]);

  return (
    <div className="space-y-3">
      <div className="relative w-full h-full min-h-[480px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
        {webglError ? (
          <div className="h-[480px] flex items-center justify-center text-xs text-slate-300 p-6">
            {webglError}
          </div>
        ) : (
          <div ref={mountRef} className="w-full h-[480px]" data-testid="gis-terrain-3d" />
        )}

        {/* 3D/4D Digital Twin Controls Bar */}
        <div className="absolute top-3 left-3 right-3 z-10 bg-slate-900/95 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <Box className="w-4 h-4" />
            <span>Gemelo Digital 4D</span>
          </div>

          <label className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-400">Exag. Z:</span>
            <input
              type="range"
              min="1"
              max="5"
              step="0.5"
              value={exaggeration}
              onChange={(e) => setExaggeration(Number(e.target.value))}
              className="w-16 accent-emerald-500 cursor-pointer"
            />
            <span className="font-mono font-bold text-white">{exaggeration.toFixed(1)}×</span>
          </label>

          <button
            type="button"
            onClick={() => setShowBuildings3D((v) => !v)}
            className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
              showBuildings3D
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Building2 className="w-3 h-3 inline mr-1" />
            Edificios 3D
          </button>

          <button
            type="button"
            onClick={() => setShowIotSensors((v) => !v)}
            className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
              showIotSensors
                ? 'bg-emerald-700 border-emerald-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Radio className="w-3 h-3 inline mr-1" />
            Sensores IoT ({iotSensors.length})
          </button>

          <button
            type="button"
            onClick={() => setShowSubsurface((v) => !v)}
            className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
              showSubsurface
                ? 'bg-slate-600 border-slate-400 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Horizonte Roca
          </button>

          <button
            type="button"
            onClick={() => setShowSlicePlane((v) => !v)}
            className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
              showSlicePlane
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Scissors className="w-3 h-3 inline mr-1" />
            Corte E–O
          </button>

          <button
            type="button"
            onClick={() => setShowWireframe((v) => !v)}
            className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
              showWireframe
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Layers className="w-3 h-3 inline mr-1" />
            TIN
          </button>

          <button
            type="button"
            onClick={() => setShowWaterPlane((v) => !v)}
            className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
              showWaterPlane
                ? 'bg-sky-600 border-sky-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Eye className="w-3 h-3 inline mr-1" />
            Freático
          </button>

          <button
            type="button"
            onClick={() => {
              setExaggeration(2.0);
              setShowWireframe(false);
              setShowWaterPlane(true);
              setShowSubsurface(false);
              setShowSlicePlane(false);
              setShowBuildings3D(true);
              setShowIotSensors(true);
              setFrameIndex(0);
            }}
            title="Restablecer vista 3D/4D"
            className="p-1 text-slate-400 hover:text-white cursor-pointer ml-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Elevation Metadata & Borehole Inspector HUD */}
        <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div className="bg-slate-900/95 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] font-mono text-slate-300">
            <span>
              DEM: {minZ.toFixed(1)}–{maxZ.toFixed(1)} {dem.unit} (Δ {relief.toFixed(1)} m)
            </span>
            <span className="mx-2 text-slate-600">|</span>
            <span className="text-emerald-400">{activeFrame.label}</span>
            {hoveredBh && (
              <>
                <span className="mx-2 text-slate-600">|</span>
                <span className="text-amber-400">{hoveredBh}</span>
              </>
            )}
          </div>
          <div className="bg-slate-900/95 border border-slate-800 rounded-lg px-3 py-1.5 text-[10px] text-slate-400">
            Arrastrar: Rotar · Rueda: Zoom · Clic en Sondeos Ámbar: Inspeccionar
          </div>
        </div>
      </div>

      {/* 4D TEMPORAL TIMELINE & ACTUAL VS FUTURO DELTA */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <Clock className="w-4 h-4 text-emerald-700" />
            <span>Línea Temporal 4D (X, Y, Z, Tiempo) — Escenario Actual vs Proyectado</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {frames.map((fr, idx) => (
              <button
                key={fr.id}
                type="button"
                onClick={() => setFrameIndex(idx)}
                className={`px-3 py-1 rounded-lg font-semibold cursor-pointer ${
                  idx === frameIndex ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {fr.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] font-sans font-bold text-slate-500 uppercase block">Δ Nivel Freático</span>
            <strong className="text-sky-800">
              {activeFrame.waterTableShiftM >= 0 ? `+${activeFrame.waterTableShiftM}` : activeFrame.waterTableShiftM} m
            </strong>
          </div>
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] font-sans font-bold text-slate-500 uppercase block">Asentamiento Est.</span>
            <strong className="text-amber-800">{activeFrame.settlementMm} mm</strong>
          </div>
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] font-sans font-bold text-slate-500 uppercase block">Factor Vegetación</span>
            <strong className="text-emerald-800">{Math.round(activeFrame.vegetationFactor * 100)}%</strong>
          </div>
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] font-sans font-bold text-slate-500 uppercase block">Escala Edificios</span>
            <strong className="text-indigo-800">{activeFrame.newBuildingsScale}×</strong>
          </div>
        </div>
        <p className="text-[11px] text-slate-600">{activeFrame.notes}</p>
      </div>
    </div>
  );
};
