#!/usr/bin/env bash
# Runs ops monitor scripts. Exits non-zero if any script fails (for cron alerting).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

FAILURES=()

run_monitor() {
  local name="$1"
  local cmd="$2"
  echo "[run-ops-monitors] Starting ${name}..."
  if eval "${cmd}"; then
    echo "[run-ops-monitors] ${name} OK"
  else
    echo "[run-ops-monitors] ${name} FAILED (exit $?)"
    FAILURES+=("${name}")
  fi
}

run_monitor "error-alert" "node check-errors-and-alert.js"
run_monitor "health-alert" "node check-health-and-alert.js"
run_monitor "billing-alerts" "node check-billing-and-alert.js"
run_monitor "renewal-reminders" "node check-renewal-reminders.js"

if [ "${#FAILURES[@]}" -gt 0 ]; then
  echo "[run-ops-monitors] Failed monitors: ${FAILURES[*]}"
  exit 1
fi

echo "[run-ops-monitors] All monitors completed successfully."
