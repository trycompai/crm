#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

discovery_output="$(git log --all --diff-filter=A --name-only -- '*agent_task_state_integrity*')"
printf 'migration_discovery_command=%s\n' "git log --all --diff-filter=A --name-only -- '*agent_task_state_integrity*'"
if [ -n "$discovery_output" ]; then
	printf 'migration_discovery_output<<EOF\n%s\nEOF\n' "$discovery_output"
else
	printf 'migration_discovery_output=NONE\n'
fi

env_database_url="${DATABASE_URL:-}"
if [ -z "$env_database_url" ]; then
	for env_file in .env.local .env; do
		if [ -f "$env_file" ]; then
			env_database_url="$(python3 - "$env_file" <<'PY'
import sys
from pathlib import Path

for line in Path(sys.argv[1]).read_text().splitlines():
	stripped = line.strip()
	if not stripped or stripped.startswith("#") or "=" not in stripped:
		continue
	key, value = stripped.split("=", 1)
	if key.strip() == "DATABASE_URL":
		value = value.strip().strip("'").strip('"')
		print(value)
		break
PY
)"
			if [ -n "$env_database_url" ]; then
				break
			fi
		fi
	done
fi

if [ -z "$env_database_url" ]; then
	printf 'fresh_db_replay=fail\n'
	printf 'reason=DATABASE_URL is not set and no root .env value was found\n'
	exit 1
fi

scratch_file="$(mktemp)"
name_file="$(mktemp)"
trap 'rm -f "$scratch_file" "$name_file"' EXIT

(
cd packages/db
REPLAY_BASE_DATABASE_URL="$env_database_url" \
REPLAY_SCRATCH_URL_FILE="$scratch_file" \
REPLAY_SCRATCH_NAME_FILE="$name_file" \
bun run --silent - <<'TS'
import { writeFileSync } from "node:fs";
import { Client } from "pg";

const baseValue = process.env.REPLAY_BASE_DATABASE_URL;
const scratchFile = process.env.REPLAY_SCRATCH_URL_FILE;
const nameFile = process.env.REPLAY_SCRATCH_NAME_FILE;

if (!baseValue || !scratchFile || !nameFile) {
	console.error("scratch database setup is missing required environment");
	process.exit(1);
}

const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const base = new URL(baseValue);
const host = base.hostname;

if (!localHosts.has(host) && process.env.ALLOW_REMOTE_DB !== "1") {
	console.error(`refusing to create scratch database on non-local host ${host}`);
	process.exit(1);
}

const sourceName = decodeURIComponent(base.pathname.replace(/^\//, ""));
const requestedName = process.env.MIGRATE_REPLAY_DATABASE_NAME;
const fallbackName = `${sourceName || "crm"}_migrate_replay`;
const scratchName = requestedName || fallbackName.replace(/[^A-Za-z0-9_]/g, "_");

if (!/(migrate_replay|scratch|test)/.test(scratchName)) {
	console.error("scratch database name must contain migrate_replay, scratch, or test");
	process.exit(1);
}

if (scratchName === sourceName) {
	console.error("scratch database name must not match source database name");
	process.exit(1);
}

const adminUrl = new URL(base.toString());
adminUrl.pathname = "/postgres";

const scratchUrl = new URL(base.toString());
scratchUrl.pathname = `/${encodeURIComponent(scratchName)}`;

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const client = new Client({ connectionString: adminUrl.toString() });

await client.connect();

try {
	await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(scratchName)} WITH (FORCE)`);
} catch (error) {
	await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(scratchName)}`);
}

await client.query(`CREATE DATABASE ${quoteIdentifier(scratchName)}`);
await client.end();

writeFileSync(scratchFile, scratchUrl.toString(), { mode: 0o600 });
writeFileSync(nameFile, scratchName, { mode: 0o600 });
console.log(`scratch_database=${scratchName}`);
TS
)

scratch_url="$(cat "$scratch_file")"

set +e
DATABASE_URL="$scratch_url" bun run --filter=@crm/db db:deploy
status=$?
set -e

if [ "$status" -eq 0 ]; then
	printf 'fresh_db_replay=pass\n'
	exit 0
fi

printf 'fresh_db_replay=fail\n'
printf 'scratch_database=%s\n' "$(cat "$name_file")"
exit "$status"
