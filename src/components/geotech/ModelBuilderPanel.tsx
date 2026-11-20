import React, { useMemo, useRef, useState } from 'react';
import {
  Workflow,
  Play,
  Plus,
  Save,
  Copy,
  Download,
  Upload,
  Trash2,
  Link2,
  CheckCircle2,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import {
  DemGrid,
  GeotechProject,
  GisLayer,
  ModelBuilderGraph,
  ModelBuilderNode,
  ModelNodeKind,
} from '../../utils/geotechEngine';
import {
  executeModelBuilderGraph,
  ModelExecutionResult,
  topologicalSortModelGraph,
} from '../../utils/batchJobEngine';
import { triggerFileDownload } from './CartographyExportPanel';

interface ModelBuilderPanelProps {
  project: GeotechProject;
  canEdit: boolean;
  onUpdateGraphs: (graphs: ModelBuilderGraph[]) => void;
  onPublishRaster: (grid: DemGrid, summary: string, toolName: string) => void;
  onPublishVectorLayer: (layer: GisLayer, summary: string) => void;
}

const NODE_CATALOG: Array<{ kind: ModelNodeKind; label: string; defaultParams: Record<string, any> }> = [
  { kind: 'dem_input', label: 'Entrada DEM', defaultParams: {} },
  { kind: 'vector_input', label: 'Entrada Vector', defaultParams: {} },
  { kind: 'fill_sinks', label: 'Fill Sinks (Hidro)', defaultParams: {} },
  { kind: 'slope', label: 'Pendiente Horn (°)', defaultParams: {} },
  { kind: 'reclassify', label: 'Reclasificar Ráster', defaultParams: { threshold: 15 } },
  { kind: 'buffer', label: 'Buffer Geodésico', defaultParams: { distanceMeters: 300, dissolve: false } },
  { kind: 'intersect', label: 'Intersect Vectorial', defaultParams: {} },
  { kind: 'ahp_suitability', label: 'Aptitud AHP', defaultParams: { maxSlopeDeg: 30 } },
  { kind: 'uncertainty', label: 'Mapa Confianza', defaultParams: {} },
  { kind: 'output_layer', label: 'Capa Salida', defaultParams: { outputName: 'Resultado Modelo DAG' } },
];

const DEFAULT_FALLBACK_GRAPH: ModelBuilderGraph = {
  id: 'mb-default-30',
  name: 'Pipeline Hidrológico-Territorial Base',
  version: 'v1.0',
  description: 'DEM → Fill Sinks → Pendiente → Reclasificar >15° → AHP → Salida',
  updatedAt: new Date().toISOString().slice(0, 10),
  nodes: [
    { id: 'n1', kind: 'dem_input', label: 'DEM Proyecto', x: 50, y: 110, params: {} },
    { id: 'n2', kind: 'fill_sinks', label: 'Fill Sinks', x: 200, y: 110, params: {} },
    { id: 'n3', kind: 'slope', label: 'Pendiente (°)', x: 350, y: 110, params: {} },
    { id: 'n4', kind: 'reclassify', label: 'Umbral >= 15°', x: 500, y: 110, params: { threshold: 15 } },
    { id: 'n5', kind: 'ahp_suitability', label: 'Aptitud AHP', x: 650, y: 110, params: { maxSlopeDeg: 30 } },
    { id: 'n6', kind: 'output_layer', label: 'Salida Modelo', x: 800, y: 110, params: { outputName: 'Salida Pipeline DAG' } },
  ],
  edges: [
    { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2' },
    { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3' },
    { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4' },
    { id: 'e4', fromNodeId: 'n4', toNodeId: 'n5' },
    { id: 'e5', fromNodeId: 'n5', toNodeId: 'n6' },
  ],
};

export const ModelBuilderPanel: React.FC<ModelBuilderPanelProps> = ({
  project,
  canEdit,
  onUpdateGraphs,
  onPublishRaster,
  onPublishVectorLayer,
}) => {
  const initialGraphs = useMemo(
    () => (project.modelGraphs && project.modelGraphs.length > 0 ? project.modelGraphs : [DEFAULT_FALLBACK_GRAPH]),
    [project.modelGraphs]
  );

  const [graphs, setGraphs] = useState<ModelBuilderGraph[]>(initialGraphs);
  const [activeGraphId, setActiveGraphId] = useState<string>(initialGraphs[0].id);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(initialGraphs[0].nodes[0]?.id || '');
  const [connectFromId, setConnectFromId] = useState<string>(initialGraphs[0].nodes[0]?.id || '');
  const [connectToId, setConnectToId] = useState<string>(initialGraphs[0].nodes[1]?.id || '');
  const [execResult, setExecResult] = useState<ModelExecutionResult | null>(null);
  const [graphError, setGraphError] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string>('');
  const importRef = useRef<HTMLInputElement | null>(null);

  const activeGraph = useMemo(
    () => graphs.find((g) => g.id === activeGraphId) || graphs[0],
    [graphs, activeGraphId]
  );

  const selectedNode = useMemo(
    () => activeGraph.nodes.find((n) => n.id === selectedNodeId) || null,
    [activeGraph, selectedNodeId]
  );

  const topologicalOrder = useMemo(() => {
    try {
      return topologicalSortModelGraph(activeGraph);
    } catch {
      return null;
    }
  }, [activeGraph]);

  const mutateActiveGraph = (updater: (g: ModelBuilderGraph) => ModelBuilderGraph) => {
    const next = graphs.map((g) =>
      g.id === activeGraph.id ? { ...updater(g), updatedAt: new Date().toISOString().slice(0, 10) } : g
    );
    setGraphs(next);
    setGraphError('');
  };

  const handleAddNode = (kind: ModelNodeKind) => {
    if (!canEdit) return;
    const meta = NODE_CATALOG.find((c) => c.kind === kind)!;
    const count = activeGraph.nodes.length;
    const newNode: ModelBuilderNode = {
      id: `n-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      kind,
      label: meta.label,
      x: 70 + ((count % 5) * 165),
      y: count >= 5 ? 210 : 80,
      params: { ...meta.defaultParams },
    };
    const lastNode = activeGraph.nodes[activeGraph.nodes.length - 1];
    mutateActiveGraph((g) => ({
      ...g,
      nodes: [...g.nodes, newNode],
      edges: lastNode
        ? [...g.edges, { id: `e-${Date.now()}`, fromNodeId: lastNode.id, toNodeId: newNode.id }]
        : g.edges,
    }));
    setSelectedNodeId(newNode.id);
    setStatusMsg(`Nodo "${meta.label}" añadido al grafo.`);
  };

  const handleConnectNodes = () => {
    if (!canEdit || !connectFromId || !connectToId || connectFromId === connectToId) return;
    if (activeGraph.edges.some((e) => e.fromNodeId === connectFromId && e.toNodeId === connectToId)) return;
    const candidate: ModelBuilderGraph = {
      ...activeGraph,
      edges: [...activeGraph.edges, { id: `e-${Date.now()}`, fromNodeId: connectFromId, toNodeId: connectToId }],
    };
    try {
      topologicalSortModelGraph(candidate);
      mutateActiveGraph(() => candidate);
      setStatusMsg('Conexión DAG añadida.');
    } catch (err: any) {
      setGraphError(err.message || 'La conexión introduciría un ciclo cerrado inválido.');
    }
  };

  const handleRemoveNode = (nodeId: string) => {
    if (!canEdit || activeGraph.nodes.length <= 1) return;
    mutateActiveGraph((g) => ({
      ...g,
      nodes: g.nodes.filter((n) => n.id !== nodeId),
      edges: g.edges.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId),
    }));
    if (selectedNodeId === nodeId) setSelectedNodeId('');
  };

  const handleExecuteGraph = () => {
    setGraphError('');
    setStatusMsg('');
    try {
      const res = executeModelBuilderGraph(activeGraph, project);
      setExecResult(res);
      setStatusMsg(
        `Pipeline "${activeGraph.name}" ejecutado (${res.executionOrder.length} nodos en ${res.totalDurationMs} ms).`
      );
    } catch (err: any) {
      setGraphError(err.message || 'Error ejecutando modelo geoespacial.');
    }
  };

  const handleSaveGraphToProject = (bumpVersion: boolean = false) => {
    if (!canEdit) return;
    let nextGraphs = [...graphs];
    if (bumpVersion) {
      const num = parseFloat(activeGraph.version.replace('v', '')) || 1.0;
      const nextVer = `v${(num + 0.1).toFixed(1)}`;
      nextGraphs = nextGraphs.map((g) => (g.id === activeGraph.id ? { ...g, version: nextVer } : g));
      setGraphs(nextGraphs);
    }
    onUpdateGraphs(nextGraphs);
    setStatusMsg(
      bumpVersion
        ? `Modelo versionado y guardado en proyecto (pulse Guardar Cambios* para persistir en servidor).`
        : `Modelos DAG sincronizados con el proyecto activo.`
    );
  };

  const handleDuplicateGraph = () => {
    if (!canEdit) return;
    const copy: ModelBuilderGraph = {
      ...structuredClone(activeGraph),
      id: `mb-${Date.now()}`,
      name: `${activeGraph.name} (Copia)`,
      version: 'v1.0',
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    const next = [copy, ...graphs];
    setGraphs(next);
    setActiveGraphId(copy.id);
    onUpdateGraphs(next);
    setStatusMsg(`Modelo "${copy.name}" duplicado.`);
  };

  const handleImportJson = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ModelBuilderGraph;
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
          throw new Error('Estructura JSON de Model Builder no válida.');
        }
        topologicalSortModelGraph(parsed);
        const imported: ModelBuilderGraph = {
          ...parsed,
          id: `mb-imp-${Date.now()}`,
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        const next = [imported, ...graphs];
        setGraphs(next);
        setActiveGraphId(imported.id);
        onUpdateGraphs(next);
        setStatusMsg(`Modelo "${imported.name}" importado correctamente.`);
      } catch (err: any) {
        setGraphError(err.message || 'No se pudo importar el archivo JSON del modelo.');
      }
    };
    reader.readAsText(file);
    ev.target.value = '';
  };

  const nodeMap = useMemo(() => new Map(activeGraph.nodes.map((n) => [n.id, n])), [activeGraph.nodes]);
  const traceMap = useMemo(
    () => new Map((execResult?.traces || []).map((t) => [t.nodeId, t])),
    [execResult]
  );

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Workflow className="w-4 h-4 text-emerald-700" />
          <span className="text-xs font-bold text-slate-900">Model Builder Geoespacial (DAG):</span>
          <select
            value={activeGraph.id}
            onChange={(e) => {
              setActiveGraphId(e.target.value);
              setExecResult(null);
            }}
            aria-label="Seleccionar flujo Model Builder"
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
          >
            {graphs.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.version})
              </option>
            ))}
          </select>
          <span className="text-[11px] font-mono text-slate-500">
            {activeGraph.nodes.length} nodos · {activeGraph.edges.length} enlaces ·{' '}
            {topologicalOrder ? 'DAG Acíclico Válido' : 'Ciclo Inválido'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExecuteGraph}
            className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Ejecutar Pipeline DAG</span>
          </button>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => handleSaveGraphToProject(true)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar Versión</span>
              </button>
              <button
                type="button"
                onClick={handleDuplicateGraph}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicar</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() =>
              triggerFileDownload(
                `${activeGraph.name.replace(/\s+/g, '_')}_${activeGraph.version}.json`,
                JSON.stringify(activeGraph, null, 2),
                'application/json'
              )
            }
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar JSON</span>
          </button>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Importar JSON</span>
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportJson}
                className="hidden"
              />
            </>
          )}
        </div>
      </div>

      {graphError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
          <span>{graphError}</span>
        </div>
      )}

      {statusMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-950 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Visual Node-Graph DAG Canvas + Palette */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Lienzo Visual de Flujo Geoespacial ({activeGraph.name})
            </h3>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <select
                  value={connectFromId}
                  onChange={(e) => setConnectFromId(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                >
                  {activeGraph.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      De: {n.label}
                    </option>
                  ))}
                </select>
                <select
                  value={connectToId}
                  onChange={(e) => setConnectToId(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                >
                  {activeGraph.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      A: {n.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleConnectNodes}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Link2 className="w-3 h-3" />
                  <span>Conectar</span>
                </button>
              </div>
            )}
          </div>

          {/* Interactive SVG DAG Canvas */}
          <div className="overflow-x-auto bg-slate-950 rounded-lg border border-slate-800 p-2">
            <svg viewBox="0 0 960 300" className="w-full min-w-[720px] h-[270px]">
              <defs>
                <marker id="dag-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#34d399" />
                </marker>
              </defs>

              {/* Edges */}
              {activeGraph.edges.map((edge) => {
                const src = nodeMap.get(edge.fromNodeId);
                const dst = nodeMap.get(edge.toNodeId);
                if (!src || !dst) return null;
                const x1 = src.x + 122;
                const y1 = src.y + 26;
                const x2 = dst.x - 4;
                const y2 = dst.y + 26;
                return (
                  <path
                    key={edge.id}
                    d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    markerEnd="url(#dag-arrow)"
                  />
                );
              })}

              {/* Nodes */}
              {activeGraph.nodes.map((node) => {
                const isSel = node.id === selectedNodeId;
                const trace = traceMap.get(node.id);
                const strokeColor =
                  trace?.status === 'completado'
                    ? '#10b981'
                    : trace?.status === 'error'
                    ? '#f43f5e'
                    : isSel
                    ? '#38bdf8'
                    : '#475569';

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={() => setSelectedNodeId(node.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      width="122"
                      height="52"
                      rx="8"
                      fill={isSel ? '#1e293b' : '#0f172a'}
                      stroke={strokeColor}
                      strokeWidth={isSel ? '2.5' : '1.5'}
                    />
                    <text x="10" y="20" fontSize="9" fontWeight="bold" fill="#94a3b8">
                      {node.kind.toUpperCase()}
                    </text>
                    <text x="10" y="37" fontSize="11" fontWeight="bold" fill="#f8fafc">
                      {node.label.slice(0, 17)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Add Node Palette */}
          {canEdit && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-slate-600 uppercase">Agregar Nodo Geoespacial al DAG:</p>
              <div className="flex flex-wrap gap-1.5">
                {NODE_CATALOG.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => handleAddNode(item.kind)}
                    className="px-2.5 py-1 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg text-[11px] font-semibold text-slate-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-emerald-700" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Node Inspector & Parameters */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Inspector de Nodo &amp; Parámetros
            </h3>
            {selectedNode && canEdit && activeGraph.nodes.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveNode(selectedNode.id)}
                className="text-rose-600 hover:text-rose-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar</span>
              </button>
            )}
          </div>

          {selectedNode ? (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Etiqueta del Nodo</label>
                <input
                  type="text"
                  value={selectedNode.label}
                  disabled={!canEdit}
                  onChange={(e) =>
                    mutateActiveGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((n) => (n.id === selectedNode.id ? { ...n, label: e.target.value } : n)),
                    }))
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px]">
                  <span className="text-slate-500">Posición X</span>
                  <input
                    type="number"
                    value={selectedNode.x}
                    disabled={!canEdit}
                    onChange={(e) =>
                      mutateActiveGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id ? { ...n, x: Number(e.target.value) || 40 } : n
                        ),
                      }))
                    }
                    className="w-full px-2 py-1 border border-slate-300 rounded font-mono"
                  />
                </label>
                <label className="block text-[11px]">
                  <span className="text-slate-500">Posición Y</span>
                  <input
                    type="number"
                    value={selectedNode.y}
                    disabled={!canEdit}
                    onChange={(e) =>
                      mutateActiveGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id ? { ...n, y: Number(e.target.value) || 80 } : n
                        ),
                      }))
                    }
                    className="w-full px-2 py-1 border border-slate-300 rounded font-mono"
                  />
                </label>
              </div>

              {selectedNode.kind === 'reclassify' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Umbral Crítico (&gt;=)</label>
                  <input
                    type="number"
                    value={selectedNode.params.threshold ?? 15}
                    disabled={!canEdit}
                    onChange={(e) =>
                      mutateActiveGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, threshold: Number(e.target.value) } }
                            : n
                        ),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              )}

              {selectedNode.kind === 'buffer' && (
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-slate-600">Distancia Geodésica (m)</label>
                  <input
                    type="number"
                    min={10}
                    max={50000}
                    value={selectedNode.params.distanceMeters ?? 300}
                    disabled={!canEdit}
                    onChange={(e) =>
                      mutateActiveGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, distanceMeters: Number(e.target.value) || 300 } }
                            : n
                        ),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              )}

              {selectedNode.kind === 'ahp_suitability' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Pendiente Máxima Restricción (°)
                  </label>
                  <input
                    type="number"
                    value={selectedNode.params.maxSlopeDeg ?? 30}
                    disabled={!canEdit}
                    onChange={(e) =>
                      mutateActiveGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, maxSlopeDeg: Number(e.target.value) || 30 } }
                            : n
                        ),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              )}

              {selectedNode.kind === 'output_layer' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nombre Capa Salida</label>
                  <input
                    type="text"
                    value={selectedNode.params.outputName ?? ''}
                    disabled={!canEdit}
                    onChange={(e) =>
                      mutateActiveGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, outputName: e.target.value } }
                            : n
                        ),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              )}

              {selectedNode.kind === 'vector_input' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Capa Vectorial Fuente</label>
                  <select
                    value={selectedNode.params.layerId || ''}
                    disabled={!canEdit}
                    onChange={(e) =>
                      mutateActiveGraph((g) => ({
                        ...g,
                        nodes: g.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, params: { ...n.params, layerId: e.target.value } }
                            : n
                        ),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="">Primera capa vectorial disponible</option>
                    {project.layers
                      .filter((l) => l.kind === 'vector')
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-500">Haga clic sobre un nodo del lienzo DAG para configurar sus parámetros.</p>
          )}
        </div>
      </div>

      {/* Execution Trace & Precision Envelope */}
      {execResult && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Traza de Ejecución Reproducible ({execResult.totalDurationMs} ms)
              </h3>
              <p className="text-[11px] font-mono text-slate-500">
                Método: {execResult.precisionEnvelope.method} · CRS: {execResult.precisionEnvelope.crs} · Exactitud:{' '}
                {execResult.precisionEnvelope.estimatedAccuracy}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {execResult.producedRasters.slice(-2).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() =>
                    onPublishRaster(r, `Producto "${r.name}" generado por Model Builder DAG.`, activeGraph.name)
                  }
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Publicar Ráster: {r.name.slice(0, 26)}</span>
                </button>
              ))}
              {execResult.producedLayers.map((lyr) => (
                <button
                  key={lyr.id}
                  type="button"
                  onClick={() =>
                    onPublishVectorLayer(lyr, `Capa vectorial "${lyr.name}" generada por Model Builder DAG.`)
                  }
                  className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Publicar Vector: {lyr.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="py-2 px-3">Paso</th>
                  <th className="py-2 px-3">Nodo / Operador</th>
                  <th className="py-2 px-3">Estado</th>
                  <th className="py-2 px-3">Resumen Técnico</th>
                  <th className="py-2 px-3 text-right">Duración</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {execResult.traces.map((t, i) => (
                  <tr key={t.nodeId}>
                    <td className="py-1.5 px-3 font-mono text-slate-500">{i + 1}</td>
                    <td className="py-1.5 px-3 font-semibold text-slate-900">{t.label}</td>
                    <td className="py-1.5 px-3 font-mono text-emerald-700">{t.status.toUpperCase()}</td>
                    <td className="py-1.5 px-3 text-slate-700">{t.summary}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-600">{t.durationMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
