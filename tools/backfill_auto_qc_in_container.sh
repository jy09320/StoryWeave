#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${DAQ_BACKEND_CONTAINER:-engram_daq_backend}"

docker exec -i "${CONTAINER_NAME}" python3 -m backend.tools.backfill_auto_qc "$@"
