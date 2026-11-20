import React, { useEffect, useMemo, useState } from 'react';
import { Database, Search, Satellite, Calendar, ExternalLink } from 'lucide-react';
import { GeotechProject, computeSpectralChange } from '../../utils/geotechEngine';
import { api } from '../../services/api';
import { renderGridToDataUrl } from './GisMap2DCanvas';

interface GeoCatalogStacPanelProps {
  project: GeotechProject;
  onSelectProject: (projectId: string) => void;
}

export const GeoCatalogStacPanel: React.FC<GeoCatalogStacPanelProps> = ({
  project,
  onSelectProject,
}) => {
  const [query, setQuery] = useState<string>('');
  const [assetKind, setAssetKind] = useState<string>('all');
  const [crsFilter, setCrsFilter] = useState<string>('all');
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [loadingCat, setLoadingCat] = useState<boolean>(false);

  // STAC 2.0 Filter State
  const [stacCollection, setStacCollection] = useState<string>('sentinel-2-l2a');
  const [startDate, setStartDate] = useState<string>('2025-01-01');
  const [endDate, setEndDate] = useState<string>('2026-11-30');
  const [sensor, setSensor] = useState<string>('');
  const [maxCloudCover, setMaxCloudCover] = useState<number>(25);
  const [maxResolutionM, setMaxResolutionM] = useState<number>(30);
  const [stacLoading, setStacLoading] = useState<boolean>(false);
  const [stacResult, setStacResult] = useState<Awaited<ReturnType<typeof api.searchStacCatalog>> | null>(null);
  const [stacError, setStacError] = useState<string>('');

  const loadCatalog = async () => {
    setLoadingCat(true);
    try {
      const res = await api.getGeoCatalog({ q: query, assetKind, crs: crsFilter });
      setCatalogItems(res.items);
    } catch {
      setCatalogItems([]);
    } finally {
      setLoadingCat(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, [project.id, assetKind, crsFilter]);

  const handleStacSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setStacLoading(true);
    setStacError('');
    try {
      const res = await api.searchStacCatalog({
        bbox: project.dem.bounds,
        collection: stacCollection,
        limit: 8,
        maxCloudCover,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sensor: sensor || undefined,
        maxResolutionM,
      });
      setStacResult(res);
    } catch (err: any) {
      setStacError(err.message || 'No se pudo consultar el catálogo STAC externo.');
    } finally {
      setStacLoading(false);
    }
  };

  const temporalDiff = useMemo(() => {
    if (!project.spectralScene) return null;
    const ndvi = computeSpectralChange(project.spectralScene, 'NDVI');
    const ndwi = computeSpectralChange(project.spectralScene, 'NDWI');
    return {
      ndvi,
      ndwi,
      ndviUrl: renderGridToDataUrl(ndvi.deltaGrid),
    };
  }, [project.spectralScene]);

  return (
    <div className="space-y-5">
      {/* Unified GeoCatalog */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-700" />
              <span>GeoCatalog Unificado Empresarial ({catalogItems.length} activos indexados)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Catálogo multitenant de proyectos, capas vectoriales, DEMs, escenas satelitales, nubes LiDAR, sondeos y modelos GeoML.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar activo, fuente, proyecto..."
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-52"
            />
            <select
              value={assetKind}
              onChange={(e) => setAssetKind(e.target.value)}
              aria-label="Filtrar tipo de activo GeoCatalog"
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
            >
              <option value="all">Todos los tipos</option>
              <option value="proyecto">Proyectos</option>
              <option value="capa_vector">Capas Vectoriales</option>
              <option value="raster_dem">Rásters / DEM</option>
              <option value="escena_satelital">Escenas Satelitales</option>
              <option value="nube_lidar">Nubes LiDAR</option>
              <option value="sondeo_geotecnico">Sondeos Geotécnicos</option>
              <option value="modelo_ml">Modelos GeoML</option>
            </select>
            <select
              value={crsFilter}
              onChange={(e) => setCrsFilter(e.target.value)}
              aria-label="Filtrar CRS"
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
            >
              <option value="all">Todos CRS</option>
              <option value="EPSG:4326">EPSG:4326</option>
              <option value="EPSG:32718">EPSG:32718</option>
              <option value="EPSG:32719">EPSG:32719</option>
              <option value="EPSG:32717">EPSG:32717</option>
            </select>
            <button
              type="button"
              onClick={loadCatalog}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{loadingCat ? 'Buscando...' : 'Buscar'}</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
              <tr>
                <th className="py-2 px-3">Activo / Dataset</th>
                <th className="py-2 px-3">Tipo</th>
                <th className="py-2 px-3">Proyecto</th>
                <th className="py-2 px-3">CRS</th>
                <th className="py-2 px-3">Resolución</th>
                <th className="py-2 px-3">Fecha</th>
                <th className="py-2 px-3 text-right">Registros</th>
                <th className="py-2 px-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {catalogItems.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50">
                  <td className="py-1.5 px-3 font-semibold text-slate-900">{it.title}</td>
                  <td className="py-1.5 px-3 font-mono text-[11px] text-emerald-700">{it.assetKind}</td>
                  <td className="py-1.5 px-3 text-slate-600">{it.projectCode}</td>
                  <td className="py-1.5 px-3 font-mono text-slate-700">{it.crs}</td>
                  <td className="py-1.5 px-3 font-mono text-slate-600">{it.resolution}</td>
                  <td className="py-1.5 px-3 font-mono text-slate-500">{it.capturedDate}</td>
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums">{it.recordCount.toLocaleString()}</td>
                  <td className="py-1.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectProject(it.projectId)}
                      className="text-emerald-700 hover:underline font-semibold cursor-pointer"
                    >
                      Cargar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* STAC 2.0 Real Catalog + Temporal Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Satellite className="w-4 h-4 text-sky-700" />
              <span>STAC 2.0 — Búsqueda Real Multifecha (Element84 Copernicus)</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              BBOX: [{project.dem.bounds.map((v) => v.toFixed(3)).join(', ')}]
            </span>
          </div>

          <form onSubmit={handleStacSearch} className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <label>
              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Colección STAC</span>
              <select
                value={stacCollection}
                onChange={(e) => setStacCollection(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded"
              >
                <option value="sentinel-2-l2a">Sentinel-2 L2A (10m)</option>
                <option value="landsat-c2-l2">Landsat C2 L2 (30m)</option>
                <option value="cop-dem-glo-30">Copernicus DEM 30m</option>
              </select>
            </label>
            <label>
              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha Inicio</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono"
              />
            </label>
            <label>
              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha Fin</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono"
              />
            </label>
            <label>
              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nubosidad Máx (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={maxCloudCover}
                onChange={(e) => setMaxCloudCover(Number(e.target.value) || 25)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono"
              />
            </label>
            <label>
              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Resolución Máx (m)</span>
              <input
                type="number"
                min={5}
                max={100}
                value={maxResolutionM}
                onChange={(e) => setMaxResolutionM(Number(e.target.value) || 30)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={stacLoading}
                className="w-full py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {stacLoading ? 'Consultando STAC...' : 'Buscar Escenas STAC'}
              </button>
            </div>
          </form>

          {stacError && (
            <p className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">{stacError}</p>
          )}

          {stacResult && (
            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="py-1.5 px-2">ID Escena</th>
                    <th className="py-1.5 px-2">Fecha</th>
                    <th className="py-1.5 px-2">Sensor</th>
                    <th className="py-1.5 px-2 text-right">Nubes</th>
                    <th className="py-1.5 px-2 text-right">GSD</th>
                    <th className="py-1.5 px-2 text-right">STAC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {stacResult.items.map((it) => (
                    <tr key={it.id}>
                      <td className="py-1.5 px-2 font-semibold text-slate-800">{it.id.slice(0, 26)}</td>
                      <td className="py-1.5 px-2">{it.datetime.slice(0, 10)}</td>
                      <td className="py-1.5 px-2">{it.platform}</td>
                      <td className="py-1.5 px-2 text-right">{it.cloudCover ?? '—'}%</td>
                      <td className="py-1.5 px-2 text-right">{it.resolutionM ?? '—'} m</td>
                      <td className="py-1.5 px-2 text-right">
                        {it.selfUrl ? (
                          <a
                            href={it.selfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sky-700 hover:underline font-sans font-semibold"
                          >
                            <span>JSON</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Temporal Comparison Panel */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-700" />
            <span>Comparación Multi-Temporal T1 vs T2</span>
          </h3>
          {temporalDiff && project.spectralScene ? (
            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                Escena: <strong>{project.spectralScene.name}</strong> ({project.spectralScene.t1.date} →{' '}
                {project.spectralScene.t2.date})
              </p>
              <div className="bg-slate-950 rounded-lg p-3 flex justify-center">
                <img
                  src={temporalDiff.ndviUrl}
                  alt="Cambio Multitemporal NDVI"
                  className="w-48 h-48 object-contain rounded border border-slate-800"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded">
                  <span className="text-rose-800 block">Pérdida Vegetal ΔNDVI</span>
                  <strong className="text-rose-900">{temporalDiff.ndvi.significantLossPct}% área</strong>
                </div>
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded">
                  <span className="text-emerald-800 block">Ganancia Vegetal ΔNDVI</span>
                  <strong className="text-emerald-900">{temporalDiff.ndvi.significantGainPct}% área</strong>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">El proyecto seleccionado no contiene escena espectral bitemporal.</p>
          )}
        </div>
      </div>
    </div>
  );
};
