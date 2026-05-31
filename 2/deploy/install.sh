#!/bin/bash
set -e

APP_NAME="industrial-protocol-gateway"
APP_DIR="/opt/industrial-gateway"
LOG_DIR="/var/log/industrial-gateway"
USER="gateway"
GROUP="gateway"

echo "=== Industrial Protocol Gateway Installation ==="

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be run as root" >&2
    exit 1
fi

echo "[1/7] Creating user and group..."
if ! getent group $GROUP > /dev/null 2>&1; then
    groupadd -r $GROUP
fi
if ! id -u $USER > /dev/null 2>&1; then
    useradd -r -g $GROUP -s /bin/false -d $APP_DIR $USER
fi

echo "[2/7] Creating directories..."
mkdir -p $APP_DIR/config
mkdir -p $APP_DIR/logs
mkdir -p $LOG_DIR

echo "[3/7] Installing binary..."
cp ../$APP_NAME $APP_DIR/
chmod 755 $APP_DIR/$APP_NAME

echo "[4/7] Installing configuration..."
cp ../config/config.yaml $APP_DIR/config/
chmod 644 $APP_DIR/config/config.yaml

echo "[5/7] Setting permissions..."
chown -R $USER:$GROUP $APP_DIR
chown -R $USER:$GROUP $LOG_DIR

echo "[6/7] Installing systemd service..."
cp industrial-gateway.service /etc/systemd/system/
chmod 644 /etc/systemd/system/industrial-gateway.service

echo "[7/7] Reloading systemd..."
systemctl daemon-reload

echo ""
echo "=== Installation Complete ==="
echo ""
echo "To start the service:"
echo "  systemctl start industrial-gateway"
echo ""
echo "To enable on boot:"
echo "  systemctl enable industrial-gateway"
echo ""
echo "To check status:"
echo "  systemctl status industrial-gateway"
echo ""
echo "To view logs:"
echo "  journalctl -u industrial-gateway -f"
