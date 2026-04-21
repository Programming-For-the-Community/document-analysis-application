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

NEO4J_USER=$(aws secretsmanager get-secret-value --secret-id "doc-analysis-secret/SVC_USER" --query SecretString --output text)
NEO4J_PASSWORD=$(aws secretsmanager get-secret-value --secret-id "doc-analysis-secret/SVC_PWD" --query SecretString --output text)
RABBITMQ_USER=$(aws secretsmanager get-secret-value --secret-id "doc-analysis-secret/SVC_USER" --query SecretString --output text)
RABBITMQ_PASS=$(aws secretsmanager get-secret-value --secret-id "doc-analysis-secret/SVC_PWD" --query SecretString --output text)
QDRANT_API_KEY=$(aws secretsmanager get-secret-value --secret-id "doc-analysis-secret/QDRANT_KEY" --query SecretString --output text)

cat <<EOF > .env
NEO4J_USER=${NEO4J_USER}
NEO4J_PASSWORD=${NEO4J_PASSWORD}
RABBITMQ_USER=${RABBITMQ_USER}
RABBITMQ_PASS=${RABBITMQ_PASS}
QDRANT_API_KEY=${QDRANT_API_KEY}
EOF

PRIMARY_DATA_PATH="D:/Projects/.data/doc-analysis"
FALLBACK_DATA_PATH="C:/ProgramData/docker/volumes/doc-analysis"

if [ -d "${PRIMARY_DATA_PATH}" ]; then
  echo "Using primary data path: ${PRIMARY_DATA_PATH}"
  export DATA_PATH="${PRIMARY_DATA_PATH}"
else
  echo "Primary data path not found, using fallback: ${FALLBACK_DATA_PATH}"
  export DATA_PATH="${FALLBACK_DATA_PATH}"
fi

echo "Starting services..."
docker compose up -d

rm -f .env

echo "Done."
