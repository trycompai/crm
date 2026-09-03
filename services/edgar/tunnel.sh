#!/usr/bin/env sh
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
PORT=${EDGAR_PORT:-2100}
IDENTITY=${EDGAR_IDENTITY:-}
SECRET=${EDGAR_SECRET:-}
DATA_DIR=${EDGAR_DATA_DIR:-"$HERE/.cache"}
RUNTIME=${EDGAR_RUNTIME:-auto}

if [ -z "$IDENTITY" ]; then
  echo "EDGAR_IDENTITY is required: the SEC asks every automated client for a name and a real email." >&2
  echo "  EDGAR_IDENTITY=\"Jane Doe jane@example.com\" $0" >&2
  exit 1
fi

if [ -z "$SECRET" ]; then
  SECRET=$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
fi

mkdir -p "$DATA_DIR"

if [ "$RUNTIME" = auto ]; then
  if command -v docker >/dev/null 2>&1; then RUNTIME=docker; else RUNTIME=python; fi
fi

cleanup() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ "$RUNTIME" = docker ] && docker rm -f crm-edgar-tunnel >/dev/null 2>&1 || true
  [ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

case "$RUNTIME" in
  docker)
    docker build -q -t crm-edgar "$HERE" >/dev/null
    docker rm -f crm-edgar-tunnel >/dev/null 2>&1 || true
    docker run -d --name crm-edgar-tunnel -p "127.0.0.1:$PORT:2100" \
      -e EDGAR_IDENTITY="$IDENTITY" -e EDGAR_SECRET="$SECRET" \
      -v "$DATA_DIR:/data" crm-edgar >/dev/null
    ;;
  python)
    if [ ! -x "$HERE/.venv/bin/python" ]; then
      python3 -m venv "$HERE/.venv"
      "$HERE/.venv/bin/pip" install -q -r "$HERE/requirements.txt"
    fi
    PYTHONPATH="$HERE" EDGAR_IDENTITY="$IDENTITY" EDGAR_SECRET="$SECRET" \
      EDGAR_DATA_DIR="$DATA_DIR" EDGAR_LOCAL_DATA_DIR="$DATA_DIR" \
      "$HERE/.venv/bin/python" -m uvicorn edgar_service.app:app --host 127.0.0.1 --port "$PORT" >"$DATA_DIR/uvicorn.log" 2>&1 &
    SERVER_PID=$!
    ;;
  *)
    echo "EDGAR_RUNTIME must be docker or python." >&2
    exit 1
    ;;
esac

i=0
until curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "The service did not answer on port $PORT." >&2
    exit 1
  fi
  sleep 1
done

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is required: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >"$DATA_DIR/tunnel.log" 2>&1 &
TUNNEL_PID=$!

URL=""
i=0
while [ -z "$URL" ]; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "The tunnel did not come up. See $DATA_DIR/tunnel.log." >&2
    exit 1
  fi
  sleep 1
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$DATA_DIR/tunnel.log" | head -1 || true)
done

echo
echo "Set these on the CRM (Vercel → crm-agent and crm-app, or the local .env), then redeploy:"
echo "EDGAR_URL=$URL"
echo "EDGAR_SECRET=$SECRET"
echo
echo "The service and the tunnel live as long as this shell does. Ctrl-C stops both."
wait "$TUNNEL_PID"
