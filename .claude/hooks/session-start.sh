#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

NODE_DIR=/opt/node24
if [ ! -x "$NODE_DIR/bin/node" ]; then
  VERSION=$(curl -sSL https://nodejs.org/dist/index.json | python3 -c 'import sys,json; print(next(v["version"] for v in json.load(sys.stdin) if v["version"].startswith("v24.")))')
  mkdir -p "$NODE_DIR"
  curl -sSL "https://nodejs.org/dist/$VERSION/node-$VERSION-linux-x64.tar.xz" | tar -xJ -C "$NODE_DIR" --strip-components=1
fi
export PATH="$NODE_DIR/bin:$PATH"
echo "export PATH=\"$NODE_DIR/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^BETTER_AUTH_SECRET=\"\"|BETTER_AUTH_SECRET=\"$(openssl rand -base64 32)\"|" .env
  sed -i "s|^# AGENT_URL=\"http://127.0.0.1:2000\"|AGENT_URL=\"http://127.0.0.1:2000\"|" .env
  sed -i "s|^# AGENT_BRIDGE_SECRET=\"\"|AGENT_BRIDGE_SECRET=\"$(openssl rand -base64 32)\"|" .env
  sed -i "s|^ALLOWED_SIGN_IN=\"\"|ALLOWED_SIGN_IN=\"localhost\"|" .env
fi

if ! docker info >/dev/null 2>&1; then
  nohup dockerd >/tmp/dockerd.log 2>&1 &
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi

docker compose up -d
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' crm-postgres 2>/dev/null)" = "healthy" ] && break
  sleep 1
done

bun install
bun run --filter=@crm/db db:deploy
bun run --filter=@crm/db db:seed
