#!/bin/bash
set -e  # exit on any error

read -rp "Enter the IAM Role ARN to assume: " ROLE_ARN

if [ -z "${ROLE_ARN}" ]; then
  echo "Error: Role ARN cannot be empty."
  exit 1
fi

echo "Assuming IAM role..."
CREDS=$(aws sts assume-role \
  --role-arn "${ROLE_ARN}" \
  --role-session-name "doc-analysis-deploy" \
  --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" \
  --output text)

export AWS_ACCESS_KEY_ID=$(echo "${CREDS}" | cut -f1)
export AWS_SECRET_ACCESS_KEY=$(echo "${CREDS}" | cut -f2)
export AWS_SESSION_TOKEN=$(echo "${CREDS}" | cut -f3)

echo "Fetching secrets from AWS Secrets Manager..."

SECRET=$(aws secretsmanager get-secret-value --secret-id "doc-analysis-secret" --query SecretString --output text)

NEO4J_USER=$(echo "${SECRET}" | grep -oP '"SVC_USER"\s*:\s*"\K[^"]+')
NEO4J_PASSWORD=$(echo "${SECRET}" | grep -oP '"SVC_PWD"\s*:\s*"\K[^"]+')
QDRANT_API_KEY=$(echo "${SECRET}" | grep -oP '"QDRANT_KEY"\s*:\s*"\K[^"]+')

cat <<EOF > .env
NEO4J_USER=${NEO4J_USER}
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
