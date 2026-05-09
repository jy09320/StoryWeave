#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env"
EXAMPLE_FILE="${DEPLOY_DIR}/.env.example"

if [[ -f "${ENV_FILE}" ]]; then
  echo "${ENV_FILE} already exists, skipping initialization."
  exit 0
fi

cp "${EXAMPLE_FILE}" "${ENV_FILE}"

if command -v openssl >/dev/null 2>&1; then
  JWT_SECRET="$(openssl rand -hex 32)"
  DB_PASSWORD="$(openssl rand -hex 16)"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${ENV_FILE}" "${JWT_SECRET}" "${DB_PASSWORD}" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
jwt_secret = sys.argv[2]
db_password = sys.argv[3]
text = path.read_text(encoding="utf-8")
text = text.replace("JWT_SECRET_KEY=change-this-jwt-secret", f"JWT_SECRET_KEY={jwt_secret}")
text = text.replace("POSTGRES_PASSWORD=change-this-db-password", f"POSTGRES_PASSWORD={db_password}")
path.write_text(text, encoding="utf-8")
PY
  fi
fi

echo "Created ${ENV_FILE}"
echo "Next, fill in at least APP_DOMAIN, ACME_EMAIL, and one AI API key."
