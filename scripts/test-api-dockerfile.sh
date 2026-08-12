#!/usr/bin/env bash
set -euo pipefail
file=${1:-Dockerfile.api}
test -f "$file" || { echo "missing $file" >&2; exit 1; }
grep -q "turbo prune api --docker" "$file" || { echo "Dockerfile must prune the monorepo to the API dependency graph" >&2; exit 1; }
grep -Eq "apt-get install.*python3.*make.*g\\+\\+" "$file" || { echo "Dockerfile builder must support native Bun dependencies" >&2; exit 1; }
! grep -Eq "COPY --from=builder /workspace /app|COPY \\. /app" "$file" || { echo "Dockerfile copies the complete workspace into runtime" >&2; exit 1; }
grep -q "packages/db" "$file" || { echo "Dockerfile must retain database migrations" >&2; exit 1; }
