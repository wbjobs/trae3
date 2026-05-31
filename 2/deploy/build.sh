#!/bin/bash
set -e

APP_NAME="industrial-protocol-gateway"
VERSION=${1:-"1.0.0"}
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

echo "=== Building Industrial Protocol Gateway ==="
echo "Version: $VERSION"
echo "Build Time: $BUILD_TIME"
echo "Git Commit: $GIT_COMMIT"
echo ""

LDFLAGS="-s -w"
LDFLAGS="$LDFLAGS -X main.Version=$VERSION"
LDFLAGS="$LDFLAGS -X main.BuildTime=$BUILD_TIME"
LDFLAGS="$LDFLAGS -X main.GitCommit=$GIT_COMMIT"

echo "[1/3] Cleaning..."
rm -rf output
mkdir -p output

echo "[2/3] Building Linux amd64..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="$LDFLAGS" -o output/$APP_NAME .

echo "[3/3] Copying files..."
cp config/config.yaml output/
cp -r deploy output/

cd output
tar -czf ../$APP_NAME-$VERSION-linux-amd64.tar.gz .
cd ..

echo ""
echo "=== Build Complete ==="
echo "Output: $APP_NAME-$VERSION-linux-amd64.tar.gz"
echo ""
sha256sum $APP_NAME-$VERSION-linux-amd64.tar.gz
