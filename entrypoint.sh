#!/bin/sh
set -e

CERT_DIR="/root/.envoy"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"

# Generate self-signed cert if not exists
if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
  echo "[entrypoint] Generating self-signed certificate..."
  openssl req -x509 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -days 3650 \
    -nodes \
    -subj "/CN=envoy-manager" \
    -addext "subjectAltName=IP:0.0.0.0"
  echo "[entrypoint] Certificate generated at $CERT_FILE"
fi

# Start server
exec npx tsx index.ts
