#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${DEPLOY_DIR}/backups"

mkdir -p "${BACKUP_DIR}"

set -a
source "${DEPLOY_DIR}/.env"
set +a

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="${BACKUP_DIR}/storyweave-${TIMESTAMP}.sql"

docker compose \
  --env-file "${DEPLOY_DIR}/.env" \
  -f "${DEPLOY_DIR}/docker-compose.yml" \
  exec -T db pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" > "${OUTPUT_FILE}"

echo "数据库备份已生成: ${OUTPUT_FILE}"
