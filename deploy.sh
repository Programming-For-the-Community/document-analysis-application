#!/bin/bash
set -e  # exit on any error

trap 'echo "ERROR: Script failed at line $LINENO with exit code $?"' ERR

SECRET_NAME="doc-analysis-secret"

echo "Fetching secrets from Secrets Manager..."
SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "${SECRET_NAME}" \
  --query SecretString \
  --output text)

NEO4J_PASSWORD=$(echo "${SECRET}" | python3 -c "import json,sys; print(json.load(sys.stdin)['SVC_PWD'])")
QDRANT_API_KEY=$(echo "${SECRET}" | python3 -c "import json,sys; print(json.load(sys.stdin)['QDRANT_KEY'])")

cat <<EOF > .env
NEO4J_PASSWORD=${NEO4J_PASSWORD}
QDRANT_API_KEY=${QDRANT_API_KEY}
EOF

PRIMARY_DATA_PATH="D:/Projects/.data"
FALLBACK_DATA_PATH="C:/ProgramData/docker/volumes"

if [ -d "${PRIMARY_DATA_PATH}" ]; then
  echo "Using primary data path: ${PRIMARY_DATA_PATH}"
  export DATA_PATH="${PRIMARY_DATA_PATH}/doc-analysis"
else
  echo "Primary data path not found, using fallback: ${FALLBACK_DATA_PATH}"
  export DATA_PATH="${FALLBACK_DATA_PATH}/doc-analysis"
fi

echo "Starting services..."
docker compose up -d

rm -f .env

echo "Done."
