"""
ECOINTELLIGENCE — Microservicio Geoespacial Externo 4.1 (Production-Hardened)
Motores C++/Python reales: GDAL, OGR, PROJ, GEOS, PDAL, PostGIS, GeoPandas, Rasterio, Shapely, GeoParquet, NetCDF4, HDF5.
Se conecta a ECOINTELLIGENCE mediante GEOSPATIAL_WORKER_URL y GEOSPATIAL_WORKER_TOKEN.

Controles Enterprise implementados:
1. Healthcheck con estado real en vivo de motores y dependencias (GDAL, PROJ, GEOS, PDAL, PostGIS)
2. Autenticación Bearer compartida (WORKER_AUTH_TOKEN / GEOSPATIAL_WORKER_TOKEN) en tiempo constante
3. Aislamiento estricto por tenant (X-Organization-Id) en cola de trabajos, checkpoints, PostGIS y artefactos
4. Trace ID (X-Trace-Id) propagado en respuestas y logs JSON estructurados (sin secretos)
5. Límite de tamaño de archivos (MAX_UPLOAD_MB) y timeout de subprocesos (PROCESS_TIMEOUT_SEC)
6. Manejo de errores sanitizado (sin filtración de tracebacks, rutas internas ni DSN)
7. Cancelación cooperativa de trabajos (POST /jobs/{job_id}/cancel)
8. Checkpoints persistentes en disco por tenant y recuperación idempotente (POST /jobs/{job_id}/resume)
9. Limpieza automática por TTL y endpoint dedicado (POST /artifacts/cleanup)
"""
import os
import re
import sys
import json
import uuid
import time
import hmac
import shutil
import logging
import hashlib
import zipfile
import tempfile
import subprocess
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body, BackgroundTasks, Request
from fastapi.responses import JSONResponse, FileResponse
import geopandas as gpd
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling
import pyproj
import shapely
from shapely.geometry import box, shape, mapping
from shapely.ops import transform as shapely_transform, unary_union
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("eco_gdal_worker")

app = FastAPI(
    title="ECOINTELLIGENCE GDAL/PDAL/PostGIS Enterprise Worker",
    version="4.1.0",
)

ARTIFACT_DIR = os.environ.get("WORKER_ARTIFACT_DIR", "/tmp/eco_artifacts")
WORKER_TOKEN = os.environ.get("GEOSPATIAL_WORKER_TOKEN") or os.environ.get("WORKER_AUTH_TOKEN") or ""
MAX_UPLOAD_BYTES = int(float(os.environ.get("MAX_UPLOAD_MB", "150")) * 1024 * 1024)
PROCESS_TIMEOUT_SEC = int(os.environ.get("PROCESS_TIMEOUT_SEC", "120"))
ARTIFACT_TTL_SEC = int(os.environ.get("ARTIFACT_TTL_SECONDS", "3600"))
os.makedirs(ARTIFACT_DIR, exist_ok=True)

# Caché en memoria respaldada por persistencia JSON por tenant en ARTIFACT_DIR/<org>/jobs/
WORKER_JOBS: Dict[str, Dict[str, Any]] = {}


def sanitize_id(val: Optional[str], fallback: str = "org-1") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "_", (val or fallback).strip())
    return cleaned[:64] or fallback


def log_structured(event: str, trace_id: str, org_id: str, **extra: Any) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "service": "eco-gdal-worker",
        "event": event,
        "traceId": trace_id,
        "orgId": org_id,
        **extra,
    }
    logger.info(json.dumps(payload, default=str))


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _resolve_bin(name: str) -> Optional[str]:
    venv_bin = os.path.dirname(sys.executable)
    search_path = os.pathsep.join([venv_bin, os.environ.get("PATH", "")])
    return shutil.which(name, path=search_path)


def _subproc_env() -> Dict[str, str]:
    env = os.environ.copy()
    venv_bin = os.path.dirname(sys.executable)
    env["PATH"] = f"{venv_bin}{os.pathsep}{env.get('PATH', '')}"
    return env


def pdal_available() -> bool:
    return _resolve_bin("pdal") is not None


def ogr2ogr_available() -> bool:
    return _resolve_bin("ogr2ogr") is not None


def get_pdal_version() -> Optional[str]:
    pdal_bin = _resolve_bin("pdal")
    if not pdal_bin:
        return None
    try:
        out = subprocess.run([pdal_bin, "--version"], capture_output=True, text=True, timeout=5, env=_subproc_env())
        if out.returncode == 0:
            m = re.search(r"pdal\s+([0-9]+(?:\.[0-9]+)*)", out.stdout, re.IGNORECASE)
            if m:
                return m.group(1)
            for line in out.stdout.splitlines():
                line = line.strip()
                if line and not set(line) <= {"-"}:
                    return line
    except Exception:
        pass
    return None


def _pg_connect(dsn: str, connect_timeout: int = 4):
    try:
        import psycopg
        return psycopg.connect(dsn, connect_timeout=connect_timeout)
    except ImportError:
        import psycopg2
        return psycopg2.connect(dsn, connect_timeout=connect_timeout)


def probe_postgis() -> Dict[str, Any]:
    dsn = os.environ.get("POSTGIS_DSN", "").strip()
    if not dsn:
        return {"configured": False, "connected": False, "version": None}
    try:
        conn = _pg_connect(dsn, connect_timeout=4)
        cur = conn.cursor()
        cur.execute("SELECT PostGIS_Version();")
        row = cur.fetchone()
        cur.close()
        conn.close()
        return {"configured": True, "connected": True, "version": str(row[0]) if row else "unknown"}
    except Exception:
        return {"configured": True, "connected": False, "version": None}


def tenant_artifact_dir(org_id: str) -> str:
    d = os.path.join(ARTIFACT_DIR, sanitize_id(org_id))
    os.makedirs(d, exist_ok=True)
    return d


def tenant_jobs_dir(org_id: str) -> str:
    d = os.path.join(tenant_artifact_dir(org_id), "jobs")
    os.makedirs(d, exist_ok=True)
    return d


def _job_file_path(org_id: str, job_id: str) -> str:
    return os.path.join(tenant_jobs_dir(org_id), f"{sanitize_id(job_id, 'job')}.json")


