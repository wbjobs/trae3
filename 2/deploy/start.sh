#!/bin/bash
set -e

APP_NAME="industrial-protocol-gateway"
APP_DIR="/opt/industrial-gateway"
PID_FILE="$APP_DIR/$APP_NAME.pid"
LOG_FILE="/var/log/industrial-gateway/startup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        log "ERROR: Service is already running (PID: $PID)"
        exit 1
    else
        log "WARN: PID file exists but process is not running, cleaning up..."
        rm -f "$PID_FILE"
    fi
fi

log "Starting Industrial Protocol Gateway..."

cd "$APP_DIR"
nohup ./$APP_NAME >> "$LOG_FILE" 2>&1 &
PID=$!

echo $PID > "$PID_FILE"

sleep 2

if kill -0 "$PID" 2>/dev/null; then
    log "Service started successfully (PID: $PID)"
    exit 0
else
    log "ERROR: Service failed to start"
    rm -f "$PID_FILE"
    exit 1
fi
