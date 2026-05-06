#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

docker compose \
  --env-file "${DEPLOY_DIR}/.env" \
  -f "${DEPLOY_DIR}/docker-compose.yml" \
  down
