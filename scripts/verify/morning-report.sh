#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

green=0
total=5
for demo in scripts/verify/demo-1 scripts/verify/demo-2 scripts/verify/demo-3 scripts/verify/demo-4 scripts/verify/demo-5; do
	if "$demo" >/dev/null 2>&1; then
		green=$((green + 1))
	fi
done

fork_json="$(scripts/verify/fork-debt.sh 2>/dev/null || true)"
fork_line="$(python3 - "$fork_json" <<'PY'
import json
import sys

try:
	payload = json.loads(sys.argv[1])
	print(
		f"{payload['in_place_edit_count']} in_place_edits, "
		f"{payload['days_since_upstream_sync']} days_since_upstream_sync, "
		f"{payload['commits_behind_upstream']} commits_behind"
	)
except Exception as error:
	print(f"unavailable:fork-debt failed: {error}")
PY
)"
branch_line="$(python3 - "$fork_json" <<'PY'
import json
import sys

try:
	payload = json.loads(sys.argv[1])
	print(
		f"{payload['open_branch_count']} open_branches, "
		f"{payload['age_in_days_of_the_oldest_branch']} oldest_branch_days"
	)
except Exception as error:
	print(f"unavailable:fork-debt failed: {error}")
PY
)"

if [ -f .polly/registry.json ]; then
	work_orders_line="$(python3 - <<'PY'
import json
from datetime import datetime, timezone
from pathlib import Path

data = json.loads(Path(".polly/registry.json").read_text())
items = data if isinstance(data, list) else data.get("work_orders") or data.get("workOrders") or data.get("items")

if not isinstance(items, list):
	print("unavailable:.polly/registry.json schema unsupported")
	raise SystemExit

now = datetime.now(timezone.utc)
merged = 0
reverted = 0
open_old = 0

for item in items:
	if not isinstance(item, dict):
		continue
	status = str(item.get("status") or item.get("state") or "").lower()
	if status == "merged":
		merged += 1
	elif status == "reverted":
		reverted += 1
	elif status in {"open", "in_progress", "ready", "todo", "blocked"}:
		value = item.get("openedAt") or item.get("createdAt") or item.get("created_at")
		if isinstance(value, str):
			try:
				opened = datetime.fromisoformat(value.replace("Z", "+00:00"))
				if (now - opened).total_seconds() > 172800:
					open_old += 1
			except ValueError:
				pass

print(f"{merged} merged, {reverted} reverted, {open_old} open_over_48h")
PY
)"
else
	work_orders_line="unavailable:.polly/registry.json missing"
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
	replay_line="unavailable:DATABASE_URL missing"
else
	if scripts/verify/migrate-replay.sh >/dev/null 2>&1; then
		replay_line="pass"
	else
		replay_line="fail"
	fi
fi

printf 'demos=%s/%s green\n' "$green" "$total"
printf 'fork_debt=%s\n' "$fork_line"
printf 'work_orders=%s\n' "$work_orders_line"
printf 'fresh_db_replay=%s\n' "$replay_line"
printf 'branches=%s\n' "$branch_line"
