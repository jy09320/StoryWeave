#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICE="${1:-}"

if [[ -n "${SERVICE}" ]]; then
  docker compose \
    --env-file "${DEPLOY_DIR}/.env" \
    -f "${DEPLOY_DIR}/docker-compose.yml" \
    logs -f --tail=200 "${SERVICE}"
else
  docker compose \
    --env-file "${DEPLOY_DIR}/.env" \
    -f "${DEPLOY_DIR}/docker-compose.yml" \
    logs -f --tail=200
fi
