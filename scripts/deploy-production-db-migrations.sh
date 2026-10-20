#!/bin/bash
set -euo pipefail

REPO_DIR="${1:-/Users/danny/Documents/Codex/comp-ai-crm-release-migration}"
ENV_FILE="${2:-/Users/danny/Documents/Codex/2026-09-02-you-are-operating-on-my-mac/comp-ai-crm/.env}"

if [ ! -d "$REPO_DIR/.git" ] && [ ! -f "$REPO_DIR/.git" ]; then
  echo "CRM worktree not found at: $REPO_DIR" >&2
  exit 1
fi

cd "$REPO_DIR"

echo "==> Release worktree"
git rev-parse HEAD

if [ ! -f "$ENV_FILE" ]; then
  echo "Production .env is missing at $ENV_FILE" >&2
  exit 1
fi

if ! grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  echo "DATABASE_URL is missing from $ENV_FILE" >&2
  exit 1
fi

echo "==> Installing exact dependencies"
bun --env-file="$ENV_FILE" install --frozen-lockfile

echo "==> Applying pending Prisma migrations"
bun --env-file="$ENV_FILE" run db:deploy

echo "==> Checking Prisma migration status"
bun --env-file="$ENV_FILE" run --cwd packages/db prisma migrate status

echo "==> Production database migration complete"
