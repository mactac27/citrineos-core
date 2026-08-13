#!/bin/bash
# vSparQ CitrineOS queue watchdog.
#
# Polls the RabbitMQ management API for per-queue depth. If any queue has
# messages sitting unprocessed for more than N poll cycles (i.e. no
# consumer draining), restart both amqp-broker and citrine to unstick.
#
# Belt-and-suspenders alongside the compose-level autoheal sidecar: the
# healthcheck catches obvious broker sickness, this catches the subtler
# case where the broker responds to diagnostics but message routing has
# silently stopped (seen in production 2026-08).
#
# Run manually to smoke-test, or as a launchd/systemd job for continuous
# supervision. Zero external deps beyond curl + jq.
#
# Env overrides:
#   WATCHDOG_INTERVAL   seconds between polls (default 30)
#   WATCHDOG_MAX_STUCK  consecutive stuck polls before restart (default 4 = ~2 min)
#   WATCHDOG_MIN_DEPTH  minimum queue depth to consider "stuck" (default 5)
#   RABBIT_URL          RabbitMQ mgmt API base (default http://guest:guest@localhost:15672)

set -u

INTERVAL="${WATCHDOG_INTERVAL:-30}"
MAX_STUCK="${WATCHDOG_MAX_STUCK:-4}"
MIN_DEPTH="${WATCHDOG_MIN_DEPTH:-5}"
RABBIT_URL="${RABBIT_URL:-http://guest:guest@localhost:15672}"

log() { printf '[queue-watchdog %s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

stuck_count=0

log "starting — interval=${INTERVAL}s max_stuck=${MAX_STUCK} min_depth=${MIN_DEPTH}"

while true; do
  # Fetch all queues; find any with messages_ready >= MIN_DEPTH and no consumers
  # draining (or consumer_utilisation == 0). Either condition suggests routing
  # is broken.
  stuck=$(curl -sS -m 5 "${RABBIT_URL}/api/queues" 2>/dev/null | \
    jq -r --argjson d "${MIN_DEPTH}" '
      [.[] | select(.messages_ready >= $d and ((.consumer_utilisation // 0) == 0))]
      | length
    ')

  if [[ "${stuck}" == "null" || -z "${stuck}" ]]; then
    log "WARN could not reach RabbitMQ mgmt API"
    stuck_count=$((stuck_count + 1))
  elif [[ "${stuck}" -gt 0 ]]; then
    stuck_count=$((stuck_count + 1))
    log "detected ${stuck} stuck queue(s) — count=${stuck_count}/${MAX_STUCK}"
  else
    if [[ "${stuck_count}" -gt 0 ]]; then log "queues healthy again — reset counter"; fi
    stuck_count=0
  fi

  if [[ "${stuck_count}" -ge "${MAX_STUCK}" ]]; then
    log "THRESHOLD HIT — restarting amqp-broker and citrine"
    docker restart citrineos-core-amqp-broker-1 || log "amqp restart failed"
    sleep 20  # give broker time to accept connections again
    docker restart citrineos-core-citrine-1 || log "citrine restart failed"
    stuck_count=0
  fi

  sleep "${INTERVAL}"
done
