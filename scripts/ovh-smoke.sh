#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-https://crm.letrasverticais.com}

curl --fail --silent --show-error --max-time 20 "$BASE_URL/health" >/dev/null
curl --fail --silent --show-error --max-time 20 "$BASE_URL/sign-in" >/dev/null

status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 20 \
	-X POST -H 'content-type: application/json' --data '{}' \
	"$BASE_URL/integrations/v1/leads")
test "$status" = 401

printf 'CRM public smoke checks passed for %s\n' "$BASE_URL"