def _save_job(record: Dict[str, Any]) -> None:
    org_id = record["organization_id"]
    job_id = record["id"]
    WORKER_JOBS[f"{org_id}:{job_id}"] = record
    fpath = _job_file_path(org_id, job_id)
    tmp = fpath + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, default=str)
    os.replace(tmp, fpath)


def _load_job(org_id: str, job_id: str) -> Optional[Dict[str, Any]]:
    key = f"{sanitize_id(org_id)}:{sanitize_id(job_id, 'job')}"
    if key in WORKER_JOBS:
        return WORKER_JOBS[key]
    fpath = _job_file_path(org_id, job_id)
    if os.path.exists(fpath):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                rec = json.load(f)
            if rec.get("organization_id") == sanitize_id(org_id):
                WORKER_JOBS[key] = rec
                return rec
        except Exception:
            return None
    return None


def _list_org_jobs(org_id: str) -> List[Dict[str, Any]]:
    safe_org = sanitize_id(org_id)
    jdir = tenant_jobs_dir(safe_org)
    items: List[Dict[str, Any]] = []
    if os.path.isdir(jdir):
        for fn in os.listdir(jdir):
            if fn.endswith(".json"):
                rec = _load_job(safe_org, fn[:-5])
                if rec:
                    items.append(rec)
    return sorted(items, key=lambda x: x.get("created_at", ""), reverse=True)


def cleanup_expired_artifacts(org_id: Optional[str] = None, max_age_sec: int = ARTIFACT_TTL_SEC) -> int:
    now = time.time()
    removed = 0
    base_dirs = (
        [os.path.join(ARTIFACT_DIR, sanitize_id(org_id))]
        if org_id
        else [os.path.join(ARTIFACT_DIR, d) for d in os.listdir(ARTIFACT_DIR)]
    )
    for d in base_dirs:
        if not os.path.isdir(d):
            continue
        for fname in os.listdir(d):
            fpath = os.path.join(d, fname)
            try:
                if os.path.isfile(fpath) and (now - os.path.getmtime(fpath)) > max_age_sec:
                    os.remove(fpath)
                    removed += 1
            except OSError:
                pass
    return removed


