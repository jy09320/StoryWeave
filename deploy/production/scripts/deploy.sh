#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${DEPLOY_DIR}/.env" ]]; then
  echo "缺少 ${DEPLOY_DIR}/.env"
  echo "先执行: cp ${DEPLOY_DIR}/.env.example ${DEPLOY_DIR}/.env"
  exit 1
fi

docker compose \
  --env-file "${DEPLOY_DIR}/.env" \
  -f "${DEPLOY_DIR}/docker-compose.yml" \
  up -d --build

echo "部署完成。"
