#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=${APP_ROOT:-/srv/letrasverticais-crm}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
COMPOSE_FILE=${COMPOSE_FILE:-$APP_ROOT/current/docker-compose.ovh.yml}
BACKUP_DIR=${BACKUP_DIR:-$APP_ROOT/backups}

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$BACKUP_DIR/crm-$timestamp.dump"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
	sh -ec 'pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" "$POSTGRES_DB"' \
	>"$target"

test -s "$target"
chmod 600 "$target"
find "$BACKUP_DIR" -type f -name 'crm-*.dump' -mtime +14 -delete
printf 'CRM backup verified: %s\n' "$target"

