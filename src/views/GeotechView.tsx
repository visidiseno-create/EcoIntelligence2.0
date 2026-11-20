import React, { useEffect, useMemo, useState } from 'react';
import * as turf from '@turf/turf';
import type { Feature, Geometry, Point, Polygon } from 'geojson';
import {
  Compass,
  Plus,
  Save,
  Trash2,
  Layers,
  Eye,
  EyeOff,
  Download,
  Wrench,
  Mountain,
  HardHat,
  Sparkles,
  Table as TableIcon,
  TrendingUp,
  History,
  CheckCircle2,
  AlertTriangle,
  Satellite,
  Sliders,
  Map as MapIcon,
  Box,
  Play,
  Loader2,
  ShieldCheck,
  X,
  Grid3X3,
  ScanLine,
  Droplets,
  Server,
  Workflow,
  Database,
  BrainCircuit,
  Cpu,
  Info,
} from 'lucide-react';
import {
  SUPPORTED_CRS,
  CrsCode,
  GeotechProject,
  GisLayer,
  DemGrid,
  BoreholeRecord,
  OperationHistoryEntry,
  GeoFeatureCollection,
  VectorOpType,
  computeVectorLayerStats,
  validateGeometryTopology,
  transformFeatureCollectionCrs,
  runVectorBuffer,
  runVectorClip,
  runVectorIntersect,
  runVectorUnion,
  runVectorDifference,
  runVectorDissolve,
  runVectorCentroids,
  runVectorConvexHull,
  runVectorVoronoi,
  runVectorSpatialJoin,
  selectFeaturesByAttribute,
  selectFeaturesByLocation,
  computeIdwRasterGrid,
  computeMoransI,
  computeGetisOrdGiStar,
  computeSlopeGrid,
  computeAspectGrid,
  computeHillshadeGrid,
  computeCurvatureGrid,
  computeHydrologyD8AndTwi,
  extractElevationProfile,
  computeCutFillVolume,
  computeViewshedGrid,
  computeSpectralIndex,
  computeSpectralChange,
  evaluateSlopeStability,
  evaluateLiquefactionScreening,
  computeAhpWeights,
  computeSuitabilityGrid,
  ElevationProfilePoint,
  PlannedWorkflowStep,
  SavedGeotechWorkflow,
} from '../utils/geotechEngine';
import { api, Facility, Organization } from '../services/api';
import { useFeedback } from '../components/FeedbackContext';
import { GisMap2DCanvas } from '../components/geotech/GisMap2DCanvas';
import { Terrain3DViewer } from '../components/geotech/Terrain3DViewer';
import { SpectralLabPanel } from '../components/geotech/SpectralLabPanel';
import { MulticriteriaAhpPanel } from '../components/geotech/MulticriteriaAhpPanel';
import { CartographyExportPanel, triggerFileDownload } from '../components/geotech/CartographyExportPanel';
import { RasterLabPanel } from '../components/geotech/RasterLabPanel';
import { LidarLabPanel } from '../components/geotech/LidarLabPanel';
import { Hydrology2Panel } from '../components/geotech/Hydrology2Panel';
import { GeotechProPanel } from '../components/geotech/GeotechProPanel';
import { EnterpriseInfraPanel } from '../components/geotech/EnterpriseInfraPanel';
import { ModelBuilderPanel } from '../components/geotech/ModelBuilderPanel';
import { QualityUncertaintyPanel } from '../components/geotech/QualityUncertaintyPanel';
import { GeoCatalogStacPanel } from '../components/geotech/GeoCatalogStacPanel';
import { GeoMlLabPanel } from '../components/geotech/GeoMlLabPanel';
import { BatchEnterprisePanel } from '../components/geotech/BatchEnterprisePanel';
import { ModuleEvidencePanel } from '../components/ModuleEvidencePanel';
import { globalGeoCache4 } from '../utils/reproducibility4';
import { AiWorkflow4Response } from '../utils/enterpriseOps4';
import {
  EnvironmentalMonitoringStation,
  MonitoringAlertItem,
} from '../utils/reportingAndAtlas4';

interface GeotechViewProps {
  projects: GeotechProject[];
  facilities: Facility[];
  activeOrg: Organization | null;
  userName: string;
  userRole: string;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}

type WorkspaceSubTab =
  | 'map2d'
  | 'raster2'
  | 'lidar3d'
  | 'hydro2'
  | 'spectral'
  | 'geotech2'
  | 'ahp'
  | 'terrain3d'
  | 'modelbuilder'
  | 'quality3'
  | 'geocatalog'
  | 'geoml'
  | 'enterprise3'
  | 'cartography'
  | 'infra';
type ToolboxTab = 'vector' | 'hydro' | 'geotech' | 'ai';
type BottomDrawerTab = 'attributes' | 'profile' | 'history';

const VECTOR_OPERATIONS: Array<{ value: VectorOpType; label: string; needsLayerB: boolean }> = [
  { value: 'buffer', label: 'Buffer (Área de Influencia Geodésica)', needsLayerB: false },
  { value: 'clip', label: 'Clip (Recortar con Capa Máscara)', needsLayerB: true },
  { value: 'intersect', label: 'Intersect (Intersección de Polígonos)', needsLayerB: true },
  { value: 'union', label: 'Union (Unión Geométrica)', needsLayerB: true },
  { value: 'difference', label: 'Difference (Diferencia A - B)', needsLayerB: true },
  { value: 'dissolve', label: 'Dissolve (Disolver Polígonos)', needsLayerB: false },
  { value: 'centroid', label: 'Centroides Geométricos', needsLayerB: false },
  { value: 'convex_hull', label: 'Envolvente Convexa (Convex Hull)', needsLayerB: false },
  { value: 'voronoi', label: 'Polígonos de Thiessen / Voronoi', needsLayerB: false },
  { value: 'spatial_join', label: 'Spatial Join (Unión Espacial)', needsLayerB: true },
  { value: 'select_by_attribute', label: 'Selección por Atributos SQL', needsLayerB: false },
  { value: 'select_by_location', label: 'Selección por Ubicación Espacial', needsLayerB: true },
];

