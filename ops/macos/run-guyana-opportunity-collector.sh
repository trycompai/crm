#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
REPO_ROOT="${SCRIPT_DIR:h:h}"
ENV_FILE="${GUYANA_COLLECTOR_ENV_FILE:-${REPO_ROOT}/.env.guyana-collector}"

if [[ ! -f "${ENV_FILE}" ]]; then
  print -u2 "Missing collector environment file: ${ENV_FILE}"
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

cd "${REPO_ROOT}/apps/api"
exec bun run guyana:collect
