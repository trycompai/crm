#!/usr/bin/env bash
set -euo pipefail

demo_number="${1:-}"
contract="${2:-}"

if [ -z "$demo_number" ] || [ -z "$contract" ]; then
	printf 'NOT IMPLEMENTED demo contract missing\n' >&2
	exit 2
fi

printf 'demo_%s=NOT IMPLEMENTED\n' "$demo_number" >&2
printf 'contract=%s\n' "$contract" >&2
exit 2
