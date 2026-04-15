#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CERTS_DIR="${PROJECT_ROOT}/certs"
CERT_FILE="${CERTS_DIR}/localhost.pem"
KEY_FILE="${CERTS_DIR}/localhost-key.pem"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert is not installed."
  echo "Install on Ubuntu/Debian: sudo apt install libnss3-tools && brew install mkcert"
  echo "Or see: https://github.com/FiloSottile/mkcert"
  exit 1
fi

mkdir -p "${CERTS_DIR}"

mkcert -install
mkcert -cert-file "${CERT_FILE}" -key-file "${KEY_FILE}" localhost 127.0.0.1 ::1

echo "Local HTTPS certificate generated:"
echo "  cert: ${CERT_FILE}"
echo "  key:  ${KEY_FILE}"
