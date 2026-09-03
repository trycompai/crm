#!/bin/bash
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

AGENT_REACH_HOME="$HOME/.agent-reach"
AGENT_REACH_TOOLS="$AGENT_REACH_HOME/tools"
AGENT_REACH_VENV="$HOME/.agent-reach-venv"
AGENT_REACH_REPO="https://github.com/Panniantong/agent-reach.git"
XHS_REPO="https://github.com/xpzouying/xiaohongshu-mcp.git"
XHS_PORT=18060
YTDLP_CONFIG="$HOME/.config/yt-dlp/config"
MCPORTER_CONFIG="$HOME/.mcporter/mcporter.json"
LOCAL_BIN="$HOME/.local/bin"

export PATH="$AGENT_REACH_VENV/bin:$LOCAL_BIN:$PATH"

log() { echo "[agent-reach hook] $*"; }

step() {
  local name="$1"
  shift
  if "$@"; then
    log "ok: $name"
  else
    log "failed: $name (continuing)"
  fi
}

install_agent_reach() {
  mkdir -p "$AGENT_REACH_TOOLS"
  if [ ! -d "$AGENT_REACH_TOOLS/agent-reach/.git" ]; then
    git clone -q --depth 1 "$AGENT_REACH_REPO" "$AGENT_REACH_TOOLS/agent-reach"
  else
    git -C "$AGENT_REACH_TOOLS/agent-reach" pull -q --ff-only || true
  fi
  [ -x "$AGENT_REACH_VENV/bin/pip" ] || python3 -m venv "$AGENT_REACH_VENV"
  "$AGENT_REACH_VENV/bin/pip" install -q "$AGENT_REACH_TOOLS/agent-reach"
}

install_apt_tools() {
  local missing=()
  command -v gh >/dev/null || missing+=(gh)
  command -v ffmpeg >/dev/null || missing+=(ffmpeg)
  [ "${#missing[@]}" -eq 0 ] && return 0
  apt-get update -q >/dev/null 2>&1
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q "${missing[@]}" >/dev/null 2>&1
}

install_mcporter() {
  command -v mcporter >/dev/null || npm install -g mcporter >/dev/null 2>&1
}

mcporter_has() {
  [ -f "$MCPORTER_CONFIG" ] && grep -q "\"$1\"" "$MCPORTER_CONFIG"
}

configure_mcporter() {
  mcporter_has exa || mcporter config add exa https://mcp.exa.ai/mcp --scope home >/dev/null
  mcporter_has linkedin || mcporter config add linkedin --command uvx --arg mcp-server-linkedin@latest --env UV_HTTP_TIMEOUT=300 --scope home >/dev/null
  mcporter_has xiaohongshu || mcporter config add xiaohongshu "http://localhost:$XHS_PORT/mcp" --scope home >/dev/null
}

configure_ytdlp() {
  mkdir -p "$(dirname "$YTDLP_CONFIG")"
  grep -qxF -- '--js-runtimes node' "$YTDLP_CONFIG" 2>/dev/null || printf '%s\n' '--js-runtimes node' >> "$YTDLP_CONFIG"
}

install_channels() {
  agent-reach install --env=auto --system --channels=all >/dev/null 2>&1 || true
  return 0
}

build_xiaohongshu() {
  [ -x "$AGENT_REACH_TOOLS/xiaohongshu-mcp" ] && return 0
  command -v go >/dev/null || return 1
  [ -d "$AGENT_REACH_TOOLS/xiaohongshu-mcp-src/.git" ] || git clone -q --depth 1 "$XHS_REPO" "$AGENT_REACH_TOOLS/xiaohongshu-mcp-src"
  (cd "$AGENT_REACH_TOOLS/xiaohongshu-mcp-src" && CGO_ENABLED=0 go build -o "$AGENT_REACH_TOOLS/xiaohongshu-mcp" . && CGO_ENABLED=0 go build -o "$AGENT_REACH_TOOLS/xiaohongshu-login" ./cmd/login) >/dev/null 2>&1
}

export_path() {
  [ -n "${CLAUDE_ENV_FILE:-}" ] || return 0
  echo "export PATH=\"$AGENT_REACH_VENV/bin:$LOCAL_BIN:\$PATH\"" >> "$CLAUDE_ENV_FILE"
}

step "agent-reach package" install_agent_reach
step "gh + ffmpeg" install_apt_tools
step "mcporter" install_mcporter
step "mcporter servers" configure_mcporter
step "yt-dlp config" configure_ytdlp
step "optional channels" install_channels
step "xiaohongshu-mcp build" build_xiaohongshu
step "PATH" export_path

agent-reach doctor 2>/dev/null | grep -E '^状态' || true
exit 0
