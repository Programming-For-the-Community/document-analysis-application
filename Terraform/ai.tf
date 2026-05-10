# -------------------------------------------------------
# AI Pipeline — no AWS resources to provision
#
# Textract and Bedrock are fully managed services.
# IAM permissions are in svc-role.tf.
# SNS + SQS wiring is in messaging.tf.
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