async def read_upload_bounded(file: UploadFile) -> bytes:
    chunks = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Archivo excede el límite máximo permitido ({MAX_UPLOAD_BYTES // (1024 * 1024)} MB).",
            )
        chunks.append(chunk)
    if total == 0:
        raise HTTPException(status_code=400, detail="El archivo cargado está vacío.")
    return b"".join(chunks)


@app.middleware("http")
async def enterprise_security_and_trace_middleware(request: Request, call_next):
    trace_id = request.headers.get("x-trace-id") or f"wtrc-{uuid.uuid4().hex[:12]}"
    org_id = sanitize_id(request.headers.get("x-organization-id"), "org-1")
    request.state.trace_id = trace_id
    request.state.org_id = org_id

    if request.url.path not in ("/health", "/ready"):
        if not WORKER_TOKEN:
            log_structured("auth_misconfigured", trace_id, org_id, path=request.url.path)
            resp = JSONResponse(
                status_code=503,
                content={"error": "Worker sin token Bearer configurado.", "traceId": trace_id},
            )
            resp.headers["x-trace-id"] = trace_id
            return resp
        auth_header = request.headers.get("authorization", "")
        expected = f"Bearer {WORKER_TOKEN}"
        if not hmac.compare_digest(auth_header.encode("utf-8"), expected.encode("utf-8")):
            log_structured("auth_rejected", trace_id, org_id, path=request.url.path)
            resp = JSONResponse(
                status_code=401,
                content={"error": "No autorizado. Token Bearer inválido o ausente.", "traceId": trace_id},
            )
            resp.headers["x-trace-id"] = trace_id
            return resp

    t0 = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log_structured("unhandled_exception", trace_id, org_id, path=request.url.path)
        response = JSONResponse(
            status_code=500,
            content={"error": "Error interno controlado en Worker geoespacial.", "traceId": trace_id},
        )
    response.headers["x-trace-id"] = trace_id
    log_structured(
        "http_request",
        trace_id,
        org_id,
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        durationMs=round((time.perf_counter() - t0) * 1000, 2),
    )
    return response


@app.get("/health")
def health(request: Request):
    pg_probe = probe_postgis()
    return {
        "status": "ok",
        "version": "4.1.0",
        "traceId": getattr(request.state, "trace_id", None),
        "auth_required": bool(WORKER_TOKEN),
        "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024),
        "process_timeout_sec": PROCESS_TIMEOUT_SEC,
        "gdal_version": rasterio.__gdal_version__,
        "proj_version": pyproj.proj_version_str,
        "geos_version": shapely.geos_version_string,
        "pdal_version": get_pdal_version(),
        "pdal_installed": pdal_available(),
        "ogr2ogr_installed": ogr2ogr_available(),
        "postgis_dsn_configured": pg_probe["configured"],
        "postgis_connected": pg_probe["connected"],
        "postgis_version": pg_probe["version"],
        "s3_endpoint_configured": bool(os.environ.get("S3_ENDPOINT_URL")),
        "supported_formats": ["GPKG", "LAZ", "LAS", "OpenFileGDB", "GeoParquet", "COG", "GeoTIFF", "NetCDF4", "HDF5", "PostGIS"],
        "engines": [
            "gdal", "ogr", "proj", "geos", "pdal",
            "rasterio", "geopandas", "shapely", "pyproj",
            "rio-cogeo", "pyogrio", "pyarrow-geoparquet",
            "laspy-lazrs", "netcdf4", "h5py", "postgis",
        ],
        "active_jobs": len([j for j in WORKER_JOBS.values() if j.get("status") == "RUNNING"]),
    }


@app.get("/ready")
def ready():
    pg_probe = probe_postgis()
    worker_token_ok = bool(WORKER_TOKEN)
    postgis_ok = (not pg_probe["configured"]) or bool(pg_probe["connected"])
    is_ready = worker_token_ok and postgis_ok
    payload = {
        "status": "ready" if is_ready else "degraded",
        "worker_auth_configured": worker_token_ok,
        "postgis_configured": pg_probe["configured"],
        "postgis_connected": pg_probe["connected"],
    }
    return JSONResponse(status_code=200 if is_ready else 503, content=payload)


@app.get("/jobs")
def list_jobs(request: Request):
    org_id = request.state.org_id
    org_jobs = _list_org_jobs(org_id)
    return {"organizationId": org_id, "total": len(org_jobs), "jobs": org_jobs}


@app.get("/jobs/{job_id}")
def get_job(job_id: str, request: Request):
    org_id = request.state.org_id
    job = _load_job(org_id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado en esta organización.")
    return job


@app.post("/jobs")
def submit_job(request: Request, payload: dict = Body(...), background_tasks: BackgroundTasks = None):
    org_id = request.state.org_id
    trace_id = request.state.trace_id
    job_id = sanitize_id(payload.get("id"), f"wjob-{uuid.uuid4().hex[:10]}")
    operation = str(payload.get("operation") or "test_o")
    record = {
        "id": job_id,
        "organization_id": org_id,
        "trace_id": trace_id,
        "operation": operation,
        "status": "QUEUED",
        "cancelled": False,
        "retries": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "started_at": None,
        "finished_at": None,
        "checkpoint": 0,
        "completed_items": [],
        "artifacts": [],
        "result": None,
        "error": None,
        "logs": [f"Job {job_id} encolado para operación {operation} [trace={trace_id}]"],
    }
    _save_job(record)
    if background_tasks is not None and operation == "test_o":
        background_tasks.add_task(_execute_test_o_job, org_id, job_id, payload)
    return record


@app.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str, request: Request):
    org_id = request.state.org_id
    job = _load_job(org_id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado en esta organización.")
    if job["status"] in ("COMPLETED", "CANCELLED"):
        return job
    job["cancelled"] = True
    job["status"] = "CANCELLED"
    job["finished_at"] = datetime.now(timezone.utc).isoformat()
    job["logs"].append(f"Cancelación solicitada en checkpoint {job['checkpoint']}%.")
    _save_job(job)
    return job


@app.post("/jobs/{job_id}/resume")
def resume_job(job_id: str, request: Request, payload: dict = Body(default={}), background_tasks: BackgroundTasks = None):
    org_id = request.state.org_id
    job = _load_job(org_id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado en esta organización.")
    if job["status"] == "COMPLETED":
        return job
    job["cancelled"] = False
    job["status"] = "QUEUED"
    job["retries"] += 1
    job["error"] = None
    job["logs"].append(f"Reanudando desde checkpoint {job['checkpoint']}% (intento #{job['retries']}).")
    _save_job(job)
    if background_tasks is not None and job["operation"] == "test_o":
        background_tasks.add_task(_execute_test_o_job, org_id, job_id, payload)
    return job


def _execute_test_o_job(org_id: str, job_id: str, payload: dict):
    job = _load_job(org_id, job_id)
    if not job or job.get("cancelled"):
        return
    job["status"] = "RUNNING"
    job["started_at"] = datetime.now(timezone.utc).isoformat()
    _save_job(job)
    try:
        res = _run_test_o_core(payload, org_id, job["trace_id"], job)
        if not job.get("cancelled"):
            job["checkpoint"] = 100
            job["status"] = "COMPLETED"
            job["result"] = res
            job["logs"].append("TEST O completado con artefactos verificados SHA-256.")
    except Exception:
        job["status"] = "FAILED"
        job["error"] = "Fallo controlado durante ejecución del trabajo geoespacial."
        job["logs"].append("Ejecución detenida de forma segura en checkpoint.")
    finally:
        job["finished_at"] = datetime.now(timezone.utc).isoformat()
        _save_job(job)


def _extract_gdb_from_zip(zip_bytes: bytes, workdir: str) -> str:
    zip_path = os.path.join(workdir, "upload.gdb.zip")
    with open(zip_path, "wb") as f:
        f.write(zip_bytes)
    extract_dir = os.path.join(workdir, "gdb_extracted")
    os.makedirs(extract_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            norm = os.path.normpath(member.filename)
            if norm.startswith("..") or os.path.isabs(norm):
                raise HTTPException(status_code=400, detail="Ruta insegura dentro del archivo ZIP.")
        zf.extractall(extract_dir)
    for root, dirs, _files in os.walk(extract_dir):
        for d in dirs:
            if d.lower().endswith(".gdb"):
                return os.path.join(root, d)
    if any(fn.endswith(".gdbtable") for fn in os.listdir(extract_dir)):
        return extract_dir
    raise HTTPException(status_code=400, detail="El ZIP no contiene una FileGeodatabase (.gdb) válida.")


@app.post("/vector/convert")
async def convert_vector(
    request: Request,
    file: UploadFile = File(...),
    target_format: str = Form("GPKG"),
    target_crs: str = Form("EPSG:4326"),
    layer: Optional[str] = Form(None),
):
    """Conversión real GDAL/OGR/GeoPandas entre GeoJSON, GPKG, OpenFileGDB (.gdb.zip), Shapefile ZIP, GML y GeoParquet."""
    org_id = request.state.org_id
    cleanup_expired_artifacts(org_id)
    fname = os.path.basename(file.filename or "input.geojson")
    lower_name = fname.lower()
    suffix = os.path.splitext(fname)[1]
    out_fmt = target_format.upper()
    raw_bytes = await read_upload_bounded(file)
    out_dir = tenant_artifact_dir(org_id)
    with tempfile.TemporaryDirectory() as tmpdir:
        if lower_name.endswith(".gdb.zip"):
            in_path = _extract_gdb_from_zip(raw_bytes, tmpdir)
        else:
            in_path = os.path.join(tmpdir, f"input{suffix}")
            with open(in_path, "wb") as f:
                f.write(raw_bytes)
        try:
            gdf = gpd.read_file(in_path, layer=layer) if layer else gpd.read_file(in_path)
            if gdf.crs and str(gdf.crs) != target_crs:
                gdf = gdf.to_crs(target_crs)
            elif not gdf.crs:
                gdf = gdf.set_crs(target_crs)

            out_id = uuid.uuid4().hex[:10]
            if out_fmt == "GEOJSON":
                out_path = os.path.join(out_dir, f"vec_{out_id}.geojson")
                gdf.to_file(out_path, driver="GeoJSON")
            elif out_fmt == "GPKG":
                out_path = os.path.join(out_dir, f"vec_{out_id}.gpkg")
                gdf.to_file(out_path, driver="GPKG", layer="ecointelligence_layer")
            elif out_fmt in ("PARQUET", "GEOPARQUET"):
                out_path = os.path.join(out_dir, f"vec_{out_id}.parquet")
                gdf.to_parquet(out_path)
            elif out_fmt in ("GDB", "OPENFILEGDB"):
                gdb_dir = os.path.join(tmpdir, f"vec_{out_id}.gdb")
                gdf.to_file(gdb_dir, driver="OpenFileGDB", layer="ecointelligence_layer")
                out_path = os.path.join(out_dir, f"vec_{out_id}.gdb.zip")
                with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
                    for root, _dirs, files in os.walk(gdb_dir):
                        for fn in files:
                            full = os.path.join(root, fn)
                            rel = os.path.relpath(full, tmpdir)
                            zf.write(full, arcname=rel)
            elif out_fmt == "GML":
                out_path = os.path.join(out_dir, f"vec_{out_id}.gml")
                gdf.to_file(out_path, driver="GML")
            elif out_fmt == "SHP":
                shp_dir = os.path.join(tmpdir, "shp_out")
                os.makedirs(shp_dir, exist_ok=True)
                shp_base = os.path.join(shp_dir, "layer.shp")
                gdf.to_file(shp_base, driver="ESRI Shapefile")
                out_path = os.path.join(out_dir, f"vec_{out_id}.zip")
                with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
                    for fn in os.listdir(shp_dir):
                        zf.write(os.path.join(shp_dir, fn), arcname=fn)
            else:
                raise HTTPException(status_code=400, detail=f"Formato no soportado: {out_fmt}")

            return {
                "organizationId": org_id,
                "traceId": request.state.trace_id,
                "format": out_fmt,
                "crs": str(gdf.crs),
                "feature_count": int(len(gdf)),
                "bounds": [float(v) for v in gdf.total_bounds] if len(gdf) else None,
                "file_name": os.path.basename(out_path),
                "file_size_bytes": os.path.getsize(out_path),
                "sha256": sha256_file(out_path),
                "download_url": f"/artifacts/{os.path.basename(out_path)}",
            }
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Error procesando archivo vectorial en GDAL/GeoPandas.")


@app.post("/vector/convert-to-geojson")
async def convert_vector_to_geojson(
    file: UploadFile = File(...),
    target_crs: str = Form("EPSG:4326"),
    layer: Optional[str] = Form(None),
):
    fname = os.path.basename(file.filename or "input.gpkg")
    suffix = os.path.splitext(fname)[1]
    raw_bytes = await read_upload_bounded(file)
    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            if fname.lower().endswith(".gdb.zip"):
                in_path = _extract_gdb_from_zip(raw_bytes, tmpdir)
            else:
                in_path = os.path.join(tmpdir, f"input{suffix}")
                with open(in_path, "wb") as f:
                    f.write(raw_bytes)
            if suffix.lower() == ".parquet":
                gdf = gpd.read_parquet(in_path)
            else:
                gdf = gpd.read_file(in_path, layer=layer) if layer else gpd.read_file(in_path)
            if gdf.crs and str(gdf.crs) != target_crs:
                gdf = gdf.to_crs(target_crs)
            return JSONResponse(content=gdf.__geo_interface__)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Error convirtiendo vector con OGR/GeoPandas.")


@app.post("/vector/bbox-query")
async def vector_bbox_query(payload: dict = Body(...)):
    try:
        fc = payload.get("featureCollection") or {}
        bbox = payload.get("bbox")
        if not bbox or len(bbox) != 4:
            raise ValueError("Se requiere bbox [minx, miny, maxx, maxy]")
        gdf = gpd.GeoDataFrame.from_features(fc.get("features", []), crs="EPSG:4326")
        if gdf.empty:
            return {"type": "FeatureCollection", "features": []}
        roi = box(float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3]))
        filtered = gdf[gdf.geometry.intersects(roi)]
        return JSONResponse(content=json.loads(filtered.to_json()))
    except Exception:
        raise HTTPException(status_code=400, detail="Error ejecutando consulta espacial BBOX.")


@app.post("/vector/spatial-join")
async def vector_spatial_join(payload: dict = Body(...)):
    try:
        left_fc = payload.get("left") or {}
        right_fc = payload.get("right") or {}
        predicate = payload.get("predicate", "intersects")
        left_gdf = gpd.GeoDataFrame.from_features(left_fc.get("features", []), crs="EPSG:4326")
        right_gdf = gpd.GeoDataFrame.from_features(right_fc.get("features", []), crs="EPSG:4326")
        joined = gpd.sjoin(left_gdf, right_gdf, how="left", predicate=predicate)
        return JSONResponse(content=json.loads(joined.to_json()))
    except Exception:
        raise HTTPException(status_code=400, detail="Error ejecutando Spatial Join.")


@app.post("/vector/geos-ops")
async def vector_geos_ops(request: Request, payload: dict = Body(...)):
    """Operaciones reales GEOS (buffer, intersection, union, difference, validity) y PROJ (EPSG:4326 <-> UTM)."""
    try:
        op = str(payload.get("operation") or "buffer").lower()
        fc_a = payload.get("a") or payload.get("featureCollection") or {}
        fc_b = payload.get("b") or {}
        utm_crs = str(payload.get("metricCrs") or "EPSG:32718")
        target_crs = str(payload.get("targetCrs") or "EPSG:4326")
        distance_m = float(payload.get("distanceMeters") or 250.0)

        gdf_a = gpd.GeoDataFrame.from_features(fc_a.get("features", []), crs="EPSG:4326")
        if gdf_a.empty:
            raise HTTPException(status_code=400, detail="La colección de entrada no contiene geometrías.")

        proj_to_utm = pyproj.Transformer.from_crs("EPSG:4326", utm_crs, always_xy=True).transform
        proj_to_target = pyproj.Transformer.from_crs(utm_crs, target_crs, always_xy=True).transform
        valid_flags = [bool(g.is_valid) for g in gdf_a.geometry]

        gdf_a_utm = gdf_a.to_crs(utm_crs)
        if op == "buffer":
            out_geoms = gdf_a_utm.geometry.buffer(distance_m)
            out_gdf = gpd.GeoDataFrame(gdf_a.drop(columns="geometry"), geometry=out_geoms, crs=utm_crs)
        elif op in ("intersection", "union", "difference"):
            gdf_b = gpd.GeoDataFrame.from_features(fc_b.get("features", []), crs="EPSG:4326")
            if gdf_b.empty:
                raise HTTPException(status_code=400, detail=f"La operación '{op}' requiere colección 'b'.")
            gdf_b_utm = gdf_b.to_crs(utm_crs)
            geom_a = unary_union(gdf_a_utm.geometry)
            geom_b = unary_union(gdf_b_utm.geometry)
            if op == "intersection":
                res_geom = geom_a.intersection(geom_b)
            elif op == "union":
                res_geom = geom_a.union(geom_b)
            else:
                res_geom = geom_a.difference(geom_b)
            out_gdf = gpd.GeoDataFrame([{"operation": op, "area_m2": float(res_geom.area)}], geometry=[res_geom], crs=utm_crs)
        elif op == "reproject":
            out_gdf = gdf_a.to_crs(target_crs)
            utm_sample = shapely_transform(proj_to_utm, gdf_a.geometry.iloc[0])
            back_sample = shapely_transform(proj_to_target, utm_sample)
            out_fc = json.loads(out_gdf.to_json())
            return {
                "engine": f"GEOS {shapely.geos_version_string} + PROJ {pyproj.proj_version_str}",
                "operation": "reproject",
                "targetCrs": target_crs,
                "validCount": sum(1 for v in valid_flags if v),
                "totalCount": len(valid_flags),
                "roundTripOriginX": float(back_sample.centroid.x),
                "featureCollection": out_fc,
                "traceId": request.state.trace_id,
            }
        else:
            raise HTTPException(status_code=400, detail=f"Operación GEOS no soportada: {op}")

        area_m2 = float(out_gdf.geometry.area.sum())
        out_target = out_gdf.to_crs(target_crs)
        return {
            "engine": f"GEOS {shapely.geos_version_string} + PROJ {pyproj.proj_version_str}",
            "operation": op,
            "metricCrs": utm_crs,
            "targetCrs": target_crs,
            "allInputGeometriesValid": all(valid_flags),
            "area_m2": round(area_m2, 3),
            "featureCount": int(len(out_target)),
            "featureCollection": json.loads(out_target.to_json()),
            "traceId": request.state.trace_id,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Error ejecutando operación GEOS/PROJ.")


@app.post("/raster/cog-inspect-and-reproject")
async def inspect_and_reproject_raster(
    request: Request,
    file: UploadFile = File(...),
    target_crs: str = Form("EPSG:4326"),
    write_output: bool = Form(False),
):
    org_id = request.state.org_id
    raw_bytes = await read_upload_bounded(file)
    suffix = os.path.splitext(os.path.basename(file.filename or "raster.tif"))[1] or ".tif"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(raw_bytes)
        tmp.flush()
        try:
            with rasterio.open(tmp.name) as src:
                transform, width, height = calculate_default_transform(
                    src.crs, target_crs, src.width, src.height, *src.bounds
                )
                result: Dict[str, Any] = {
                    "driver": src.driver,
                    "width": src.width,
                    "height": src.height,
                    "count": src.count,
                    "crs": str(src.crs),
                    "res": list(src.res),
                    "overviews": [src.overviews(i + 1) for i in range(src.count)],
                    "reprojected_shape": [height, width],
                    "target_crs": target_crs,
                    "traceId": request.state.trace_id,
                }
                if write_output:
                    out_dir = tenant_artifact_dir(org_id)
                    out_name = f"reproj_{uuid.uuid4().hex[:10]}.tif"
                    out_path = os.path.join(out_dir, out_name)
                    kwargs = src.meta.copy()
                    kwargs.update({
                        "driver": "GTiff",
                        "crs": target_crs,
                        "transform": transform,
                        "width": width,
                        "height": height,
                        "tiled": True,
                        "compress": "DEFLATE",
                    })
                    with rasterio.open(out_path, "w", **kwargs) as dst:
                        for i in range(1, src.count + 1):
                            reproject(
                                source=rasterio.band(src, i),
                                destination=rasterio.band(dst, i),
                                src_transform=src.transform,
                                src_crs=src.crs,
                                dst_transform=transform,
                                dst_crs=target_crs,
                                resampling=Resampling.bilinear,
                            )
                    result["output_file"] = out_name
                    result["output_size_bytes"] = os.path.getsize(out_path)
                    result["output_sha256"] = sha256_file(out_path)
                return result
        except Exception:
            raise HTTPException(status_code=400, detail="Error inspeccionando o reproyectando ráster con Rasterio/GDAL.")


@app.post("/raster/inspect-scientific")
async def inspect_scientific_format(request: Request, file: UploadFile = File(...)):
    """Inspección real de formatos científicos NetCDF4 (.nc) y HDF5 (.h5/.hdf5) vía netCDF4 / h5py / GDAL."""
    fname = os.path.basename(file.filename or "dataset.nc")
    ext = os.path.splitext(fname)[1].lower()
    raw_bytes = await read_upload_bounded(file)
    with tempfile.NamedTemporaryFile(suffix=ext or ".bin", delete=True) as tmp:
        tmp.write(raw_bytes)
        tmp.flush()
        try:
            if ext in (".nc", ".nc4"):
                import netCDF4
                with netCDF4.Dataset(tmp.name, "r") as ds:
                    dims = {k: len(v) for k, v in ds.dimensions.items()}
                    vars_info = {
                        k: {"shape": list(v.shape), "dtype": str(v.dtype), "units": getattr(v, "units", None)}
                        for k, v in ds.variables.items()
                    }
                    return {
                        "format": "NetCDF4",
                        "engine": f"netCDF4 {netCDF4.__version__}",
                        "dimensions": dims,
                        "variables": vars_info,
                        "sha256": hashlib.sha256(raw_bytes).hexdigest(),
                        "traceId": request.state.trace_id,
                    }
            elif ext in (".h5", ".hdf5"):
                import h5py
                from osgeo import gdal
                datasets: Dict[str, Any] = {}
                with h5py.File(tmp.name, "r") as hf:
                    def visit(name, obj):
                        if isinstance(obj, h5py.Dataset):
                            datasets[name] = {"shape": list(obj.shape), "dtype": str(obj.dtype)}
                    hf.visititems(visit)
                gd = gdal.Open(tmp.name)
                subdatasets = gd.GetSubDatasets() if gd else []
                gd = None
                return {
                    "format": "HDF5",
                    "engine": f"h5py {h5py.__version__} / HDF5 {h5py.version.hdf5_version} + GDAL {gdal.__version__}",
                    "datasets": datasets,
                    "gdal_subdatasets": [s[0] for s in subdatasets],
                    "sha256": hashlib.sha256(raw_bytes).hexdigest(),
                    "traceId": request.state.trace_id,
                }
            else:
                raise HTTPException(status_code=400, detail="Use extensión .nc para NetCDF4 o .h5/.hdf5 para HDF5.")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Error inspeccionando archivo científico NetCDF4/HDF5.")


@app.post("/pdal/inspect")
async def inspect_lidar_pdal(
    request: Request,
    file: UploadFile = File(...),
    include_points: bool = Form(False),
    max_points: int = Form(15000),
):
    """Inspección real de nubes LiDAR .las y .laz comprimidas vía PDAL CLI + Laspy/LAZRS."""
    fname = os.path.basename(file.filename or "cloud.laz")
    ext = os.path.splitext(fname)[1].lower()
    raw_bytes = await read_upload_bounded(file)
    with tempfile.NamedTemporaryFile(suffix=ext or ".laz", delete=True) as tmp:
        tmp.write(raw_bytes)
        tmp.flush()
        try:
            import laspy
            with laspy.open(tmp.name) as lf:
                hdr = lf.header
                las = lf.read()
                classes, counts = np.unique(np.asarray(las.classification), return_counts=True)
                class_hist = {str(int(c)): int(n) for c, n in zip(classes, counts)}
                bounds = [float(hdr.mins[0]), float(hdr.mins[1]), float(hdr.maxs[0]), float(hdr.maxs[1])]
                z_range = [float(hdr.mins[2]), float(hdr.maxs[2])]
                sample_points = None
                if include_points:
                    total_n = len(las.x)
                    cap = max(1, min(int(max_points), 50000))
                    step = max(1, total_n // cap) if total_n > cap else 1
                    xs = np.asarray(las.x)[::step]
                    ys = np.asarray(las.y)[::step]
                    zs = np.asarray(las.z)[::step]
                    cls_arr = np.asarray(las.classification)[::step]
                    has_int = hasattr(las, "intensity")
                    int_arr = np.asarray(las.intensity)[::step] if has_int else None
                    sample_points = [
                        {
                            "x": float(xs[i]),
                            "y": float(ys[i]),
                            "z": float(zs[i]),
                            "classification": int(cls_arr[i]),
                            "intensity": int(int_arr[i]) if int_arr is not None else 120,
                        }
                        for i in range(min(len(xs), cap))
                    ]
            pdal_summary = None
            pdal_bin = _resolve_bin("pdal")
            if pdal_bin:
                proc = subprocess.run([pdal_bin, "info", "--summary", tmp.name], capture_output=True, text=True, timeout=30, env=_subproc_env())
                if proc.returncode == 0:
                    pdal_summary = json.loads(proc.stdout).get("summary", {})
            crs_wkt = None
            try:
                crs_obj = hdr.parse_crs()
                if crs_obj:
                    crs_wkt = crs_obj.to_string()
            except Exception:
                pass
            result_payload: Dict[str, Any] = {
                "format": ext.lstrip(".").upper(),
                "engine": f"PDAL {get_pdal_version() or 'CLI'} + laspy {laspy.__version__}",
                "point_count": int(hdr.point_count),
                "bounds": bounds,
                "z_range": z_range,
                "crs": crs_wkt,
                "classification_counts": class_hist,
                "pdal_summary_points": pdal_summary.get("num_points") if pdal_summary else None,
                "sha256": hashlib.sha256(raw_bytes).hexdigest(),
                "traceId": request.state.trace_id,
            }
            if sample_points is not None:
                result_payload["sample_points"] = sample_points
            return result_payload
        except Exception:
            raise HTTPException(status_code=400, detail="Error inspeccionando nube LiDAR LAS/LAZ en PDAL/Laspy.")


@app.post("/pdal/process")
async def process_lidar_pdal(
    request: Request,
    file: UploadFile = File(...),
    resolution_m: float = Form(1.0),
    out_format: str = Form("LAZ"),
):
    """Clasificación suelo SMRF, filtrado de ruido estadístico y generación DTM GeoTIFF + LAS/LAZ con PDAL."""
    if not pdal_available():
        raise HTTPException(status_code=501, detail="PDAL CLI no disponible en este contenedor.")
    org_id = request.state.org_id
    out_dir = tenant_artifact_dir(org_id)
    suffix = os.path.splitext(os.path.basename(file.filename or "cloud.las"))[1] or ".las"
    out_ext = ".laz" if out_format.upper() == "LAZ" else ".las"
    raw_bytes = await read_upload_bounded(file)
    out_id = uuid.uuid4().hex[:10]
    with tempfile.TemporaryDirectory() as tmpdir:
        in_las = os.path.join(tmpdir, f"in{suffix}")
        out_las = os.path.join(out_dir, f"classified_{out_id}{out_ext}")
        out_dtm = os.path.join(out_dir, f"dtm_{out_id}.tif")
        with open(in_las, "wb") as f:
            f.write(raw_bytes)

        pipeline = {
            "pipeline": [
                in_las,
                {"type": "filters.outlier", "method": "statistical", "mean_k": 8, "multiplier": 2.5},
                {"type": "filters.smrf"},
                {"type": "writers.las", "filename": out_las, "compression": "laszip" if out_ext == ".laz" else "none"},
                {"type": "filters.range", "limits": "Classification[2:2]"},
                {"type": "writers.gdal", "filename": out_dtm, "resolution": float(resolution_m), "output_type": "mean"},
            ]
        }
        pipe_path = os.path.join(tmpdir, "pdal_pipe.json")
        with open(pipe_path, "w") as pf:
            json.dump(pipeline, pf)

        try:
            pdal_bin = _resolve_bin("pdal") or "pdal"
            proc = subprocess.run(
                [pdal_bin, "pipeline", pipe_path],
                capture_output=True,
                text=True,
                timeout=PROCESS_TIMEOUT_SEC,
                env=_subproc_env(),
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Tiempo de espera excedido ejecutando pipeline PDAL.")
        if proc.returncode != 0:
            raise HTTPException(status_code=400, detail="Error ejecutando pipeline PDAL sobre la nube LiDAR.")

        return {
            "status": "completed",
            "organizationId": org_id,
            "traceId": request.state.trace_id,
            "las_file": os.path.basename(out_las),
            "las_size_bytes": os.path.getsize(out_las),
            "las_sha256": sha256_file(out_las),
            "dtm_file": os.path.basename(out_dtm),
            "dtm_size_bytes": os.path.getsize(out_dtm),
            "dtm_sha256": sha256_file(out_dtm),
        }


@app.post("/postgis/spatial-ops")
def postgis_spatial_ops(request: Request, payload: dict = Body(default={})):
    """Carga geometrías aisladas por tenant en PostGIS, crea registro versionado y consulta con índice GiST."""
    dsn = os.environ.get("POSTGIS_DSN", "").strip()
    if not dsn:
        raise HTTPException(status_code=503, detail="POSTGIS_DSN no configurado en el Worker.")
    org_id = request.state.org_id
    trace_id = request.state.trace_id
    project_id = sanitize_id(payload.get("projectId"), f"proj-{org_id}")
    layer_id = sanitize_id(payload.get("layerId"), "lyr-postgis-1")
    layer_name = str(payload.get("layerName") or "Capa PostGIS")[:120]
    features = (payload.get("featureCollection") or {}).get("features") or [
        {
            "type": "Feature",
            "properties": {"id": 1, "name": "Zona GiST PostGIS"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[-76.9, -12.3], [-76.85, -12.3], [-76.85, -12.25], [-76.9, -12.25], [-76.9, -12.3]]],
            },
        }
    ]
    bbox = payload.get("bbox") or [-77.1, -12.4, -76.7, -12.1]

    t0 = time.perf_counter()
    conn = _pg_connect(dsn, connect_timeout=5)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO gis_projects (id, organization_id, code, name, domain, default_crs, area_ha)
            VALUES (%s, %s, %s, %s, %s, 'EPSG:32718', 250.0)
            ON CONFLICT (id) DO UPDATE SET updated_at = NOW();
            """,
            (project_id, org_id, project_id.upper(), f"Proyecto {project_id}", "ambiental"),
        )
        cur.execute(
            "DELETE FROM gis_vector_features WHERE organization_id = %s AND project_id = %s AND layer_id = %s;",
            (org_id, project_id, layer_id),
        )
        inserted_ids = []
        for feat in features:
            geom_json = json.dumps(feat.get("geometry"))
            props_json = json.dumps(feat.get("properties") or {})
            cur.execute(
                """
                INSERT INTO gis_vector_features (project_id, organization_id, layer_id, layer_name, properties, geom, version_no)
                VALUES (%s, %s, %s, %s, %s::jsonb, ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)), 1)
                RETURNING id;
                """,
                (project_id, org_id, layer_id, layer_name, props_json, geom_json),
            )
            fid = cur.fetchone()[0]
            inserted_ids.append(fid)
            cur.execute(
                """
                INSERT INTO gis_feature_versions (feature_id, project_id, organization_id, version_no, changed_by, properties, geom)
                SELECT id, project_id, organization_id, version_no, %s, properties, geom
                FROM gis_vector_features WHERE id = %s AND organization_id = %s;
                """,
                (trace_id, fid, org_id),
            )

        cur.execute(
            """
            SELECT id, properties, ST_AsGeoJSON(geom)::jsonb, ST_Area(geom::geography), PostGIS_Version()
            FROM gis_vector_features
            WHERE organization_id = %s
              AND project_id = %s
              AND ST_Intersects(geom, ST_MakeEnvelope(%s, %s, %s, %s, 4326));
            """,
            (org_id, project_id, float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])),
        )
        rows = cur.fetchall()
        conn.commit()
        matched_features = [
            {
                "type": "Feature",
                "id": r[0],
                "properties": {**(r[1] or {}), "postgis_area_m2": round(float(r[3] or 0.0), 2)},
                "geometry": r[2],
            }
            for r in rows
        ]
        return {
            "organizationId": org_id,
            "projectId": project_id,
            "traceId": trace_id,
            "postgis_version": rows[0][4] if rows else None,
            "insertedCount": len(inserted_ids),
            "queriedCount": len(matched_features),
            "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
            "featureCollection": {"type": "FeatureCollection", "features": matched_features},
        }
    finally:
        conn.close()


def _run_test_o_core(payload: dict, org_id: str, trace_id: str, job_state: Optional[dict] = None) -> dict:
    t0 = time.perf_counter()
    out_dir = tenant_artifact_dir(org_id)
    fc = payload.get("featureCollection") or {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"id": 1, "name": "Zona Test O", "category": "validacion"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[-76.9, -12.3], [-76.85, -12.3], [-76.85, -12.25], [-76.9, -12.25], [-76.9, -12.3]]],
                },
            }
        ],
    }

    # 1. PROJ + GEOS validation & metric UTM transform
    gdf = gpd.GeoDataFrame.from_features(fc["features"], crs="EPSG:4326")
    gdf_utm = gdf.to_crs("EPSG:32718")
    gdf_back = gdf_utm.to_crs("EPSG:4326")
    proj_roundtrip_err = float(
        abs(gdf.geometry.iloc[0].centroid.x - gdf_back.geometry.iloc[0].centroid.x)
    )
    geos_area_m2 = float(gdf_utm.geometry.buffer(50.0).area.sum())
    if job_state is not None:
        job_state["checkpoint"] = 25
        _save_job(job_state)

    out_id = uuid.uuid4().hex[:8]
    gpkg_path = os.path.join(out_dir, f"test_o_{out_id}.gpkg")
    parquet_path = os.path.join(out_dir, f"test_o_{out_id}.parquet")
    laz_path = os.path.join(out_dir, f"test_o_{out_id}.laz")

    if not job_state or "gpkg" not in job_state.get("completed_items", []):
        gdf.to_file(gpkg_path, driver="GPKG", layer="test_o_features")
        if job_state is not None:
            job_state["completed_items"].append("gpkg")
            job_state["checkpoint"] = 50
            _save_job(job_state)
    else:
        existing = [f for f in os.listdir(out_dir) if f.startswith("test_o_") and f.endswith(".gpkg")]
        if existing:
            gpkg_path = os.path.join(out_dir, existing[-1])

    if not job_state or "parquet" not in job_state.get("completed_items", []):
        gdf.to_parquet(parquet_path)
        if job_state is not None:
            job_state["completed_items"].append("parquet")
            job_state["checkpoint"] = 70
            _save_job(job_state)
    else:
        existing_pq = [f for f in os.listdir(out_dir) if f.startswith("test_o_") and f.endswith(".parquet")]
        if existing_pq:
            parquet_path = os.path.join(out_dir, existing_pq[-1])

    # 3. Real LAZ / PDAL execution
    if not job_state or "laz" not in job_state.get("completed_items", []):
        import laspy
        hdr = laspy.LasHeader(point_format=3, version="1.2")
        hdr.scales = np.array([0.001, 0.001, 0.001])
        hdr.offsets = np.array([293300.0, 8645000.0, 100.0])
        las = laspy.LasData(hdr)
        las.x = np.array([293305.0, 293310.0, 293315.0, 293320.0])
        las.y = np.array([8645010.0, 8645020.0, 8645030.0, 8645040.0])
        las.z = np.array([102.5, 104.2, 108.1, 103.0])
        las.classification = np.array([2, 2, 5, 2], dtype=np.uint8)
        las.write(laz_path)
        if job_state is not None:
            job_state["completed_items"].append("laz")
            job_state["checkpoint"] = 85
            _save_job(job_state)

    pdal_points = None
    pdal_bin = _resolve_bin("pdal")
    if pdal_bin and os.path.exists(laz_path):
        proc = subprocess.run([pdal_bin, "info", "--summary", laz_path], capture_output=True, text=True, timeout=15, env=_subproc_env())
        if proc.returncode == 0:
            pdal_points = json.loads(proc.stdout).get("summary", {}).get("num_points")

    # 4. Real PostGIS write + GiST spatial query if configured
    pg_probe = probe_postgis()
    postgis_result = None
    if pg_probe["connected"]:
        conn = _pg_connect(os.environ["POSTGIS_DSN"], connect_timeout=5)
        try:
            cur = conn.cursor()
            pid = f"testo-{sanitize_id(org_id)}"
            cur.execute(
                """
                INSERT INTO gis_projects (id, organization_id, code, name, domain, default_crs, area_ha)
                VALUES (%s, %s, %s, 'Validación TEST O PostGIS', 'geotecnia', 'EPSG:32718', 100.0)
                ON CONFLICT (id) DO UPDATE SET updated_at = NOW();
                """,
                (pid, org_id, pid.upper()),
            )
            geom_json = json.dumps(fc["features"][0]["geometry"])
            cur.execute(
                """
                INSERT INTO gis_vector_features (project_id, organization_id, layer_id, layer_name, properties, geom, version_no)
                VALUES (%s, %s, 'test-o-layer', 'TEST O Polygon', %s::jsonb, ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)), 1);
                """,
                (pid, org_id, json.dumps({"traceId": trace_id}), geom_json),
            )
            cur.execute(
                """
                SELECT COUNT(*), MAX(ST_Area(geom::geography))
                FROM gis_vector_features
                WHERE organization_id = %s AND project_id = %s
                  AND ST_Intersects(geom, ST_MakeEnvelope(-77.5, -12.8, -76.5, -11.8, 4326));
                """,
                (org_id, pid),
            )
            cnt, max_area = cur.fetchone()
            conn.commit()
            postgis_result = {
                "connected": True,
                "postgis_version": pg_probe["version"],
                "queried_rows": int(cnt or 0),
                "spatial_area_m2": round(float(max_area or 0.0), 2),
            }
        finally:
            conn.close()

    artifacts = [
        {
            "format": "GeoPackage (.gpkg)",
            "file_name": os.path.basename(gpkg_path),
            "size_bytes": os.path.getsize(gpkg_path),
            "sha256": sha256_file(gpkg_path),
            "crs": str(gdf.crs),
            "feature_count": int(len(gdf)),
        },
        {
            "format": "GeoParquet (.parquet)",
            "file_name": os.path.basename(parquet_path),
            "size_bytes": os.path.getsize(parquet_path),
            "sha256": sha256_file(parquet_path),
            "crs": str(gdf.crs),
            "feature_count": int(len(gdf)),
        },
        {
            "format": "ASPRS LAZ (.laz)",
            "file_name": os.path.basename(laz_path),
            "size_bytes": os.path.getsize(laz_path),
            "sha256": sha256_file(laz_path),
            "point_count": pdal_points,
        },
    ]

    return {
        "test": "TEST O 4.1 — Real Worker External Pipeline",
        "organizationId": org_id,
        "traceId": trace_id,
        "engines": {
            "gdal": rasterio.__gdal_version__,
            "proj": pyproj.proj_version_str,
            "geos": shapely.geos_version_string,
            "pdal": get_pdal_version(),
            "postgis": pg_probe["version"],
        },
        "proj_roundtrip_error_deg": proj_roundtrip_err,
        "geos_buffered_area_m2": round(geos_area_m2, 2),
        "pdal_available": pdal_available(),
        "pdal_verified_points": pdal_points,
        "postgis_configured": pg_probe["configured"],
        "postgis_result": postgis_result,
        "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
        "artifacts": artifacts,
    }


@app.post("/test-o/run")
def run_test_o_pipeline(request: Request, payload: dict = Body(default={})):
    """
    TEST O 4.1 Real: genera artefactos verificables con GDAL/OGR/PROJ/GEOS/PDAL/GeoPandas/PostGIS
    aislados por tenant devolviendo SHA-256 y métricas reales.
    """
    return _run_test_o_core(payload, request.state.org_id, request.state.trace_id)


@app.post("/artifacts/cleanup")
def trigger_cleanup(request: Request, max_age_sec: int = Body(default=ARTIFACT_TTL_SEC, embed=True)):
    removed = cleanup_expired_artifacts(request.state.org_id, max(0, int(max_age_sec)))
    return {"organizationId": request.state.org_id, "removedFiles": removed, "traceId": request.state.trace_id}


@app.get("/artifacts/{file_name}")
def download_artifact(file_name: str, request: Request):
    safe_name = os.path.basename(file_name)
    out_dir = tenant_artifact_dir(request.state.org_id)
    target = os.path.abspath(os.path.join(out_dir, safe_name))
    if not target.startswith(os.path.abspath(out_dir) + os.sep) or not os.path.exists(target):
        raise HTTPException(status_code=404, detail="Artefacto no encontrado en esta organización.")
    return FileResponse(target, filename=safe_name)
