FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    EDGAR_PORT=2100 \
    EDGAR_DATA_DIR=/data \
    EDGAR_LOCAL_DATA_DIR=/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 edgar \
    && mkdir -p /data && chown edgar:edgar /data

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY edgar_service ./edgar_service

USER edgar
VOLUME ["/data"]
EXPOSE 2100

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://127.0.0.1:2100/health || exit 1

CMD ["sh", "-c", "uvicorn edgar_service.app:app --host 0.0.0.0 --port ${EDGAR_PORT}"]
