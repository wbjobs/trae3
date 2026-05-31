#!/bin/bash
set -e

APP_NAME="industrial-protocol-gateway"
APP_DIR="/opt/industrial-gateway"
PID_FILE="$APP_DIR/$APP_NAME.pid"
STOP_TIMEOUT=30

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

if [ ! -f "$PID_FILE" ]; then
    log "PID file not found, service may not be running"
    exit 0
fi

PID=$(cat "$PID_FILE")

if ! kill -0 "$PID" 2>/dev/null; then
    log "Process $PID is not running, cleaning up PID file"
    rm -f "$PID_FILE"
    exit 0
fi

log "Stopping service (PID: $PID)..."

kill -TERM "$PID"

for i in $(seq 1 $STOP_TIMEOUT); do
    if ! kill -0 "$PID" 2>/dev/null; then
        log "Service stopped gracefully"
        rm -f "$PID_FILE"
        exit 0
    fi
    sleep 1
done

log "Timeout reached, force killing process..."
kill -KILL "$PID"
sleep 1

if ! kill -0 "$PID" 2>/dev/null; then
    log "Service force stopped"
    rm -f "$PID_FILE"
    exit 0
else
    log "ERROR: Failed to stop service"
    exit 1
fi
