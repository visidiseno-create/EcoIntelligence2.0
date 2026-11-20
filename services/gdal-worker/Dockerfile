FROM ghcr.io/osgeo/gdal:ubuntu-small-3.9.2

WORKDIR /worker

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip python3-pdal pdal libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY main.py postgis_schema.sql ./

ENV PYTHONUNBUFFERED=1
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://localhost:8081/health || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8081"]
