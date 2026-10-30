# -------------------------------------------------------
# AI Pipeline
#
# Textract and Bedrock are fully managed services.
# IAM permissions are in svc-role.tf.
# SNS + SQS wiring is in messaging.tf.
# Monitoring, invocation logging, alarms and budget are in monitoring.tf.
#
# Runtime config from secrets.tf:
#   SNS_TOPIC_ARN    — passed to StartDocumentAnalysis NotificationChannel
#   SQS_QUEUE_URL    — Electron app polls for completion events
#   BEDROCK_MODEL_ID — model used for relationship extraction
#   QDRANT_KEY       — local Qdrant API key
#
# Runtime config from .env (device-local, not in Secrets Manager):
#   AWS_ROLE_ARN  — also used as the Textract NotificationChannel role
#   QDRANT_URL    — local Qdrant server (http://localhost:6333)
#   NEO4J_URI     — local Neo4j server (bolt://localhost:7687)
#
# Processing flow:
#   document:analyze IPC
#     → StartDocumentAnalysis (Textract, async)
#       → DynamoDB processing_status = QUEUED
#     → SQS poller receives completion event
#       → GetDocumentAnalysis (Textract)
#         → DynamoDB processing_status = PROCESSING
#         → Bedrock InvokeModel (relationship extraction)
#           → write JSON to S3 at {user_sub}/{project_id}/analysis/{document_id}.json
#           → DynamoDB processing_status = COMPLETE
#           → import into local Neo4j + Qdrant
# -------------------------------------------------------

locals {
  # var.bedrock_model is a cross-region inference profile ID (e.g. us.amazon.nova-lite-v1:0);
  # stripping the geo prefix gives the foundation model it routes to.
  bedrock_foundation_model = replace(var.bedrock_model, "/^(us|eu|apac|global)\\./", "")
  bedrock_profile_arn      = "arn:aws:bedrock:${var.region}:${var.account_id}:inference-profile/${var.bedrock_model}"

  # Must match APP_METRICS_NAMESPACE in Source/constants/metrics.ts
  app_metrics_namespace = "DocAnalysis/AI"
}
