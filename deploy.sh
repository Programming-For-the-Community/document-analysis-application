#!/bin/bash
set -e  # exit on any error

ROLE_ARN="arn:aws:iam::YOUR_ACCOUNT_ID:role/YOUR_ROLE_NAME"

echo "Assuming IAM role..."
CREDENTIALS=$(aws sts assume-role \
  --role-arn "${ROLE_ARN}" \
  --role-session-name "doc-analysis-deploy" \
  --query Credentials \
  --output json)

export AWS_ACCESS_KEY_ID=$(echo "${CREDENTIALS}" | jq -r '.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo "${CREDENTIALS}" | jq -r '.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo "${CREDENTIALS}" | jq -r '.SessionToken')

echo "Fetching secrets from AWS Parameter Store..."

NEO4J_USER=$(aws ssm get-parameter --name "doc-analysis-secret/SVC_USER" --with-decryption --query Parameter.Value --output text)
NEO4J_PASSWORD=$(aws ssm get-parameter --name "doc-analysis-secret/SVC_PWD" --with-decryption --query Parameter.Value --output text)
RABBITMQ_USER=$(aws ssm get-parameter --name "doc-analysis-secret/SVC_USER" --with-decryption --query Parameter.Value --output text)
RABBITMQ_PASS=$(aws ssm get-parameter --name "doc-analysis-secret/SVC_PWD" --with-decryption --query Parameter.Value --output text)

cat <<EOF > .env
NEO4J_USER=${NEO4J_USER}
NEO4J_PASSWORD=${NEO4J_PASSWORD}
RABBITMQ_USER=${RABBITMQ_USER}
RABBITMQ_PASS=${RABBITMQ_PASS}
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