export const GeotechView: React.FC<GeotechViewProps> = ({
  projects,
  facilities,
  activeOrg,
  userName,
  userRole,
  canEdit,
  onRefresh,
}) => {
  const { showToast, confirmAction } = useFeedback();

  // Active working project copy for instant geoprocessing feedback + explicit or auto-persistence
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [workingProject, setWorkingProject] = useState<GeotechProject | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Sub-views & panels
  const [subTab, setSubTab] = useState<WorkspaceSubTab>('map2d');
  const [toolboxTab, setToolboxTab] = useState<ToolboxTab>('vector');
  const [bottomTab, setBottomTab] = useState<BottomDrawerTab>('history');

  // Map & Layer State
  const [activeCrs, setActiveCrs] = useState<CrsCode>('EPSG:32718');
  const [activeRasterId, setActiveRasterId] = useState<string>('none');
  const [generatedRasters, setGeneratedRasters] = useState<DemGrid[]>([]);
  const [rasterOpacity, setRasterOpacity] = useState<number>(0.72);
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  const [selectedFeatureInfo, setSelectedFeatureInfo] = useState<{
    layerName: string;
    props: Record<string, any>;
  } | null>(null);

  // Vector Geoprocessing Form State
  const [vectorOp, setVectorOp] = useState<VectorOpType>('buffer');
  const [layerAId, setLayerAId] = useState<string>('');
  const [layerBId, setLayerBId] = useState<string>('');
  const [bufferMeters, setBufferMeters] = useState<number>(500);
  const [dissolveBuffer, setDissolveBuffer] = useState<boolean>(false);
  const [attrField, setAttrField] = useState<string>('');
  const [attrOperator, setAttrOperator] = useState<'=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains'>('>');
  const [attrValue, setAttrValue] = useState<string>('50');
  const [locPredicate, setLocPredicate] = useState<'intersects' | 'within_distance'>('within_distance');

  // Hydrology / Spatial Stats State
  const [statsLayerId, setStatsLayerId] = useState<string>('');
  const [statsField, setStatsField] = useState<string>('');
  const [statsRadiusM, setStatsRadiusM] = useState<number>(5000);
  const [spatialStatsOutput, setSpatialStatsOutput] = useState<string>('');

  // DEM Profile & Cut/Fill State
  const [profileResult, setProfileResult] = useState<{
    points: ElevationProfilePoint[];
    minElevM: number;
    maxElevM: number;
    reliefM: number;
    totalLengthM: number;
  } | null>(null);
  const [targetGradeElev, setTargetGradeElev] = useState<number>(120);

  // Geotechnical Stability & Borehole State
  const [selectedBoreholeId, setSelectedBoreholeId] = useState<string>('');
  const [slopeMethod, setSlopeMethod] = useState<'simplified_bishop' | 'infinite_slope'>('simplified_bishop');
  const [slopeAngleDeg, setSlopeAngleDeg] = useState<number>(32);
  const [slopeHeightM, setSlopeHeightM] = useState<number>(18);
  const [failureDepthM, setFailureDepthM] = useState<number>(5);
  const [unitWeightKnM3, setUnitWeightKnM3] = useState<number>(18.8);
  const [cohesionKpa, setCohesionKpa] = useState<number>(14);
  const [frictionDeg, setFrictionDeg] = useState<number>(29);
  const [ruRatio, setRuRatio] = useState<number>(0.22);

  // Geotech AI Core State
  const [aiAgentRole, setAiAgentRole] = useState<string>('Agente SIG');
  const [aiMode, setAiMode] = useState<'deterministic' | 'gemini'>('deterministic');
  const [aiPrompt, setAiPrompt] = useState<string>(
    'Calcula pendiente topográfica, flujo D8 hidrológico TWI y mapa multicriterio AHP de sensibilidad.'
  );
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiResponseSummary, setAiResponseSummary] = useState<string>('');
  const [lastAiSteps, setLastAiSteps] = useState<PlannedWorkflowStep[]>([]);
  const [lastAiAgents, setLastAiAgents] = useState<string[]>([]);
  const [sandboxDryRun, setSandboxDryRun] = useState<boolean>(false);
  const [aiV3Explainability, setAiV3Explainability] = useState<
    Awaited<ReturnType<typeof api.runGeotechAiAgentV3>>['explainability'] | null
  >(null);
  const [showExplainModal, setShowExplainModal] = useState<boolean>(false);

  // Geotech AI 4.0 Verifiable Workflow & 7-Phase Explainability
  const [aiV4Plan, setAiV4Plan] = useState<AiWorkflow4Response | null>(null);
  const [showExplain4Modal, setShowExplain4Modal] = useState<boolean>(false);

  // Environmental Monitoring 4.0 State
  const [monitoringStations, setMonitoringStations] = useState<EnvironmentalMonitoringStation[]>([]);
  const [monitoringAlerts, setMonitoringAlerts] = useState<MonitoringAlertItem[]>([]);
  const [monStationId, setMonStationId] = useState<string>('');
  const [monValue, setMonValue] = useState<string>('112');
  const [monCampaign, setMonCampaign] = useState<string>('Campaña Q4-Verificación');
  const [monSubmitting, setMonSubmitting] = useState<boolean>(false);

  // Attribute Table Search
  const [attrSearch, setAttrSearch] = useState<string>('');

  // New Project Modal
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [newProjName, setNewProjName] = useState<string>('');
  const [newProjDomain, setNewProjDomain] = useState<GeotechProject['domain']>('ambiental');
  const [newProjAreaHa, setNewProjAreaHa] = useState<number>(1200);
  const [newProjCrs, setNewProjCrs] = useState<CrsCode>('EPSG:32718');
  const [newProjDesc, setNewProjDesc] = useState<string>('');
  const [creatingProj, setCreatingProj] = useState<boolean>(false);

  // Sync incoming projects (org switch or initial load)
  useEffect(() => {
    if (!projects.length) {
      setWorkingProject(null);
      setSelectedProjectId('');
      return;
    }
    const existingMatch = projects.find((p) => p.id === selectedProjectId);
    const target = existingMatch || projects[0];
    setSelectedProjectId(target.id);
    setWorkingProject(structuredClone(target));
    setIsDirty(false);
    setActiveCrs(target.defaultCrs || 'EPSG:32718');
    setGeneratedRasters([]);
    setActiveRasterId('dem');
    setSpatialStatsOutput('');
    setProfileResult(null);

    const meanDemElev = target.dem.values.reduce((s, v) => s + v, 0) / Math.max(target.dem.values.length, 1);
    setTargetGradeElev(Math.round(meanDemElev * 10) / 10);

    const firstVec = target.layers.find((l) => l.kind === 'vector' && l.geojson);
    const secondVec = target.layers.find((l) => l.kind === 'vector' && l.geojson && l.id !== firstVec?.id);
    const ptVec = target.layers.find(
      (l) => l.kind === 'vector' && l.geojson?.features.some((f) => f.geometry?.type === 'Point')
    );

    setSelectedLayerId(firstVec?.id || target.layers[0]?.id || '');
    setLayerAId(firstVec?.id || '');
    setLayerBId(secondVec?.id || firstVec?.id || '');
    setStatsLayerId(ptVec?.id || firstVec?.id || '');
    setSelectedBoreholeId(target.boreholes[0]?.id || '');
  }, [projects, activeOrg?.id]);

  // Load Environmental Monitoring 4.0 stations when viewing active project or 3D Twin
  useEffect(() => {
    if (!workingProject?.id) return;
    let cancelled = false;
    api
      .getGeotechMonitoring(workingProject.id)
      .then((res) => {
        if (cancelled) return;
        setMonitoringStations(res.stations || []);
        setMonitoringAlerts(res.alerts || []);
        if (res.stations?.length && !res.stations.some((s) => s.id === monStationId)) {
          setMonStationId(res.stations[0].id);
        }
      })
      .catch(() => {
        // silent fallback if offline/switching
      });
    return () => {
      cancelled = true;
    };
  }, [workingProject?.id, subTab]);

  // Switch active project manually
  const handleSelectProject = (id: string) => {
    const found = projects.find((p) => p.id === id);
    if (!found) return;
    setSelectedProjectId(found.id);
    setWorkingProject(structuredClone(found));
    setIsDirty(false);
    setActiveCrs(found.defaultCrs || 'EPSG:32718');
    setGeneratedRasters([]);
    setActiveRasterId('dem');
    setSpatialStatsOutput('');
    setProfileResult(null);
    setSelectedFeatureInfo(null);

    const meanDemElev = found.dem.values.reduce((s, v) => s + v, 0) / Math.max(found.dem.values.length, 1);
    setTargetGradeElev(Math.round(meanDemElev * 10) / 10);

    const firstVec = found.layers.find((l) => l.kind === 'vector' && l.geojson);
    const secondVec = found.layers.find((l) => l.kind === 'vector' && l.geojson && l.id !== firstVec?.id);
    const ptVec = found.layers.find(
      (l) => l.kind === 'vector' && l.geojson?.features.some((f) => f.geometry?.type === 'Point')
    );
    setSelectedLayerId(firstVec?.id || found.layers[0]?.id || '');
    setLayerAId(firstVec?.id || '');
    setLayerBId(secondVec?.id || firstVec?.id || '');
    setStatsLayerId(ptVec?.id || firstVec?.id || '');
    setSelectedBoreholeId(found.boreholes[0]?.id || '');
  };

  const vectorLayers = useMemo(
    () => (workingProject?.layers || []).filter((l) => l.kind === 'vector' && l.geojson),
    [workingProject?.layers]
  );

  const selectedLayer = useMemo(
    () => (workingProject?.layers || []).find((l) => l.id === selectedLayerId) || null,
    [workingProject?.layers, selectedLayerId]
  );

  // Extract numeric/all property fields for Attribute selection & IDW/Moran's I
  const layerAFields = useMemo(() => {
    const lyr = vectorLayers.find((l) => l.id === layerAId);
    const props = lyr?.geojson?.features[0]?.properties || {};
    return Object.keys(props);
  }, [vectorLayers, layerAId]);

  useEffect(() => {
    if (layerAFields.length && !layerAFields.includes(attrField)) {
      setAttrField(layerAFields[0]);
    }
  }, [layerAFields, attrField]);

  const statsNumericFields = useMemo(() => {
    const lyr = vectorLayers.find((l) => l.id === statsLayerId);
    const props = lyr?.geojson?.features[0]?.properties || {};
    return Object.entries(props)
      .filter(([, v]) => typeof v === 'number' || (!Number.isNaN(Number(v)) && String(v).trim() !== ''))
      .map(([k]) => k);
  }, [vectorLayers, statsLayerId]);

  useEffect(() => {
    if (statsNumericFields.length && !statsNumericFields.includes(statsField)) {
      setStatsField(statsNumericFields[0]);
    }
  }, [statsNumericFields, statsField]);

  const activeRaster: DemGrid | null = useMemo(() => {
    if (!workingProject || activeRasterId === 'none') return null;
    if (activeRasterId === 'dem') return workingProject.dem;
    return generatedRasters.find((r) => r.id === activeRasterId) || null;
  }, [workingProject, activeRasterId, generatedRasters]);

  const activeBorehole: BoreholeRecord | null = useMemo(() => {
    if (!workingProject?.boreholes.length) return null;
    return (
      workingProject.boreholes.find((b) => b.id === selectedBoreholeId) || workingProject.boreholes[0]
    );
  }, [workingProject?.boreholes, selectedBoreholeId]);

  const slopeResult = useMemo(
    () =>
      evaluateSlopeStability({
        method: slopeMethod,
        slopeAngleDeg,
        slopeHeightM,
        failureDepthM,
        unitWeightKnM3,
        cohesionKpa,
        frictionDeg,
        porePressureRatioRu: ruRatio,
      }),
    [slopeMethod, slopeAngleDeg, slopeHeightM, failureDepthM, unitWeightKnM3, cohesionKpa, frictionDeg, ruRatio]
  );

  const liquefactionSummary = useMemo(() => {
    if (!activeBorehole) return null;
    const saturatedStratum =
      activeBorehole.strata.find((s) => s.toM > activeBorehole.waterTableDepthM) || activeBorehole.strata[0];
    if (!saturatedStratum) return null;
    const midDepth = Math.max(
      activeBorehole.waterTableDepthM + 0.8,
      (saturatedStratum.fromM + saturatedStratum.toM) / 2
    );
    return {
      stratum: saturatedStratum,
      midDepth: Math.round(midDepth * 10) / 10,
      result: evaluateLiquefactionScreening(
        saturatedStratum.sptN60,
        midDepth,
        activeBorehole.waterTableDepthM,
        activeBorehole.pgaG || 0.35,
        saturatedStratum.unitWeightKnM3
      ),
    };
  }, [activeBorehole]);

  const cutFillStats = useMemo(() => {
    if (!workingProject) return null;
    return computeCutFillVolume(workingProject.dem, targetGradeElev);
  }, [workingProject?.dem, targetGradeElev]);

  const appendHistory = (
    proj: GeotechProject,
    entry: Omit<OperationHistoryEntry, 'id' | 'timestamp'>
  ): GeotechProject => {
    const newEntry: OperationHistoryEntry = {
      ...entry,
      id: `op-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    return {
      ...proj,
      operationHistory: [newEntry, ...proj.operationHistory],
    };
  };

  const persistProjectUpdate = async (proj: GeotechProject, silent: boolean = false) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const updated = await api.updateGeotechProject(proj.id, {
        name: proj.name,
        defaultCrs: proj.defaultCrs,
        layers: proj.layers,
        dem: proj.dem,
        boreholes: proj.boreholes,
        operationHistory: proj.operationHistory,
        lidarCloud: proj.lidarCloud,
        savedWorkflows: proj.savedWorkflows,
        modelGraphs: proj.modelGraphs,
        trainedMlModels: proj.trainedMlModels,
      });
      setWorkingProject(updated);
      setIsDirty(false);
      globalGeoCache4.invalidateProject(proj.id);
      await onRefresh();
      if (!silent) showToast(`Proyecto "${proj.name}" guardado en servidor.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'No se pudo guardar el proyecto SIG.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Create New Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjName.trim().length < 3) {
      showToast('El nombre del proyecto debe tener al menos 3 caracteres.', 'warning');
      return;
    }
    setCreatingProj(true);
    try {
      const created = await api.createGeotechProject({
        name: newProjName.trim(),
        domain: newProjDomain,
        areaHa: Number(newProjAreaHa) || 1000,
        defaultCrs: newProjCrs,
        description: newProjDesc.trim() || undefined,
      });
      setShowNewModal(false);
      setNewProjName('');
      setNewProjDesc('');
      setSelectedProjectId(created.id);
      await onRefresh();
      showToast(`Proyecto SIG "${created.name}" creado correctamente.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al crear proyecto SIG.', 'error');
    } finally {
      setCreatingProj(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!workingProject || !canEdit) return;
    const confirmed = await confirmAction({
      title: 'Eliminar proyecto SIG',
      message: `¿Está seguro de eliminar el proyecto "${workingProject.name}" (${workingProject.code})? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar Proyecto',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.deleteGeotechProject(workingProject.id);
      setSelectedProjectId('');
      await onRefresh();
      showToast('Proyecto SIG eliminado.', 'info');
    } catch (err: any) {
      showToast(err.message || 'No se pudo eliminar el proyecto.', 'error');
    }
  };

  // Layer Controls
  const toggleLayerVisibility = (id: string) => {
    if (!workingProject) return;
    setWorkingProject({
      ...workingProject,
      layers: workingProject.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    });
  };

  const updateLayerColor = (id: string, color: string) => {
    if (!workingProject) return;
    setWorkingProject({
      ...workingProject,
      layers: workingProject.layers.map((l) =>
        l.id === id ? { ...l, symbology: { ...l.symbology, color, fillColor: color } } : l
      ),
    });
    setIsDirty(true);
  };

  const removeLayer = (id: string) => {
    if (!workingProject || !canEdit) return;
    setWorkingProject({
      ...workingProject,
      layers: workingProject.layers.filter((l) => l.id !== id),
    });
    setIsDirty(true);
    showToast('Capa removida del proyecto (guarde para confirmar cambios).', 'info');
  };

  // Vector Geoprocessing Execution
  const handleRunVectorOp = () => {
    if (!workingProject || !canEdit) return;
    const lyrA = vectorLayers.find((l) => l.id === layerAId);
    const lyrB = vectorLayers.find((l) => l.id === layerBId);
    if (!lyrA?.geojson) {
      showToast('Seleccione una capa vectorial de entrada válida.', 'warning');
      return;
    }

    const opMeta = VECTOR_OPERATIONS.find((o) => o.value === vectorOp);
    if (opMeta?.needsLayerB && !lyrB?.geojson) {
      showToast('Esta operación requiere seleccionar una segunda capa vectorial (Capa B).', 'warning');
      return;
    }

    const t0 = performance.now();
    try {
      let outFc: GeoFeatureCollection;
      let outName = '';
      let summary = '';

      switch (vectorOp) {
        case 'buffer':
          outFc = runVectorBuffer(lyrA.geojson, Number(bufferMeters) || 500, dissolveBuffer);
          outName = `Buffer ${bufferMeters}m — ${lyrA.name}`;
          summary = `Buffer geodésico de ${bufferMeters} m (${dissolveBuffer ? 'disuelto' : 'individual'}) generó ${outFc.features.length} entidades.`;
          break;
        case 'clip':
          outFc = runVectorClip(lyrA.geojson, lyrB!.geojson!);
          outName = `Clip — ${lyrA.name} ∩ ${lyrB!.name}`;
          summary = `Recorte espacial conservó ${outFc.features.length} entidades dentro de la máscara.`;
          break;
        case 'intersect':
          outFc = runVectorIntersect(lyrA.geojson, lyrB!.geojson!);
          outName = `Intersección — ${lyrA.name} ∩ ${lyrB!.name}`;
          summary = `Intersección geométrica produjo ${outFc.features.length} polígonos resultantes.`;
          break;
        case 'union':
          outFc = runVectorUnion(lyrA.geojson, lyrB!.geojson!);
          outName = `Unión — ${lyrA.name} ∪ ${lyrB!.name}`;
          summary = `Unión de polígonos completada (${outFc.features[0]?.properties?.area_ha || 0} ha totales).`;
          break;
        case 'difference':
          outFc = runVectorDifference(lyrA.geojson, lyrB!.geojson!);
          outName = `Diferencia — ${lyrA.name} \\ ${lyrB!.name}`;
          summary = `Diferencia espacial generó ${outFc.features.length} geometrías remanentes.`;
          break;
        case 'dissolve':
          outFc = runVectorDissolve(lyrA.geojson);
          outName = `Dissolve — ${lyrA.name}`;
          summary = `Disolución agrupó las entidades en ${outFc.features.length} polígono(s).`;
          break;
        case 'centroid':
          outFc = runVectorCentroids(lyrA.geojson);
          outName = `Centroides — ${lyrA.name}`;
          summary = `Calculados ${outFc.features.length} centroides geométricos.`;
          break;
        case 'convex_hull':
          outFc = runVectorConvexHull(lyrA.geojson);
          outName = `Convex Hull — ${lyrA.name}`;
          summary = `Envolvente convexa generada (${outFc.features[0]?.properties?.area_ha || 0} ha).`;
          break;
        case 'voronoi':
          outFc = runVectorVoronoi(lyrA.geojson);
          outName = `Thiessen / Voronoi — ${lyrA.name}`;
          summary = `Teselación Voronoi generada con ${outFc.features.length} áreas de influencia.`;
          break;
        case 'spatial_join':
          outFc = runVectorSpatialJoin(lyrA.geojson, lyrB!.geojson!);
          outName = `Spatial Join — ${lyrA.name}`;
          summary = `Unión espacial enriqueció ${outFc.features.length} entidades con atributos de ${lyrB!.name}.`;
          break;
        case 'select_by_attribute':
          outFc = selectFeaturesByAttribute(lyrA.geojson, attrField, attrOperator, attrValue);
          outName = `Filtro (${attrField} ${attrOperator} ${attrValue}) — ${lyrA.name}`;
          summary = `Consulta por atributos seleccionó ${outFc.features.length} de ${lyrA.geojson.features.length} entidades.`;
          break;
        case 'select_by_location':
          outFc = selectFeaturesByLocation(lyrA.geojson, lyrB!.geojson!, locPredicate, bufferMeters);
          outName = `Selección Espacial — ${lyrA.name}`;
          summary = `Consulta espacial (${locPredicate}) seleccionó ${outFc.features.length} entidades.`;
          break;
        default:
          return;
      }

      if (outFc.features.length === 0) {
        showToast('El geoproceso terminó sin entidades intersectadas o coincidentes.', 'warning');
        return;
      }

      const newLayer: GisLayer = {
        id: `lyr-gp-${Date.now()}`,
        name: outName,
        category: 'geoproceso',
        kind: 'vector',
        visible: true,
        opacity: 0.9,
        crs: 'EPSG:4326',
        source: `Geoproceso ${opMeta?.label || vectorOp}`,
        capturedDate: new Date().toISOString().split('T')[0],
        metadata: { provenance: 'modelo_analitico' },
        symbology: {
          color: '#7c3aed',
          fillColor: '#8b5cf6',
          fillOpacity: 0.35,
          weight: 2,
          radius: 6,
        },
        geojson: outFc,
      };

      const dur = Math.round((performance.now() - t0) * 10) / 10;
      const updatedProj = appendHistory(
        { ...workingProject, layers: [...workingProject.layers, newLayer] },
        {
          tool: opMeta?.label || vectorOp,
          module: 'Geoprocesamiento Vectorial',
          agent: userName,
          parameters: { vectorOp, bufferMeters, attrField, attrOperator, attrValue },
          inputLayers: lyrB && opMeta?.needsLayerB ? [lyrA.name, lyrB.name] : [lyrA.name],
          outputLayer: outName,
          durationMs: dur,
          status: 'completado',
          summary,
        }
      );

      setWorkingProject(updatedProj);
      globalGeoCache4.invalidateProject(workingProject.id);
      setSelectedLayerId(newLayer.id);
      setIsDirty(true);
      showToast(summary, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error ejecutando geoproceso vectorial.', 'error');
    }
  };

  // Topology Check + CRS Transform
  const handleValidateTopology = () => {
    const lyr = vectorLayers.find((l) => l.id === layerAId);
    if (!lyr?.geojson || !workingProject) return;
    const t0 = performance.now();
    const report = validateGeometryTopology(lyr.geojson);
    const reprojectedSample = transformFeatureCollectionCrs(lyr.geojson, 'EPSG:4326', activeCrs);
    const sampleCoord = turf.coordAll(reprojectedSample as any)[0];
    const msg = report.valid
      ? `Topología 100% válida (${report.featureCount} entidades). Coordenada muestra en ${activeCrs}: [${sampleCoord?.[0] ?? '-'}, ${sampleCoord?.[1] ?? '-'}].`
      : `Detectados ${report.invalidCount} problemas topológicos en ${report.featureCount} entidades.`;

    setWorkingProject(
      appendHistory(workingProject, {
        tool: 'Validación Topológica & Proyección CRS',
        module: 'Control Geométrico',
        agent: userName,
        parameters: { targetCrs: activeCrs },
        inputLayers: [lyr.name],
        durationMs: Math.round((performance.now() - t0) * 10) / 10,
        status: report.valid ? 'completado' : 'error',
        summary: msg,
      })
    );
    showToast(msg, report.valid ? 'success' : 'warning');
  };

  // Publish Raster helper
  const publishComputedRaster = (grid: DemGrid, tool: string, module: string, summary: string, durationMs: number) => {
    if (!workingProject) return;
    globalGeoCache4.invalidateProject(workingProject.id);
    setGeneratedRasters((prev) => [grid, ...prev.filter((r) => r.id !== grid.id)]);
    setActiveRasterId(grid.id);
    setWorkingProject((prev) =>
      prev
        ? appendHistory(prev, {
            tool,
            module,
            agent: userName,
            parameters: { cols: grid.cols, rows: grid.rows, cellSizeM: grid.cellSizeMeters },
            inputLayers: [prev.dem.name],
            outputLayer: grid.name,
            durationMs,
            status: 'completado',
            summary,
          })
        : prev
    );
    setIsDirty(true);
  };

  // Publish Vector Layer helper (used by LiDAR 3D & Hydrology 2.0)
  const publishComputedVectorLayer = (layer: GisLayer, summary: string, moduleName: string) => {
    if (!workingProject) return;
    globalGeoCache4.invalidateProject(workingProject.id);
    setWorkingProject((prev) =>
      prev
        ? appendHistory(
            { ...prev, layers: [...prev.layers, layer] },
            {
              tool: layer.name,
              module: moduleName,
              agent: userName,
              parameters: { category: layer.category, crs: layer.crs },
              inputLayers: [prev.dem.name],
              outputLayer: layer.name,
              durationMs: 10,
              status: 'completado',
              summary,
            }
          )
        : prev
    );
    setSelectedLayerId(layer.id);
    setIsDirty(true);
  };

  // Terrain & Hydrology Actions
  const handleRunTerrainTool = (kind: 'slope' | 'aspect' | 'hillshade' | 'curvature' | 'twi' | 'viewshed') => {
    if (!workingProject) return;
    const t0 = performance.now();
    if (kind === 'slope') {
      const res = computeSlopeGrid(workingProject.dem);
      const summary = `Pendiente Horn 3×3: mín ${res.minDeg}°, media ${res.meanDeg}°, máx ${res.maxDeg}° (${res.steepPct}% > 25°).`;
      setSpatialStatsOutput(summary);
      publishComputedRaster(res.grid, 'Pendiente Topográfica (Slope)', 'Morfometría DEM', summary, Math.round(performance.now() - t0));
      showToast(summary, 'success');
    } else if (kind === 'aspect') {
      const grid = computeAspectGrid(workingProject.dem);
      const summary = 'Mapa de orientación de laderas (azimut 0–360°) generado sobre DEM.';
      setSpatialStatsOutput(summary);
      publishComputedRaster(grid, 'Orientación (Aspect)', 'Morfometría DEM', summary, Math.round(performance.now() - t0));
      showToast(summary, 'success');
    } else if (kind === 'hillshade') {
      const grid = computeHillshadeGrid(workingProject.dem, 315, 45);
      const summary = 'Relieve sombreado (Azimut 315°, Altitud 45°) generado correctamente.';
      setSpatialStatsOutput(summary);
      publishComputedRaster(grid, 'Sombreado Analítico (Hillshade)', 'Morfometría DEM', summary, Math.round(performance.now() - t0));
      showToast(summary, 'success');
    } else if (kind === 'curvature') {
      const grid = computeCurvatureGrid(workingProject.dem);
      const summary = 'Curvatura laplaciana del terreno calculada (cóncavo < 0 / convexo > 0).';
      setSpatialStatsOutput(summary);
      publishComputedRaster(grid, 'Curvatura Topográfica', 'Morfometría DEM', summary, Math.round(performance.now() - t0));
      showToast(summary, 'success');
    } else if (kind === 'twi') {
      const hydro = computeHydrologyD8AndTwi(workingProject.dem);
      const summary = `Flujo D8 & TWI: acumulación máx ${hydro.maxFlowAccumulation} celdas, TWI medio ${hydro.meanTwi}, área susceptible a anegamiento ${hydro.floodPronePct}%.`;
      setSpatialStatsOutput(summary);
      publishComputedRaster(hydro.twiGrid, 'Hidrología D8 & TWI Inundación', 'Hidrología Computacional', summary, Math.round(performance.now() - t0));
      showToast(summary, 'success');
    } else if (kind === 'viewshed') {
      const vs = computeViewshedGrid(
        workingProject.dem,
        Math.floor(workingProject.dem.cols / 2),
        Math.floor(workingProject.dem.rows / 2),
        12,
        18
      );
      const summary = `Cuenca visual desde observador central (h=12m): ${vs.visiblePct}% del área visible sin obstrucción topográfica.`;
      setSpatialStatsOutput(summary);
      publishComputedRaster(vs.grid, 'Cuenca Visual (Viewshed)', 'Análisis Territorial', summary, Math.round(performance.now() - t0));
      showToast(summary, 'success');
    }
  };

  // Spatial Statistics (IDW, Moran's I, Gi*)
  const handleRunSpatialStat = (statKind: 'idw' | 'moran' | 'gi_star') => {
    if (!workingProject) return;
    const lyr = vectorLayers.find((l) => l.id === statsLayerId);
    if (!lyr?.geojson || !statsField) {
      showToast('Seleccione una capa de puntos y un campo numérico para análisis espacial.', 'warning');
      return;
    }
    const t0 = performance.now();
    try {
      if (statKind === 'idw') {
        const grid = computeIdwRasterGrid(lyr.geojson, statsField, workingProject.dem.bounds, 32, 32, 2);
        const summary = `Interpolación IDW (${statsField}): superficie continua 32×32 generada sobre ${lyr.name}.`;
        setSpatialStatsOutput(summary);
        publishComputedRaster(grid, `Interpolación IDW (${statsField})`, 'Estadística Espacial', summary, Math.round(performance.now() - t0));
        showToast(summary, 'success');
      } else if (statKind === 'moran') {
        const res = computeMoransI(lyr.geojson, statsField, statsRadiusM);
        const summary = `Moran's I (${statsField}): I = ${res.moransI}, Z = ${res.zScore} → Patrón ${res.pattern} (n=${res.n}).`;
        setSpatialStatsOutput(summary);
        setWorkingProject(
          appendHistory(workingProject, {
            tool: "Autocorrelación Espacial Moran's I",
            module: 'Estadística Espacial',
            agent: userName,
            parameters: { field: statsField, radiusM: statsRadiusM },
            inputLayers: [lyr.name],
            durationMs: Math.round(performance.now() - t0),
            status: 'completado',
            summary,
          })
        );
        showToast(summary, 'success');
      } else if (statKind === 'gi_star') {
        const giFc = computeGetisOrdGiStar(lyr.geojson, statsField, statsRadiusM);
        const hotspotCount = giFc.features.filter((f) => String(f.properties?.gi_class || '').includes('Hotspot')).length;
        const summary = `Getis-Ord Gi* (${statsField}): detectados ${hotspotCount} puntos Hotspot estadísticamente significativos (95%/99%).`;
        setSpatialStatsOutput(summary);
        const giLayer: GisLayer = {
          id: `lyr-gi-${Date.now()}`,
          name: `Hotspots Gi* (${statsField}) — ${lyr.name}`,
          category: 'ambiental',
          kind: 'vector',
          visible: true,
          opacity: 1,
          crs: 'EPSG:4326',
          source: 'Getis-Ord Gi* Local Spatial Statistics',
          capturedDate: new Date().toISOString().split('T')[0],
          metadata: { provenance: 'modelo_analitico' },
          symbology: { color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.9, radius: 8, labelField: 'gi_class' },
          geojson: giFc,
        };
        setWorkingProject(
          appendHistory(
            { ...workingProject, layers: [...workingProject.layers, giLayer] },
            {
              tool: 'Hotspots Getis-Ord Gi*',
              module: 'Estadística Espacial',
              agent: userName,
              parameters: { field: statsField, radiusM: statsRadiusM },
              inputLayers: [lyr.name],
              outputLayer: giLayer.name,
              durationMs: Math.round(performance.now() - t0),
              status: 'completado',
              summary,
            }
          )
        );
        setSelectedLayerId(giLayer.id);
        setIsDirty(true);
        showToast(summary, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Error en análisis estadístico espacial.', 'error');
    }
  };

  // Map Sketch callbacks
  const handleProfileLineComplete = (coords: Array<[number, number]>) => {
    if (!workingProject) return;
    try {
      const prof = extractElevationProfile(workingProject.dem, coords, 36);
      setProfileResult(prof);
      setBottomTab('profile');
      setWorkingProject((prev) =>
        prev
          ? appendHistory(prev, {
              tool: 'Perfil Topográfico DEM',
              module: 'Topografía',
              agent: userName,
              parameters: { vertices: coords.length, lengthM: prof.totalLengthM },
              inputLayers: [prev.dem.name],
              durationMs: 6,
              status: 'completado',
              summary: `Perfil ${prof.totalLengthM} m: Cota ${prof.minElevM}–${prof.maxElevM} msnm (desnivel Δ ${prof.reliefM} m).`,
            })
          : prev
      );
      showToast(`Perfil DEM extraído (${prof.totalLengthM} m, desnivel ${prof.reliefM} m).`, 'success');
    } catch (err: any) {
      showToast(err.message || 'No se pudo generar el perfil DEM.', 'error');
    }
  };

  const handleDigitizeFeature = (geometry: Point | Polygon) => {
    if (!workingProject || !canEdit) return;
    const areaHa =
      geometry.type === 'Polygon' ? Math.round((turf.area(turf.feature(geometry)) / 10000) * 100) / 100 : 0;
    const newFeature: Feature<Geometry, Record<string, any>> = {
      type: 'Feature',
      properties: {
        name: geometry.type === 'Point' ? 'Punto Digitalizado' : 'Polígono Digitalizado',
        area_ha: areaHa,
        created_by: userName,
        fecha: new Date().toISOString().split('T')[0],
      },
      geometry,
    };

    const existingIdx = workingProject.layers.findIndex((l) => l.name === 'Elementos Digitalizados');
    let nextLayers: GisLayer[];
    if (existingIdx >= 0 && workingProject.layers[existingIdx].geojson) {
      nextLayers = workingProject.layers.map((l, idx) =>
        idx === existingIdx
          ? {
              ...l,
              visible: true,
              geojson: {
                type: 'FeatureCollection',
                features: [...l.geojson!.features, newFeature],
              },
            }
          : l
      );
    } else {
      nextLayers = [
        ...workingProject.layers,
        {
          id: `lyr-dig-${Date.now()}`,
          name: 'Elementos Digitalizados',
          category: 'infraestructura',
          kind: 'vector',
          visible: true,
          opacity: 1,
          crs: 'EPSG:4326',
          source: 'Digitalización Interactiva SIG',
          capturedDate: new Date().toISOString().split('T')[0],
          metadata: { provenance: 'observado' },
          symbology: { color: '#059669', fillColor: '#10b981', fillOpacity: 0.4, radius: 7, labelField: 'name' },
          geojson: { type: 'FeatureCollection', features: [newFeature] },
        },
      ];
    }

    setWorkingProject(
      appendHistory(
        { ...workingProject, layers: nextLayers },
        {
          tool: `Digitalización ${geometry.type}`,
          module: 'Edición Vectorial',
          agent: userName,
          parameters: { geometryType: geometry.type, areaHa },
          inputLayers: [],
          outputLayer: 'Elementos Digitalizados',
          durationMs: 2,
          status: 'completado',
          summary: `Elemento ${geometry.type} añadido a "Elementos Digitalizados".`,
        }
      )
    );
    setIsDirty(true);
    showToast(`Geometría ${geometry.type} agregada al mapa.`, 'success');
  };

  // Execute planned workflow steps (shared between Geotech AI 2.0 and Saved Workflows)
  const executePlannedSteps = (
    steps: PlannedWorkflowStep[],
    engineName: string,
    summaryText: string,
    moduleLabel: string = 'Geotech AI Pipeline 2.0'
  ) => {
    if (!workingProject) return;
    let currentProj = workingProject;
    const newRasters: DemGrid[] = [];
    const executedNotes: string[] = [];

    for (const step of steps) {
      const t0 = performance.now();
      if (step.tool === 'slope') {
        const r = computeSlopeGrid(currentProj.dem);
        newRasters.push(r.grid);
        const msg = `Pendiente media ${r.meanDeg}° (máx ${r.maxDeg}°).`;
        executedNotes.push(`${step.agent}: ${msg}`);
        currentProj = appendHistory(currentProj, {
          tool: step.label,
          module: moduleLabel,
          agent: step.agent,
          parameters: step.params,
          inputLayers: [currentProj.dem.name],
          outputLayer: r.grid.name,
          durationMs: Math.round(performance.now() - t0),
          status: 'completado',
          summary: msg,
        });
      } else if (step.tool === 'twi_hydrology') {
        const h = computeHydrologyD8AndTwi(currentProj.dem);
        newRasters.push(h.twiGrid);
        const msg = `TWI medio ${h.meanTwi}, anegamiento potencial ${h.floodPronePct}%.`;
        executedNotes.push(`${step.agent}: ${msg}`);
        currentProj = appendHistory(currentProj, {
          tool: step.label,
          module: moduleLabel,
          agent: step.agent,
          parameters: step.params,
          inputLayers: [currentProj.dem.name],
          outputLayer: h.twiGrid.name,
          durationMs: Math.round(performance.now() - t0),
          status: 'completado',
          summary: msg,
        });
      } else if (step.tool === 'buffer') {
        const srcLayer = currentProj.layers.find((l) => l.kind === 'vector' && l.geojson);
        if (srcLayer?.geojson) {
          const dist = Number(step.params?.distanceMeters) || 500;
          const bufFc = runVectorBuffer(srcLayer.geojson, dist, false);
          const bufLayer: GisLayer = {
            id: `lyr-ai-buf-${Date.now()}-${Math.floor(Math.random() * 100)}`,
            name: `IA Buffer ${dist}m — ${srcLayer.name}`,
            category: 'geoproceso',
            kind: 'vector',
            visible: true,
            opacity: 0.85,
            crs: 'EPSG:4326',
            source: `${step.agent} (Geotech AI)`,
            capturedDate: new Date().toISOString().split('T')[0],
            metadata: { provenance: 'modelo_analitico' },
            symbology: { color: '#7c3aed', fillColor: '#8b5cf6', fillOpacity: 0.3 },
            geojson: bufFc,
          };
          currentProj = appendHistory(
            { ...currentProj, layers: [...currentProj.layers, bufLayer] },
            {
              tool: step.label,
              module: moduleLabel,
              agent: step.agent,
              parameters: { distanceMeters: dist },
              inputLayers: [srcLayer.name],
              outputLayer: bufLayer.name,
              durationMs: Math.round(performance.now() - t0),
              status: 'completado',
              summary: `Buffer ${dist}m generado con ${bufFc.features.length} áreas de influencia.`,
            }
          );
          executedNotes.push(`${step.agent}: Buffer ${dist}m aplicado a ${srcLayer.name}.`);
        }
      } else if (step.tool === 'ndvi' && currentProj.spectralScene) {
        const ndvi = computeSpectralIndex(currentProj.spectralScene, 't2', 'NDVI');
        newRasters.push(ndvi.grid);
        const msg = `NDVI medio ${ndvi.mean}, cobertura >0.25: ${ndvi.positiveCoveragePct}%.`;
        executedNotes.push(`${step.agent}: ${msg}`);
        currentProj = appendHistory(currentProj, {
          tool: step.label,
          module: moduleLabel,
          agent: step.agent,
          parameters: step.params,
          inputLayers: [currentProj.spectralScene.name],
          outputLayer: ndvi.grid.name,
          durationMs: Math.round(performance.now() - t0),
          status: 'completado',
          summary: msg,
        });
      } else if (step.tool === 'spectral_change' && currentProj.spectralScene) {
        const chg = computeSpectralChange(currentProj.spectralScene, 'NDVI');
        newRasters.push(chg.deltaGrid);
        const msg = `Cambio ΔNDVI: pérdida ${chg.significantLossPct}%, ganancia ${chg.significantGainPct}%.`;
        executedNotes.push(`${step.agent}: ${msg}`);
        currentProj = appendHistory(currentProj, {
          tool: step.label,
          module: moduleLabel,
          agent: step.agent,
          parameters: step.params,
          inputLayers: [currentProj.spectralScene.name],
          outputLayer: chg.deltaGrid.name,
          durationMs: Math.round(performance.now() - t0),
          status: 'completado',
          summary: msg,
        });
      } else if (step.tool === 'ahp_suitability') {
        const ahpW = computeAhpWeights([
          [1, 2, 3, 4],
          [0.5, 1, 2, 3],
          [1 / 3, 0.5, 1, 2],
          [0.25, 1 / 3, 0.5, 1],
        ]);
        const suit = computeSuitabilityGrid(
          currentProj.dem,
          {
            slope: ahpW.weights[0],
            hydrology: ahpW.weights[1],
            elevation: ahpW.weights[2],
            accessibility: ahpW.weights[3],
          },
          35
        );
        newRasters.push(suit.grid);
        const msg = `AHP (CR=${ahpW.consistencyRatio}): Aptitud Alta ${suit.highHa} ha, Media ${suit.mediumHa} ha.`;
        executedNotes.push(`${step.agent}: ${msg}`);
        currentProj = appendHistory(currentProj, {
          tool: step.label,
          module: moduleLabel,
          agent: step.agent,
          parameters: step.params,
          inputLayers: [currentProj.dem.name],
          outputLayer: suit.grid.name,
          durationMs: Math.round(performance.now() - t0),
          status: 'completado',
          summary: msg,
        });
      } else if (step.tool === 'slope_stability') {
        const slopeStats = computeSlopeGrid(currentProj.dem);
        const stab = evaluateSlopeStability({
          method: 'simplified_bishop',
          slopeAngleDeg: Math.max(18, slopeStats.meanDeg + 10),
          slopeHeightM: 18,
          failureDepthM: 5,
          unitWeightKnM3: 18.8,
          cohesionKpa: 12,
          frictionDeg: 28,
          porePressureRatioRu: 0.25,
        });
        const msg = `Estabilidad Bishop: FS = ${stab.safetyFactor} (${stab.stabilityClass}).`;
        executedNotes.push(`${step.agent}: ${msg}`);
        currentProj = appendHistory(currentProj, {
          tool: step.label,
          module: moduleLabel,
          agent: step.agent,
          parameters: step.params,
          inputLayers: [currentProj.dem.name],
          durationMs: Math.round(performance.now() - t0),
          status: 'completado',
          summary: msg,
        });
      } else if (step.tool === 'hotspots') {
        const ptLayer = currentProj.layers.find(
          (l) => l.kind === 'vector' && l.geojson?.features.some((f) => f.geometry?.type === 'Point')
        );
        if (ptLayer?.geojson) {
          const firstProps = ptLayer.geojson.features[0]?.properties || {};
          const numField = Object.keys(firstProps).find((k) => typeof firstProps[k] === 'number');
          if (numField) {
            const giFc = computeGetisOrdGiStar(ptLayer.geojson, numField, 5000);
            const msg = `Hotspots Gi* (${numField}) calculados sobre ${giFc.features.length} estaciones.`;
            executedNotes.push(`${step.agent}: ${msg}`);
            currentProj = appendHistory(currentProj, {
              tool: step.label,
              module: moduleLabel,
              agent: step.agent,
              parameters: { field: numField },
              inputLayers: [ptLayer.name],
              durationMs: Math.round(performance.now() - t0),
              status: 'completado',
              summary: msg,
            });
          }
        }
      }
    }

    if (newRasters.length > 0) {
      setGeneratedRasters((prev) => [...newRasters.reverse(), ...prev]);
      setActiveRasterId(newRasters[newRasters.length - 1].id);
    }

    setWorkingProject(currentProj);
    setIsDirty(true);
    setBottomTab('history');
    setAiResponseSummary(
      `${engineName}: ${summaryText}\n${executedNotes.map((n) => `• ${n}`).join('\n')}`
    );
  };

  // Geotech AI Core 2.0 Execution (Multi-Agent Collaboration + Destructive Approval Gate)
  const handleRunAiWorkflow = async () => {
    if (!workingProject || !aiPrompt.trim()) return;
    setAiLoading(true);
    setAiResponseSummary('');
    try {
      const plan = await api.runGeotechAiAgentV2({
        prompt: aiPrompt.trim(),
        mode: aiMode,
        agentRole: aiAgentRole,
        projectContext: {
          name: workingProject.name,
          domain: workingProject.domain,
          areaHa: workingProject.areaHa,
          layers: workingProject.layers.map((l) => l.name),
          hasSpectralScene: Boolean(workingProject.spectralScene),
          boreholeCount: workingProject.boreholes.length,
        },
      });

      setLastAiSteps(plan.steps);
      setLastAiAgents(plan.agentsInvolved || []);

      if (plan.requiresApproval) {
        const confirmed = await confirmAction({
          title: 'Confirmación de Operación Crítica (Geotech AI 2.0)',
          message: `${plan.summary}\n\nDetalle: ${
            plan.approvalReason || 'La instrucción afectaría capas o DEM del proyecto activo.'
          }\n\n¿Autoriza ejecutar los ${plan.steps.length} paso(s) propuestos?`,
          confirmLabel: 'Autorizar y Ejecutar',
          cancelLabel: 'Bloquear Acción',
          danger: true,
        });
        if (!confirmed) {
          setAiResponseSummary(
            `${plan.engine}: Ejecución bloqueada por control de seguridad del ingeniero (${
              plan.destructiveActionType || 'acción crítica'
            }).`
          );
          showToast('Operación crítica cancelada por el usuario.', 'warning');
          return;
        }
      }

      executePlannedSteps(plan.steps, plan.engine, plan.summary);
      showToast(`Flujo Geotech AI 2.0 completado (${plan.steps.length} operaciones reales).`, 'success');
    } catch (err: any) {
      setAiResponseSummary(`Error: ${err.message}`);
      showToast(err.message || 'No se pudo ejecutar Geotech AI.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  // Geotech AI Agent 3.0 Execution (Autonomous Planning + Sandbox Dry-Run + Explainability Trace)
  const handleRunAiAgentV3 = async () => {
    if (!workingProject || !aiPrompt.trim()) return;
    setAiLoading(true);
    setAiResponseSummary('');
    try {
      const plan = await api.runGeotechAiAgentV3({
        prompt: aiPrompt.trim(),
        projectId: workingProject.id,
        sandboxDryRun,
      });
      setLastAiSteps(plan.steps);
      setLastAiAgents(plan.agentsInvolved || []);
      setAiV3Explainability(plan.explainability);

      if (sandboxDryRun) {
        setAiResponseSummary(
          `[SANDBOX DRY-RUN — SIN MUTACIÓN] ${plan.engine}: ${plan.summary}\n${plan.steps
            .map((s, idx) => `${idx + 1}. [${s.agent}] ${s.label} (${s.tool})`)
            .join('\n')}`
        );
        showToast(`Simulación Segura 3.0 lista (${plan.steps.length} pasos trazables sin alterar capas).`, 'info');
        return;
      }

      if (plan.requiresApproval) {
        const confirmed = await confirmAction({
          title: 'Autorización de Operación Autónoma (Geotech AI 3.0)',
          message: `${plan.summary}\n\nDetalle: ${
            plan.approvalReason || 'La instrucción modificará capas o modelos del proyecto activo.'
          }\n\n¿Autoriza ejecutar los ${plan.steps.length} paso(s) propuestos?`,
          confirmLabel: 'Autorizar y Ejecutar 3.0',
          cancelLabel: 'Bloquear Acción',
          danger: true,
        });
        if (!confirmed) {
          setAiResponseSummary(`${plan.engine}: Ejecución bloqueada por control humano obligatorio.`);
          showToast('Ejecución autónoma 3.0 bloqueada por el ingeniero.', 'warning');
          return;
        }
      }

      executePlannedSteps(plan.steps, plan.engine, plan.summary, 'Agente Autónomo 3.0');
      showToast(`Agente Autónomo 3.0 ejecutó ${plan.steps.length} paso(s) con trazabilidad completa.`, 'success');
    } catch (err: any) {
      setAiResponseSummary(`Error Agente 3.0: ${err.message}`);
      showToast(err.message || 'No se pudo ejecutar Agente Autónomo 3.0.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  // Geotech AI 4.0 Verifiable Orchestrator (No invented criteria; asks for missingInputs)
  const handleRunAiAgentV4 = async () => {
    if (!workingProject || !aiPrompt.trim()) return;
    setAiLoading(true);
    setAiResponseSummary('');
    setAiV4Plan(null);
    try {
      const plan4 = await api.runGeotechAiAgentV4({
        prompt: aiPrompt.trim(),
        projectId: workingProject.id,
      });
      setAiV4Plan(plan4);
      setLastAiSteps(plan4.steps);
      setAiResponseSummary(`${plan4.engine}\n${plan4.summary}`);
      if (plan4.needsMoreInfo) {
        showToast(`IA 4.0 requiere ${plan4.missingInputs.length} dato(s) real(es) antes de ejecutar.`, 'warning');
      } else {
        showToast(`Plan verificable 4.0 listo (${plan4.steps.length} pasos).`, 'success');
      }
    } catch (err: any) {
      setAiResponseSummary(`Error AI 4.0: ${err.message}`);
      showToast(err.message || 'No se pudo planificar flujo IA 4.0.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddMonitoringMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workingProject || !monStationId || !Number.isFinite(Number(monValue))) return;
    setMonSubmitting(true);
    try {
      const res = await api.addMonitoringMeasurement(workingProject.id, {
        stationId: monStationId,
        value: Number(monValue),
        campaign: monCampaign.trim() || 'Campaña Campo 4.0',
      });
      setMonitoringStations(res.stations);
      setMonitoringAlerts(res.alerts);
      showToast('Medición ambiental registrada y evaluada contra límites ECA/LMP.', 'success');
    } catch (err: any) {
      showToast(err.message || 'No se pudo registrar la medición ambiental.', 'error');
    } finally {
      setMonSubmitting(false);
    }
  };

  const handleSaveCurrentAiWorkflow = () => {
    if (!workingProject || !canEdit || lastAiSteps.length === 0) return;
    const wf: SavedGeotechWorkflow = {
      id: `wf-${Date.now()}`,
      name: `Flujo IA (${lastAiSteps.map((s) => s.tool).slice(0, 3).join('+')})`,
      description: aiPrompt.trim().slice(0, 140),
      createdAt: new Date().toISOString().split('T')[0],
      createdBy: userName,
      steps: lastAiSteps,
    };
    setWorkingProject({
      ...workingProject,
      savedWorkflows: [wf, ...(workingProject.savedWorkflows || [])],
    });
    setIsDirty(true);
    showToast(`Flujo "${wf.name}" guardado en flujos reproducibles del proyecto (pulse Guardar Cambios*).`, 'success');
  };

  // Attribute table columns & rows for selected layer (must remain above early return)
  const selectedFeatures = selectedLayer?.geojson?.features || [];
  const attributeColumns = useMemo(() => {
    const keys = new Set<string>();
    selectedFeatures.slice(0, 20).forEach((f) => {
      Object.keys(f.properties || {}).forEach((k) => keys.add(k));
    });
    return Array.from(keys);
  }, [selectedFeatures]);

  const filteredFeatures = useMemo(() => {
    if (!attrSearch.trim()) return selectedFeatures;
    const q = attrSearch.toLowerCase();
    return selectedFeatures.filter((f) =>
      JSON.stringify(f.properties || {}).toLowerCase().includes(q)
    );
  }, [selectedFeatures, attrSearch]);

  if (!workingProject) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <Compass className="w-10 h-10 text-emerald-700 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">SIG &amp; GEOTECH AI — Sin Proyectos Activos</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Cree un nuevo proyecto geoespacial para operar el visor cartográfico 2D/3D, análisis DEM, teledetección y geotecnia.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              + Nuevo Proyecto SIG
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1720px] mx-auto p-4 lg:p-6 space-y-4">
      {/* Top Engineering Ribbon */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-900 text-emerald-300 flex items-center justify-center shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  SIG &amp; GEOTECH AI — Intelligent Geospatial Engineering
                </h2>
                <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                  {workingProject.domain}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono font-bold">
                  {workingProject.areaHa.toLocaleString()} ha
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">{workingProject.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={workingProject.id}
              onChange={(e) => handleSelectProject(e.target.value)}
              aria-label="Seleccionar proyecto geoespacial"
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 max-w-[260px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>

            <select
              value={activeCrs}
              onChange={(e) => {
                const nextCrs = e.target.value as CrsCode;
                setActiveCrs(nextCrs);
                setWorkingProject({ ...workingProject, defaultCrs: nextCrs });
                setIsDirty(true);
              }}
              aria-label="Sistema de coordenadas CRS"
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-700"
            >
              {SUPPORTED_CRS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>

            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setShowNewModal(true)}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuevo Proyecto</span>
                </button>

                <button
                  type="button"
                  onClick={() => persistProjectUpdate(workingProject)}
                  disabled={saving}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                    isDirty
                      ? 'bg-slate-900 hover:bg-slate-800 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{isDirty ? 'Guardar Cambios*' : 'Guardado'}</span>
                </button>

                {projects.length > 1 && (
                  <button
                    type="button"
                    onClick={handleDeleteProject}
                    aria-label="Eliminar proyecto actual"
                    title="Eliminar proyecto SIG"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Workspace Module Sub-Tabs (SIG & GEOTECH AI 2.0) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          {[
            { id: 'map2d' as const, label: 'Visor 2D & Geoproceso', icon: MapIcon },
            { id: 'raster2' as const, label: 'Ráster 2.0', icon: Grid3X3 },
            { id: 'lidar3d' as const, label: 'LiDAR 3D', icon: ScanLine },
            { id: 'hydro2' as const, label: 'Hidrología 2.0 / 3.0', icon: Droplets },
            { id: 'spectral' as const, label: 'Teledetección 2.0', icon: Satellite },
            { id: 'geotech2' as const, label: 'Geotecnia Pro 2.0 / 3.0', icon: HardHat },
            { id: 'ahp' as const, label: 'Multicriterio AHP', icon: Sliders },
            { id: 'terrain3d' as const, label: 'Gemelo Digital 4D', icon: Box },
            { id: 'modelbuilder' as const, label: 'Model Builder DAG', icon: Workflow },
            { id: 'quality3' as const, label: 'Calidad & Incertidumbre', icon: ShieldCheck },
            { id: 'geocatalog' as const, label: 'GeoCatalog & STAC 2.0', icon: Database },
            { id: 'geoml' as const, label: 'GeoML 3.0', icon: BrainCircuit },
            { id: 'enterprise3' as const, label: 'Enterprise 4.0 & Estrés H–Y', icon: Cpu },
            { id: 'cartography' as const, label: 'Cartografía, Atlas & I/O', icon: Download },
            { id: 'infra' as const, label: 'Infra & Auditoría', icon: Server },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================
          TAB 1: 2D GIS WORKBENCH + LAYER DOCK + TOOLBOX + AI CORE
         ============================================================ */}
      {subTab === 'map2d' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* LEFT DOCK: Layers & Rasters */}
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Capas SIG ({workingProject.layers.length})</span>
                </h3>
                <span className="text-[10px] font-mono text-slate-400">{workingProject.code}</span>
              </div>

              {/* Active Raster Selector */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700">Capa Ráster Activa</label>
                  <span className="text-[10px] font-mono text-slate-500">{Math.round(rasterOpacity * 100)}%</span>
                </div>
                <select
                  value={activeRasterId}
                  onChange={(e) => setActiveRasterId(e.target.value)}
                  aria-label="Seleccionar capa ráster activa"
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-[11px] font-medium text-slate-800"
                >
                  <option value="dem">{workingProject.dem.name}</option>
                  {generatedRasters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                  <option value="none">Sin overlay ráster</option>
                </select>
                {activeRasterId !== 'none' && (
                  <input
                    type="range"
                    min="0.15"
                    max="1"
                    step="0.05"
                    value={rasterOpacity}
                    onChange={(e) => setRasterOpacity(Number(e.target.value))}
                    aria-label="Opacidad de capa ráster"
                    className="w-full accent-emerald-700 cursor-pointer"
                  />
                )}
              </div>

              {/* Vector & Service Layer Tree */}
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
                {workingProject.layers.map((lyr) => {
                  const stats = lyr.geojson ? computeVectorLayerStats(lyr.geojson) : null;
                  const isSelected = lyr.id === selectedLayerId;
                  return (
                    <div
                      key={lyr.id}
                      className={`p-2.5 rounded-lg border text-xs transition-colors ${
                        isSelected
                          ? 'bg-emerald-50/70 border-emerald-300'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleLayerVisibility(lyr.id)}
                            aria-label={`${lyr.visible ? 'Ocultar' : 'Mostrar'} capa ${lyr.name}`}
                            className="text-slate-600 hover:text-emerald-700 cursor-pointer shrink-0"
                          >
                            {lyr.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-300" />}
                          </button>
                          <input
                            type="color"
                            value={lyr.symbology.color || '#059669'}
                            onChange={(e) => updateLayerColor(lyr.id, e.target.value)}
                            aria-label={`Color de simbología para ${lyr.name}`}
                            className="w-4 h-4 rounded border-0 p-0 bg-transparent cursor-pointer shrink-0"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLayerId(lyr.id);
                              setBottomTab('attributes');
                            }}
                            className="font-semibold text-slate-800 truncate text-left hover:underline cursor-pointer"
                          >
                            {lyr.name}
                          </button>
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => removeLayer(lyr.id)}
                            aria-label={`Eliminar capa ${lyr.name}`}
                            className="text-slate-300 hover:text-rose-600 cursor-pointer shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500">
                        <span className="font-mono">
                          {stats
                            ? `${stats.featureCount} ent. · ${stats.geometryTypes[0] || 'Geom'}${
                                stats.totalAreaHa > 0 ? ` · ${stats.totalAreaHa} ha` : ''
                              }`
                            : lyr.kind.toUpperCase()}
                        </span>
                        {lyr.geojson && (
                          <button
                            type="button"
                            onClick={() =>
                              triggerFileDownload(
                                `${lyr.name.replace(/\s+/g, '_')}.geojson`,
                                JSON.stringify(lyr.geojson, null, 2),
                                'application/geo+json'
                              )
                            }
                            className="text-emerald-700 hover:underline font-semibold cursor-pointer"
                          >
                            GeoJSON
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CENTER: Interactive Leaflet 2D Map */}
            <div className="lg:col-span-6 space-y-2">
              <div className="h-[520px]">
                <GisMap2DCanvas
                  center={workingProject.center}
                  zoom={workingProject.zoom}
                  activeCrs={activeCrs}
                  layers={workingProject.layers}
                  activeRaster={activeRaster}
                  activeRasterOpacity={rasterOpacity}
                  boreholes={workingProject.boreholes}
                  selectedFeatureInfo={selectedFeatureInfo?.props || null}
                  canEdit={canEdit}
                  onSelectFeature={(props, layerName) => {
                    if (props) setSelectedFeatureInfo({ layerName: layerName || 'Entidad', props });
                    else setSelectedFeatureInfo(null);
                  }}
                  onSelectBorehole={(bh) => {
                    setSelectedBoreholeId(bh.id);
                    setToolboxTab('geotech');
                    showToast(`Sondeo ${bh.code} (${bh.totalDepthM}m) seleccionado en inspector geotécnico.`, 'info');
                  }}
                  onProfileLineComplete={handleProfileLineComplete}
                  onDigitizeFeature={handleDigitizeFeature}
                />
              </div>

              {selectedFeatureInfo && (
                <div className="bg-white border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-emerald-800">{selectedFeatureInfo.layerName}:</span>
                    {Object.entries(selectedFeatureInfo.props)
                      .slice(0, 5)
                      .map(([k, v]) => (
                        <span key={k} className="px-2 py-0.5 bg-slate-100 rounded font-mono text-[11px]">
                          {k}: <strong>{String(v)}</strong>
                        </span>
                      ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFeatureInfo(null)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label="Cerrar inspector de entidad"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* RIGHT DOCK: Geoprocessing Toolbox, Hydrology/Stats, Geotech, AI Core */}
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 text-[11px] font-bold">
                {[
                  { id: 'vector' as const, label: 'Vector', icon: Wrench },
                  { id: 'hydro' as const, label: 'DEM/Hidro', icon: Mountain },
                  { id: 'geotech' as const, label: 'Geotecnia', icon: HardHat },
                  { id: 'ai' as const, label: 'AI Core', icon: Sparkles },
                ].map((t) => {
                  const Icon = t.icon;
                  const active = toolboxTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setToolboxTab(t.id)}
                      className={`py-2.5 px-1 flex flex-col items-center gap-1 cursor-pointer border-b-2 transition-colors ${
                        active
                          ? 'border-emerald-700 bg-white text-emerald-800'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="p-3.5 space-y-3 max-h-[470px] overflow-y-auto text-xs">
                {/* TOOLBOX 1: VECTOR GEOPROCESSING */}
                {toolboxTab === 'vector' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Operación Geoespacial Real
                      </label>
                      <select
                        value={vectorOp}
                        onChange={(e) => setVectorOp(e.target.value as VectorOpType)}
                        aria-label="Operación de geoprocesamiento vectorial"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-medium"
                      >
                        {VECTOR_OPERATIONS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Capa Entrada (A)</label>
                      <select
                        value={layerAId}
                        onChange={(e) => setLayerAId(e.target.value)}
                        aria-label="Capa vectorial de entrada A"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                      >
                        {vectorLayers.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {VECTOR_OPERATIONS.find((o) => o.value === vectorOp)?.needsLayerB && (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Capa Máscara / Unión (B)</label>
                        <select
                          value={layerBId}
                          onChange={(e) => setLayerBId(e.target.value)}
                          aria-label="Capa vectorial secundaria B"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                        >
                          {vectorLayers.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {(vectorOp === 'buffer' || (vectorOp === 'select_by_location' && locPredicate === 'within_distance')) && (
                      <div className="space-y-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <label className="block text-[11px] font-semibold text-slate-700">
                          Distancia Geodésica (metros)
                        </label>
                        <input
                          type="number"
                          min={10}
                          max={50000}
                          value={bufferMeters}
                          onChange={(e) => setBufferMeters(Number(e.target.value) || 500)}
                          className="w-full px-2.5 py-1 border border-slate-300 rounded text-xs font-mono font-bold"
                        />
                        {vectorOp === 'buffer' && (
                          <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={dissolveBuffer}
                              onChange={(e) => setDissolveBuffer(e.target.checked)}
                            />
                            <span>Disolver áreas superpuestas</span>
                          </label>
                        )}
                      </div>
                    )}

                    {vectorOp === 'select_by_attribute' && (
                      <div className="space-y-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <select
                          value={attrField}
                          onChange={(e) => setAttrField(e.target.value)}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                        >
                          {layerAFields.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                        <div className="grid grid-cols-3 gap-1.5">
                          <select
                            value={attrOperator}
                            onChange={(e) => setAttrOperator(e.target.value as any)}
                            className="px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                          >
                            <option value=">">&gt;</option>
                            <option value=">=">&gt;=</option>
                            <option value="<">&lt;</option>
                            <option value="<=">&lt;=</option>
                            <option value="=">=</option>
                            <option value="!=">!=</option>
                            <option value="contains">contiene</option>
                          </select>
                          <input
                            type="text"
                            value={attrValue}
                            onChange={(e) => setAttrValue(e.target.value)}
                            className="col-span-2 px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {vectorOp === 'select_by_location' && (
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <select
                          value={locPredicate}
                          onChange={(e) => setLocPredicate(e.target.value as any)}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                        >
                          <option value="within_distance">Dentro de distancia (m)</option>
                          <option value="intersects">Intersecta directamente</option>
                        </select>
                      </div>
                    )}

                    {canEdit ? (
                      <button
                        type="button"
                        onClick={handleRunVectorOp}
                        className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Ejecutar Geoproceso</span>
                      </button>
                    ) : (
                      <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                        Modo lectura: no puede generar nuevas capas.
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleValidateTopology}
                      className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Validar Topología &amp; Proyectar ({activeCrs})</span>
                    </button>
                  </div>
                )}

                {/* TOOLBOX 2: DEM MORPHOMETRY, HYDROLOGY & SPATIAL STATS */}
                {toolboxTab === 'hydro' && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] font-bold text-slate-700 uppercase mb-1.5">
                        Modelamiento DEM &amp; Hidrología D8
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: 'slope' as const, label: 'Pendiente (°)' },
                          { id: 'twi' as const, label: 'Flujo D8 / TWI' },
                          { id: 'aspect' as const, label: 'Orientación' },
                          { id: 'hillshade' as const, label: 'Hillshade' },
                          { id: 'curvature' as const, label: 'Curvatura' },
                          { id: 'viewshed' as const, label: 'Viewshed 3D' },
                        ].map((btn) => (
                          <button
                            key={btn.id}
                            type="button"
                            onClick={() => handleRunTerrainTool(btn.id)}
                            className="px-2 py-1.5 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 cursor-pointer"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <p className="text-[11px] font-bold text-slate-700 uppercase">
                        Estadística Espacial &amp; Interpolación
                      </p>
                      <select
                        value={statsLayerId}
                        onChange={(e) => setStatsLayerId(e.target.value)}
                        aria-label="Capa de puntos para estadística espacial"
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                      >
                        {vectorLayers.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>

                      <div className="grid grid-cols-2 gap-1.5">
                        <select
                          value={statsField}
                          onChange={(e) => setStatsField(e.target.value)}
                          aria-label="Variable numérica para estadística"
                          className="px-2 py-1.5 border border-slate-300 rounded text-xs font-mono"
                        >
                          {statsNumericFields.length ? (
                            statsNumericFields.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))
                          ) : (
                            <option value="">Sin campo num.</option>
                          )}
                        </select>
                        <input
                          type="number"
                          min={200}
                          max={25000}
                          value={statsRadiusM}
                          onChange={(e) => setStatsRadiusM(Number(e.target.value) || 5000)}
                          title="Radio de vecindad (m)"
                          className="px-2 py-1.5 border border-slate-300 rounded text-xs font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleRunSpatialStat('idw')}
                          className="py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px] font-bold cursor-pointer"
                        >
                          IDW
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRunSpatialStat('moran')}
                          className="py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-[11px] font-bold cursor-pointer"
                        >
                          Moran I
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRunSpatialStat('gi_star')}
                          className="py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded text-[11px] font-bold cursor-pointer"
                        >
                          Hotspot Gi*
                        </button>
                      </div>
                    </div>

                    {spatialStatsOutput && (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-950 font-mono">
                        {spatialStatsOutput}
                      </div>
                    )}
                  </div>
                )}

                {/* TOOLBOX 3: GEOTECHNICAL STABILITY & BOREHOLES */}
                {toolboxTab === 'geotech' && (
                  <div className="space-y-3">
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-900">
                      <strong>Distinción Técnica:</strong> Los sondeos SPT son datos observados; el cálculo FS/Licuefacción es un modelo analítico preliminar.
                    </div>

                    {/* Borehole Stratigraphy Inspector */}
                    {workingProject.boreholes.length > 0 && activeBorehole && (
                      <div className="space-y-2 border-b border-slate-200 pb-3">
                        <label className="block text-[11px] font-bold text-slate-700">
                          Sondeo SPT Observado ({workingProject.boreholes.length})
                        </label>
                        <select
                          value={activeBorehole.id}
                          onChange={(e) => setSelectedBoreholeId(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-semibold"
                        >
                          {workingProject.boreholes.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.code} — {b.name} ({b.totalDepthM}m)
                            </option>
                          ))}
                        </select>
                        <div className="space-y-1">
                          {activeBorehole.strata.map((st, idx) => (
                            <div
                              key={idx}
                              className="p-1.5 rounded border border-slate-200 bg-slate-50 flex items-center justify-between text-[10px]"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                                  style={{ backgroundColor: st.color }}
                                />
                                <span className="font-mono font-bold text-slate-600">
                                  {st.fromM}–{st.toM}m
                                </span>
                                <span className="truncate font-medium text-slate-800">{st.lithology}</span>
                              </div>
                              <span className="font-mono font-bold text-slate-700 shrink-0">
                                {st.uscs} · N={st.sptN60}
                              </span>
                            </div>
                          ))}
                        </div>
                        {liquefactionSummary && (
                          <div className="p-2 bg-slate-100 rounded text-[10px] font-mono text-slate-800">
                            Tamizaje Licuefacción ({liquefactionSummary.midDepth}m, NF={activeBorehole.waterTableDepthM}m):{' '}
                            <strong>FS_liq = {liquefactionSummary.result.fsLiq}</strong> ({liquefactionSummary.result.riskClass})
                          </div>
                        )}
                      </div>
                    )}

                    {/* Limit Equilibrium Slope Stability */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold text-slate-700 uppercase">
                        Estabilidad de Taludes (Equilibrio Límite)
                      </p>
                      <select
                        value={slopeMethod}
                        onChange={(e) => setSlopeMethod(e.target.value as any)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                      >
                        <option value="simplified_bishop">Método Bishop Simplificado (10 Dovelas)</option>
                        <option value="infinite_slope">Modelo Analítico Talud Infinito</option>
                      </select>

                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        <label className="block">
                          <span className="text-slate-500">Ángulo Talud β (°)</span>
                          <input
                            type="number"
                            value={slopeAngleDeg}
                            onChange={(e) => setSlopeAngleDeg(Number(e.target.value) || 30)}
                            className="w-full px-2 py-1 border border-slate-300 rounded font-mono"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-500">Altura H (m)</span>
                          <input
                            type="number"
                            value={slopeHeightM}
                            onChange={(e) => setSlopeHeightM(Number(e.target.value) || 15)}
                            className="w-full px-2 py-1 border border-slate-300 rounded font-mono"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-500">Cohesión c&apos; (kPa)</span>
                          <input
                            type="number"
                            value={cohesionKpa}
                            onChange={(e) => setCohesionKpa(Number(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-slate-300 rounded font-mono"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-500">Fricción φ&apos; (°)</span>
                          <input
                            type="number"
                            value={frictionDeg}
                            onChange={(e) => setFrictionDeg(Number(e.target.value) || 25)}
                            className="w-full px-2 py-1 border border-slate-300 rounded font-mono"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-500">P. Unitario γ (kN/m³)</span>
                          <input
                            type="number"
                            step="0.2"
                            value={unitWeightKnM3}
                            onChange={(e) => setUnitWeightKnM3(Number(e.target.value) || 18.5)}
                            className="w-full px-2 py-1 border border-slate-300 rounded font-mono"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-500">Presión Poros ru</span>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            max="0.5"
                            value={ruRatio}
                            onChange={(e) => setRuRatio(Number(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-slate-300 rounded font-mono"
                          />
                        </label>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border text-xs ${
                          slopeResult.safetyFactor >= 1.5
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : slopeResult.safetyFactor >= 1.15
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-rose-50 border-rose-200 text-rose-900'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span>Factor de Seguridad (FS)</span>
                          <span className="text-base font-mono">{slopeResult.safetyFactor}</span>
                        </div>
                        <p className="text-[11px] font-semibold mt-0.5">{slopeResult.stabilityClass}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOOLBOX 4: GEOTECH AI CORE (MULTI-AGENT ORCHESTRATOR) */}
                {toolboxTab === 'ai' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Motor de Orquestación
                      </label>
                      <select
                        value={aiMode}
                        onChange={(e) => setAiMode(e.target.value as any)}
                        aria-label="Motor de inteligencia artificial"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                      >
                        <option value="deterministic">Planificador Determinístico Local (Reglas)</option>
                        <option value="gemini">Gemini 4 Hydrogen AI (Requiere Secret API)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Agente Especializado</label>
                      <select
                        value={aiAgentRole}
                        onChange={(e) => setAiAgentRole(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                      >
                        <option>Agente SIG</option>
                        <option>Agente Ambiental</option>
                        <option>Agente Geotécnico</option>
                        <option>Agente Hidrológico</option>
                        <option>Agente Teledetección</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Instrucción Operativa (Lenguaje Natural)
                      </label>
                      <textarea
                        rows={3}
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="Ej: Genera buffer de 500m, calcula flujo D8 TWI y evalúa estabilidad geotécnica..."
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {[
                        'Estudio hidrológico TWI y pendiente',
                        'Buffer 500m y hotspots Gi*',
                        'Cambio multitemporal NDVI y AHP',
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAiPrompt(preset)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[10px] text-slate-700 cursor-pointer"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    {canEdit ? (
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sandboxDryRun}
                            onChange={(e) => setSandboxDryRun(e.target.checked)}
                            className="accent-emerald-700"
                          />
                          <span>Modo Simulación Segura (Sandbox Dry-Run)</span>
                        </label>
                        <button
                          type="button"
                          onClick={handleRunAiAgentV4}
                          disabled={aiLoading}
                          className="w-full py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                        >
                          {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />}
                          <span>Orquestar Flujo IA 4.0 (Verificable)</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRunAiAgentV3}
                          disabled={aiLoading}
                          className="w-full py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                        >
                          {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BrainCircuit className="w-3.5 h-3.5 text-emerald-300" />}
                          <span>Ejecutar Agente Autónomo 3.0</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRunAiWorkflow}
                          disabled={aiLoading}
                          className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                        >
                          {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-emerald-400" />}
                          <span>Ejecutar Flujo Geotech AI 2.0</span>
                        </button>
                        {aiV4Plan && !aiV4Plan.needsMoreInfo && aiV4Plan.steps.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              executePlannedSteps(
                                aiV4Plan.steps,
                                aiV4Plan.engine,
                                aiV4Plan.summary,
                                'Geotech AI 4.0'
                              );
                              showToast(`Flujo IA 4.0 ejecutado (${aiV4Plan.steps.length} paso(s)).`, 'success');
                            }}
                            className="w-full py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Ejecutar Pasos Planificados 4.0 ({aiV4Plan.steps.length})</span>
                          </button>
                        )}
                        {aiV4Plan && (
                          <button
                            type="button"
                            onClick={() => setShowExplain4Modal(true)}
                            className="w-full py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Info className="w-3.5 h-3.5" />
                            <span>Ver cómo se obtuvo este resultado (7 Fases 4.0)</span>
                          </button>
                        )}
                        {aiV3Explainability && (
                          <button
                            type="button"
                            onClick={() => setShowExplainModal(true)}
                            className="w-full py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Info className="w-3.5 h-3.5" />
                            <span>Explicabilidad Agente 3.0</span>
                          </button>
                        )}
                        {lastAiSteps.length > 0 && (
                          <button
                            type="button"
                            onClick={handleSaveCurrentAiWorkflow}
                            className="w-full py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>Guardar Flujo Reproducible ({lastAiSteps.length} pasos)</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                        Modo lectura: ejecución de agentes restringida.
                      </p>
                    )}

                    {aiV4Plan?.needsMoreInfo && (
                      <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg space-y-1.5 text-[11px] text-amber-950">
                        <p className="font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                          <span>Datos faltantes solicitados (sin suposiciones):</span>
                        </p>
                        {aiV4Plan.missingInputs.map((mi) => (
                          <div key={mi.field} className="p-1.5 bg-white border border-amber-200 rounded">
                            <p className="font-semibold">{mi.question}</p>
                            <p className="text-[10px] text-slate-600 mt-0.5">{mi.reason}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {lastAiAgents.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {lastAiAgents.map((ag) => (
                          <span
                            key={ag}
                            className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-semibold"
                          >
                            {ag}
                          </span>
                        ))}
                      </div>
                    )}

                    {aiResponseSummary && (
                      <div className="p-2.5 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono whitespace-pre-wrap leading-relaxed">
                        {aiResponseSummary}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BOTTOM COLLAPSIBLE DRAWER: ATTRIBUTE TABLE, ELEVATION PROFILE & CUT/FILL, OPERATION LOG */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setBottomTab('attributes')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                    bottomTab === 'attributes' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span>Tabla de Atributos ({selectedFeatures.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('profile')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                    bottomTab === 'profile' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Perfil Topográfico &amp; Corte/Relleno</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('history')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                    bottomTab === 'history' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Historial de Geoprocesos ({workingProject.operationHistory.length})</span>
                </button>
              </div>

              {bottomTab === 'attributes' && selectedLayer && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-600">Capa: {selectedLayer.name}</span>
                  <input
                    type="text"
                    value={attrSearch}
                    onChange={(e) => setAttrSearch(e.target.value)}
                    placeholder="Filtrar atributos..."
                    className="px-2.5 py-1 border border-slate-300 rounded text-xs"
                  />
                </div>
              )}
            </div>

            <div className="p-4">
              {bottomTab === 'attributes' && (
                <div className="overflow-x-auto max-h-[240px]">
                  {filteredFeatures.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">
                      Seleccione una capa vectorial en el panel izquierdo para inspeccionar su tabla de atributos.
                    </p>
                  ) : (
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                        <tr>
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">Geometría</th>
                          {attributeColumns.map((col) => (
                            <th key={col} className="py-2 px-3">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredFeatures.slice(0, 50).map((f, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-1.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                            <td className="py-1.5 px-3 font-mono text-[11px] text-emerald-700">{f.geometry?.type}</td>
                            {attributeColumns.map((col) => (
                              <td key={col} className="py-1.5 px-3 text-slate-800 whitespace-nowrap">
                                {f.properties?.[col] !== undefined && f.properties?.[col] !== null
                                  ? String(f.properties[col])
                                  : '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {bottomTab === 'profile' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                  <div className="lg:col-span-8">
                    {profileResult ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">
                            Perfil Topográfico Extraído ({profileResult.totalLengthM} m)
                          </span>
                          <span className="font-mono text-emerald-700">
                            Mín: {profileResult.minElevM} m · Máx: {profileResult.maxElevM} m · Δ {profileResult.reliefM} m
                          </span>
                        </div>
                        <svg viewBox="0 0 600 130" className="w-full h-32 bg-slate-950 rounded-lg border border-slate-800">
                          {(() => {
                            const pts = profileResult.points;
                            const minE = profileResult.minElevM - 2;
                            const maxE = profileResult.maxElevM + 2;
                            const range = Math.max(maxE - minE, 1);
                            const polyCoords = pts
                              .map((p, i) => {
                                const x = 20 + (i / Math.max(pts.length - 1, 1)) * 560;
                                const y = 110 - ((p.elevationM - minE) / range) * 90;
                                return `${x.toFixed(1)},${y.toFixed(1)}`;
                              })
                              .join(' ');
                            return (
                              <>
                                <polyline fill="none" stroke="#10b981" strokeWidth="2.5" points={polyCoords} />
                                <polygon fill="#10b981" fillOpacity="0.18" points={`20,115 ${polyCoords} 580,115`} />
                              </>
                            );
                          })()}
                        </svg>
                      </div>
                    ) : (
                      <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-center text-xs text-slate-500">
                        Use la herramienta <strong>&quot;Perfil DEM&quot;</strong> en la barra superior del mapa 2D para trazar una sección sobre el terreno.
                      </div>
                    )}
                  </div>

                  {cutFillStats && (
                    <div className="lg:col-span-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">Cálculo Volumétrico Corte/Relleno</span>
                        <span className="font-mono text-[10px] text-slate-500">{cutFillStats.areaHa} ha</span>
                      </div>
                      <label className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-600">Cota de Rasante (msnm):</span>
                        <input
                          type="number"
                          step="1"
                          value={targetGradeElev}
                          onChange={(e) => setTargetGradeElev(Number(e.target.value) || 0)}
                          className="w-24 px-2 py-1 border border-slate-300 rounded font-mono font-bold text-right"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="p-2 bg-rose-50 border border-rose-200 rounded">
                          <span className="block text-[10px] text-rose-700">VOL. CORTE</span>
                          <strong className="text-rose-800">{cutFillStats.cutVolumeM3.toLocaleString()} m³</strong>
                        </div>
                        <div className="p-2 bg-sky-50 border border-sky-200 rounded">
                          <span className="block text-[10px] text-sky-700">VOL. RELLENO</span>
                          <strong className="text-sky-800">{cutFillStats.fillVolumeM3.toLocaleString()} m³</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {bottomTab === 'history' && (
                <div className="overflow-x-auto max-h-[220px]">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <tr>
                        <th className="py-2 px-3">Fecha/Hora</th>
                        <th className="py-2 px-3">Herramienta / Operación</th>
                        <th className="py-2 px-3">Responsable / Agente</th>
                        <th className="py-2 px-3">Resumen Técnico</th>
                        <th className="py-2 px-3 text-right">Tiempo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {workingProject.operationHistory.map((op) => (
                        <tr key={op.id} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {op.timestamp}
                          </td>
                          <td className="py-1.5 px-3 font-semibold text-slate-900">
                            <span className="inline-flex items-center gap-1">
                              {op.status === 'completado' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              )}
                              {op.tool}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-slate-600">{op.agent || 'Sistema'}</td>
                          <td className="py-1.5 px-3 text-slate-700">{op.summary}</td>
                          <td className="py-1.5 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                            {op.durationMs} ms
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          TAB 2: HIGH-PERFORMANCE RASTER ENGINE 2.0
         ============================================================ */}
      {subTab === 'raster2' && (
        <RasterLabPanel
          dem={workingProject.dem}
          layers={workingProject.layers}
          generatedRasters={generatedRasters}
          onPublishRaster={(grid, summary, toolName) => {
            publishComputedRaster(grid, toolName, 'Motor Ráster 2.0', summary, 12);
            setSubTab('map2d');
            showToast(`Ráster "${grid.name}" publicado en el Visor 2D/3D.`, 'success');
          }}
        />
      )}

      {/* ============================================================
          TAB 3: LIDAR & POINT CLOUD 3D LAB
         ============================================================ */}
      {subTab === 'lidar3d' && (
        <LidarLabPanel
          dem={workingProject.dem}
          defaultCrs={activeCrs}
          initialCloud={workingProject.lidarCloud}
          canEdit={canEdit}
          onPublishRaster={(grid, summary, toolName) => {
            publishComputedRaster(grid, toolName, 'Laboratorio LiDAR 3D', summary, 18);
            setSubTab('map2d');
            showToast(`Producto LiDAR "${grid.name}" publicado en el Visor 2D/3D.`, 'success');
          }}
          onPublishVectorLayer={(lyr, summary) => {
            publishComputedVectorLayer(lyr, summary, 'Laboratorio LiDAR 3D');
            setSubTab('map2d');
            showToast(summary, 'success');
          }}
          onUpdateCloud={(points) => {
            setWorkingProject((prev) =>
              prev ? { ...prev, lidarCloud: points } : prev
            );
            setIsDirty(true);
            showToast(`Nube LiDAR actualizada (${points.length.toLocaleString()} puntos). Pulse Guardar Cambios*.`, 'info');
          }}
        />
      )}

      {/* ============================================================
          TAB 4: HYDROLOGY 2.0 (PRIORITY-FLOOD, STRAHLER, WATERSHED)
         ============================================================ */}
      {subTab === 'hydro2' && (
        <Hydrology2Panel
          dem={workingProject.dem}
          layers={workingProject.layers}
          onPublishRaster={(grid, summary, toolName) => {
            publishComputedRaster(grid, toolName, 'Hidrología 2.0', summary, 16);
            setSubTab('map2d');
            showToast('Mapa hidrológico TWI publicado en el Visor 2D/3D.', 'success');
          }}
          onPublishVectorLayer={(lyr, summary) => {
            publishComputedVectorLayer(lyr, summary, 'Hidrología 2.0');
            showToast(summary, 'success');
          }}
        />
      )}

      {/* ============================================================
          TAB 5: 3D DIGITAL TWIN (TERRAIN + EXTRUDED INFRA + SUBSURFACE)
         ============================================================ */}
      {subTab === 'terrain3d' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-9">
              <Terrain3DViewer
                dem={workingProject.dem}
                overlayGrid={activeRaster}
                boreholes={workingProject.boreholes}
                layers={workingProject.layers}
                temporalFrames={workingProject.temporalFrames}
                iotSensors={[
                  ...(workingProject.iotSensors || []),
                  ...monitoringStations.map((st) => {
                    const alert = monitoringAlerts.find((a) => a.stationId === st.id);
                    const latestMeasurement = st.measurements[st.measurements.length - 1];
                    const latest = latestMeasurement?.value ?? 0;
                    const mappedStatus: 'normal' | 'alerta' | 'critico' =
                      alert?.severity === 'CRÍTICA' ? 'critico' : alert?.severity === 'ALERTA' ? 'alerta' : 'normal';
                    const sensorType: 'piezometro' | 'inclinometro' | 'pluviometro' | 'estacion_aire' =
                      st.matrix === 'piezometria' ? 'piezometro' : 'estacion_aire';
                    return {
                      id: st.id,
                      code: st.code,
                      name: `${st.name} (${st.parameter})`,
                      sensorType,
                      lng: st.lng,
                      lat: st.lat,
                      lastValue: latest,
                      unit: st.unit,
                      thresholdWarning: st.normativeLimit,
                      status: mappedStatus,
                      updatedAt: latestMeasurement?.date || new Date().toISOString().slice(0, 10),
                    };
                  }),
                ]}
                onSelectBorehole={(bh) => setSelectedBoreholeId(bh.id)}
              />
            </div>
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <HardHat className="w-4 h-4 text-amber-600" />
                <span>Inspector 3D de Subsuelo &amp; Rasante</span>
              </h3>
              {activeBorehole ? (
                <div className="space-y-2">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="font-bold text-slate-900">
                      {activeBorehole.code} — {activeBorehole.name}
                    </p>
                    <p className="text-[11px] font-mono text-slate-600">
                      Cota Collar: {activeBorehole.collarElevM} m · Prof: {activeBorehole.totalDepthM} m · NF:{' '}
                      {activeBorehole.waterTableDepthM} m
                    </p>
                  </div>
                  {activeBorehole.strata.map((st, idx) => (
                    <div key={idx} className="p-2 border border-slate-200 rounded-lg space-y-1">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: st.color }} />
                          {st.fromM}–{st.toM}m ({st.uscs})
                        </span>
                        <span className="font-mono text-emerald-700">N60={st.sptN60}</span>
                      </div>
                      <p className="text-[11px] text-slate-600">{st.lithology}</p>
                      <p className="text-[10px] font-mono text-slate-500">
                        c&apos;={st.cohesionKpa} kPa · φ&apos;={st.frictionDeg}° · γ={st.unitWeightKnM3} kN/m³
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500">Sin sondeos SPT registrados en este proyecto.</p>
              )}
            </div>
          </div>

          {/* 4.0 ENVIRONMENTAL MONITORING PANEL (STATIONS, NORMATIVE LIMITS ECA/LMP & CAMPAIGNS) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-sky-700" />
                  <span>Monitoreo Ambiental 4.0 (Estaciones Georreferenciadas, Límites ECA/LMP &amp; Tendencias)</span>
                </h3>
                <p className="text-slate-500 mt-0.5">
                  Las estaciones se proyectan en tiempo real sobre el Gemelo Digital 4D con detección automática de excedencias normativas.
                </p>
              </div>
              {canEdit && monitoringStations.length > 0 && (
                <form onSubmit={handleAddMonitoringMeasurement} className="flex flex-wrap items-center gap-2">
                  <select
                    value={monStationId}
                    onChange={(e) => setMonStationId(e.target.value)}
                    aria-label="Estación de monitoreo ambiental"
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                  >
                    {monitoringStations.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.code} ({st.parameter}, LMP {st.normativeLimit} {st.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.1"
                    value={monValue}
                    onChange={(e) => setMonValue(e.target.value)}
                    aria-label="Valor medido"
                    className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold"
                  />
                  <input
                    type="text"
                    value={monCampaign}
                    onChange={(e) => setMonCampaign(e.target.value)}
                    placeholder="Campaña..."
                    className="w-40 px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    disabled={monSubmitting}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {monSubmitting ? 'Registrando...' : 'Registrar Medición'}
                  </button>
                </form>
              )}
            </div>

            {monitoringAlerts.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="py-2 px-3">Estación</th>
                      <th className="py-2 px-3">Matriz / Parámetro</th>
                      <th className="py-2 px-3 text-right">Último Valor</th>
                      <th className="py-2 px-3 text-right">Límite ECA/LMP</th>
                      <th className="py-2 px-3 text-right">Excedencia / Tendencia</th>
                      <th className="py-2 px-3">Severidad</th>
                      <th className="py-2 px-3">Recomendación Operativa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monitoringAlerts.map((al) => (
                      <tr key={al.stationId}>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{al.stationCode}</td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-slate-800">{al.matrix}</span> · {al.parameter}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {al.latestValue} {al.unit}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                          {al.normativeLimit} {al.unit}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {al.exceedancePct >= 0 ? `+${al.exceedancePct}%` : `${al.exceedancePct}%`} ({al.trend})
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                              al.severity === 'CRÍTICA'
                                ? 'bg-rose-100 text-rose-800'
                                : al.severity === 'ALERTA'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {al.severity}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-600">{al.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          TAB 6: REMOTE SENSING SPECTRAL LAB 2.0 + STAC
         ============================================================ */}
      {subTab === 'spectral' && (
        <SpectralLabPanel
          scene={workingProject.spectralScene}
          fallbackBounds={workingProject.dem.bounds}
          onPublishRaster={(grid, summary, toolName) => {
            publishComputedRaster(grid, toolName, 'Teledetección Satelital 2.0', summary, 14);
            setSubTab('map2d');
            showToast('Ráster espectral publicado en el Visor 2D/3D.', 'success');
          }}
        />
      )}

      {/* ============================================================
          TAB 7: GEOTECH PRO 2.0 (TERZAGHI/MEYERHOF, SETTLEMENT, SEISMIC, LPI)
         ============================================================ */}
      {subTab === 'geotech2' && (
        <GeotechProPanel
          dem={workingProject.dem}
          boreholes={workingProject.boreholes}
          onPublishRaster={(grid, summary, toolName) => {
            publishComputedRaster(grid, toolName, 'Geotecnia Pro 2.0', summary, 15);
            setSubTab('map2d');
            showToast(`Mapa geotécnico "${grid.name}" publicado en el Visor 2D/3D.`, 'success');
          }}
        />
      )}

      {/* ============================================================
          TAB 8: MULTI-CRITERIA AHP TERRITORIAL MODELING
         ============================================================ */}
      {subTab === 'ahp' && (
        <MulticriteriaAhpPanel
          dem={workingProject.dem}
          onPublishSuitability={(grid, summary) => {
            publishComputedRaster(grid, 'Modelamiento Multicriterio Saaty AHP', 'Evaluación Territorial', summary, 16);
            setSubTab('map2d');
            showToast('Mapa de idoneidad AHP publicado en el Visor 2D/3D.', 'success');
          }}
        />
      )}

      {/* ============================================================
          TAB 5: MULTI-FORMAT I/O, CARTOGRAPHIC LAYOUT & BENCHMARKS A-E
         ============================================================ */}
      {subTab === 'cartography' && (
        <CartographyExportPanel
          project={workingProject}
          organizationName={activeOrg?.name || 'ECOINTELLIGENCE'}
          authorName={userName}
          canEdit={canEdit}
          onImportVectorLayer={(lyr) => {
            if (workingProject) globalGeoCache4.invalidateProject(workingProject.id);
            setWorkingProject((prev) =>
              prev
                ? appendHistory(
                    { ...prev, layers: [...prev.layers, lyr] },
                    {
                      tool: 'Importación Vectorial',
                      module: 'Interoperabilidad SIG',
                      agent: userName,
                      parameters: { layerName: lyr.name },
                      inputLayers: [],
                      outputLayer: lyr.name,
                      durationMs: 12,
                      status: 'completado',
                      summary: `Capa "${lyr.name}" importada al proyecto.`,
                    }
                  )
                : prev
            );
            setIsDirty(true);
            setSubTab('map2d');
            showToast(`Capa "${lyr.name}" agregada al mapa.`, 'success');
          }}
          onImportDem={(dem) => {
            if (workingProject) globalGeoCache4.invalidateProject(workingProject.id);
            setWorkingProject((prev) => (prev ? { ...prev, dem } : prev));
            setActiveRasterId('dem');
            setIsDirty(true);
            setSubTab('map2d');
            showToast(`DEM "${dem.name}" cargado en el proyecto.`, 'success');
          }}
          onAddExternalServiceLayer={(lyr) => {
            setWorkingProject((prev) =>
              prev ? { ...prev, layers: [...prev.layers, lyr] } : prev
            );
            setIsDirty(true);
            setSubTab('map2d');
            showToast(`Servicio externo "${lyr.name}" conectado.`, 'success');
          }}
          onRecordAuditOp={(tool, summary, durationMs) => {
            setWorkingProject((prev) =>
              prev
                ? appendHistory(prev, {
                    tool,
                    module: 'Control de Calidad & I/O',
                    agent: userName,
                    parameters: {},
                    inputLayers: [],
                    durationMs,
                    status: 'completado',
                    summary,
                  })
                : prev
            );
            setIsDirty(true);
          }}
        />
      )}

      {/* ============================================================
          TAB 10: ENTERPRISE INFRASTRUCTURE, VERSIONING & AUDIT
         ============================================================ */}
      {subTab === 'infra' && (
        <EnterpriseInfraPanel
          project={workingProject}
          canEdit={canEdit}
          onProjectReplaced={async (updated) => {
            setWorkingProject(updated);
            setIsDirty(false);
            await onRefresh();
            showToast(`Estado del proyecto "${updated.name}" sincronizado.`, 'success');
          }}
          onRunSavedWorkflow={(wf) => {
            executePlannedSteps(
              wf.steps,
              `Flujo Guardado: ${wf.name}`,
              wf.description || `Ejecutados ${wf.steps.length} pasos reproducibles.`,
              'Flujo Reproducible Guardado'
            );
            setSubTab('map2d');
            showToast(`Flujo guardado "${wf.name}" ejecutado (${wf.steps.length} pasos).`, 'success');
          }}
        />
      )}

      {/* ============================================================
          TAB 11: MODEL BUILDER 3.0 (VISUAL DAG WORKFLOWS)
         ============================================================ */}
      {subTab === 'modelbuilder' && (
        <ModelBuilderPanel
          project={workingProject}
          canEdit={canEdit}
          onUpdateGraphs={(graphs) => {
            setWorkingProject((prev) => (prev ? { ...prev, modelGraphs: graphs } : prev));
            setIsDirty(true);
            showToast('Grafo Model Builder actualizado (pulse Guardar Cambios* para persistir).', 'success');
          }}
          onPublishRaster={(grid, summary, toolName) => {
            publishComputedRaster(grid, toolName, 'Model Builder DAG 3.0', summary, 20);
            setSubTab('map2d');
            showToast(`Salida "${grid.name}" del Model Builder publicada en Visor 2D/3D.`, 'success');
          }}
          onPublishVectorLayer={(lyr, summary) => {
            publishComputedVectorLayer(lyr, summary, 'Model Builder DAG 3.0');
            setSubTab('map2d');
            showToast(summary, 'success');
          }}
        />
      )}

      {/* ============================================================
          TAB 12: GIS DATA QUALITY SCORE & SPATIAL UNCERTAINTY
         ============================================================ */}
      {subTab === 'quality3' && (
        <QualityUncertaintyPanel
          project={workingProject}
          onPublishRaster={(grid, summary, toolName) => {
            publishComputedRaster(grid, toolName, 'Calidad & Incertidumbre 3.0', summary, 14);
            setSubTab('map2d');
            showToast(`Mapa "${grid.name}" publicado en Visor 2D/3D.`, 'success');
          }}
        />
      )}

      {/* ============================================================
          TAB 13: GEOCATALOG & STAC 2.0 MULTI-FACET SEARCH
         ============================================================ */}
      {subTab === 'geocatalog' && (
        <GeoCatalogStacPanel
          project={workingProject}
          onSelectProject={(projectId) => {
            handleSelectProject(projectId);
            setSubTab('map2d');
          }}
        />
      )}

      {/* ============================================================
          TAB 14: GEOML 3.0 & THEMATIC REMOTE SENSING
         ============================================================ */}
      {subTab === 'geoml' && (
        <GeoMlLabPanel
          project={workingProject}
          userName={userName}
          canEdit={canEdit}
          onSaveModel={(model) => {
            setWorkingProject((prev) =>
              prev
                ? appendHistory(
                    { ...prev, trainedMlModels: [model, ...(prev.trainedMlModels || [])] },
                    {
                      tool: `Registro GeoML (${model.algorithm})`,
                      module: 'GeoML 3.0',
                      agent: userName,
                      parameters: {
                        accuracyPct: model.metrics.accuracyPct,
                        r2: model.metrics.r2,
                        kappa: model.metrics.kappa,
                      },
                      inputLayers: [prev.spectralScene?.name || prev.dem.name],
                      outputLayer: model.name,
                      durationMs: 10,
                      status: 'completado',
                      summary: `Modelo "${model.name}" guardado (${
                        model.metrics.accuracyPct !== undefined
                          ? `Accuracy ${model.metrics.accuracyPct}% · Kappa ${model.metrics.kappa}`
                          : `R² ${model.metrics.r2} · RMSE ${model.metrics.rmse}`
                      }).`,
                    }
                  )
                : prev
            );
            setIsDirty(true);
            showToast(`Modelo "${model.name}" registrado en el proyecto (pulse Guardar Cambios*).`, 'success');
          }}
          onPublishRaster={(grid, summary, toolName) => {
            publishComputedRaster(grid, toolName, 'GeoML 3.0', summary, 25);
            setSubTab('map2d');
            showToast(`Clasificación/Mapa "${grid.name}" publicado en el Visor 2D/3D.`, 'success');
          }}
        />
      )}

      {/* ============================================================
          TAB 15: ENTERPRISE 3.0 (BATCH QUEUE, TEMPLATES, RBAC, STRESS H-P, OGC)
         ============================================================ */}
      {subTab === 'enterprise3' && (
        <BatchEnterprisePanel
          project={workingProject}
          allProjectsCount={projects.length}
          userName={userName}
          canEdit={canEdit}
          onProjectReplaced={async (updated) => {
            setWorkingProject(updated);
            setSelectedProjectId(updated.id);
            setIsDirty(false);
            await onRefresh();
            showToast(`Proyecto "${updated.name}" actualizado.`, 'success');
          }}
          onRefreshAll={onRefresh}
        />
      )}

      {/* TRANSVERSAL FIELD PHOTOGRAPHIC EVIDENCES (Section 5.1) */}
      <ModuleEvidencePanel
        module="geotech"
        title="Evidencias Fotográficas de Campo — SIG, Calicatas y Sondeos"
        description="Adjunte fotografías georreferenciadas de campo, calicatas geotécnicas, afloramientos o levantamientos topográficos con trazabilidad."
        facilityId={facilities[0]?.id}
        entityId={workingProject.id}
        activeOrgId={activeOrg?.id}
        userRole={userRole}
        defaultCategory="Levantamiento SIG / Geotecnia"
        categories={[
          'Levantamiento SIG / Geotecnia',
          'Testigo de Sondeo SPT',
          'Estabilidad de Taludes',
          'Monitoreo de Cuenca / Agua',
          'Vuelo Fotogramétrico / Dron',
        ]}
      />

      {/* NEW PROJECT MODAL */}
      {showNewModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateProject}
            className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Nuevo Proyecto SIG &amp; Geotecnia</h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                aria-label="Cerrar modal nuevo proyecto"
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre del Proyecto *</label>
                <input
                  type="text"
                  required
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="Ej: Estudio Geotécnico Corredor Vial Sur"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dominio</label>
                  <select
                    value={newProjDomain}
                    onChange={(e) => setNewProjDomain(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="ambiental">Ambiental / Cuenca</option>
                    <option value="geotecnia">Geotecnia / Taludes</option>
                    <option value="industrial">Industrial / Planta</option>
                    <option value="gubernamental">Territorial / Municipal</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Extensión (ha)</label>
                  <input
                    type="number"
                    min={1}
                    value={newProjAreaHa}
                    onChange={(e) => setNewProjAreaHa(Number(e.target.value) || 500)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sistema de Coordenadas Base</label>
                <select
                  value={newProjCrs}
                  onChange={(e) => setNewProjCrs(e.target.value as CrsCode)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  {SUPPORTED_CRS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descripción Técnica</label>
                <textarea
                  rows={2}
                  value={newProjDesc}
                  onChange={(e) => setNewProjDesc(e.target.value)}
                  placeholder="Alcance del estudio territorial o geotécnico..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingProj}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {creatingProj ? 'Creando...' : 'Crear Proyecto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* AI AGENT 3.0 EXPLAINABILITY MODAL */}
      {showExplainModal && aiV3Explainability && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold">Explicabilidad Operativa — Agente Autónomo 3.0</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExplainModal(false)}
                aria-label="Cerrar modal de explicabilidad"
                className="text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 text-xs text-slate-800">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="font-bold text-emerald-950 uppercase text-[10px] mb-1">Objetivo Interpretado</p>
                <p className="font-semibold text-emerald-900">{aiV3Explainability.objective}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="font-bold text-slate-700 uppercase text-[10px] mb-1">Datos Utilizados</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {aiV3Explainability.dataUsed.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="font-bold text-slate-700 uppercase text-[10px] mb-1">Herramientas Ejecutadas</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] font-mono">
                    {aiV3Explainability.toolsUsed.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="font-bold text-slate-700 uppercase text-[10px] mb-1.5">Traza Paso a Paso de Operaciones</p>
                <div className="space-y-1.5">
                  {aiV3Explainability.operationsTrace.map((tr) => (
                    <div key={tr.stepNo} className="p-2 bg-white border border-slate-200 rounded flex items-start gap-2">
                      <span className="px-1.5 py-0.5 bg-slate-900 text-white rounded font-mono text-[10px] font-bold">
                        #{tr.stepNo}
                      </span>
                      <div>
                        <p className="font-bold text-slate-900">
                          {tr.agent} · <span className="font-mono text-emerald-700">{tr.operation}</span>
                        </p>
                        <p className="text-[11px] text-slate-600">{tr.purpose}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg">
                  <p className="font-bold text-sky-900 uppercase text-[10px] mb-1">Salidas Esperadas</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {aiV3Explainability.expectedOutputs.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="font-bold text-amber-900 uppercase text-[10px] mb-1">Limitaciones y Supuestos</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {aiV3Explainability.limitations.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px] space-y-1">
                <p className="text-emerald-300 font-bold">Controles de Seguridad &amp; Envelope de Precisión</p>
                <p>
                  Max pasos: {aiV3Explainability.safetyControls.maxStepsCap} · Timeout:{' '}
                  {aiV3Explainability.safetyControls.timeoutMsCap} ms · Sandbox Dry-Run:{' '}
                  {aiV3Explainability.safetyControls.sandboxDryRun ? 'ACTIVO' : 'NO'} · Snapshot Rollback:{' '}
                  {aiV3Explainability.safetyControls.rollbackSnapshotAvailable ? 'DISPONIBLE' : 'NO'}
                </p>
                {aiV3Explainability.precisionEnvelope && (
                  <p>
                    Método: {aiV3Explainability.precisionEnvelope.method} · CRS:{' '}
                    {aiV3Explainability.precisionEnvelope.crs} · Res:{' '}
                    {aiV3Explainability.precisionEnvelope.resolution} · Tipo:{' '}
                    {aiV3Explainability.precisionEnvelope.dataKind} · Precisión:{' '}
                    {aiV3Explainability.precisionEnvelope.estimatedAccuracy}
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowExplainModal(false)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cerrar Informe de Explicabilidad
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 4.0 7-PHASE VERIFIABLE EXPLAINABILITY MODAL */}
      {showExplain4Modal && aiV4Plan && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold">Explicabilidad de 7 Fases — Geotech AI 4.0</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExplain4Modal(false)}
                aria-label="Cerrar modal explicabilidad 4.0"
                className="text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-2.5 text-xs text-slate-800">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="font-bold text-slate-700 uppercase text-[10px] mb-1">1. Entrada (Datos Reales del Proyecto)</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  {aiV4Plan.explainability7.entrada.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="font-bold text-slate-700 uppercase text-[10px] mb-1">2. Operación Planificada</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  {aiV4Plan.explainability7.operacion.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px]">
                <p className="font-sans font-bold text-slate-700 uppercase text-[10px] mb-1">3. Parámetros Declarados</p>
                <pre className="whitespace-pre-wrap">{JSON.stringify(aiV4Plan.explainability7.parametros, null, 2)}</pre>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="font-bold text-emerald-900 uppercase text-[10px] mb-1">4. Motor Ejecutor</p>
                  <p>{aiV4Plan.explainability7.motor}</p>
                </div>
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg">
                  <p className="font-bold text-sky-900 uppercase text-[10px] mb-1">5. Resultado Esperado</p>
                  <p className="font-mono">{aiV4Plan.explainability7.resultadoEsperado}</p>
                </div>
              </div>
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p className="font-bold text-indigo-900 uppercase text-[10px] mb-1">6. Validación &amp; Reproducibilidad</p>
                <p>{aiV4Plan.explainability7.validacion}</p>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="font-bold text-amber-900 uppercase text-[10px] mb-1">7. Incertidumbre &amp; Limitaciones</p>
                <p>{aiV4Plan.explainability7.incertidumbre}</p>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowExplain4Modal(false)}
                className="px-4 py-1.5 bg-indigo-950 hover:bg-indigo-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cerrar Explicabilidad 4.0
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
