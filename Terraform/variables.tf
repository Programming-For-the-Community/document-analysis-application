variable "region" {
  description = "AWS Region to build infrastructure in"
  type        = string
  default     = "us-east-2"
  nullable    = false
}

variable "owner" {
  description = "Owner of the project"
  type        = string
  nullable    = false
  default     = "Charlie Hahm"
}

variable "account_id" {
  description = "AWS Account ID"
  type        = string
  nullable    = false
  default     = "1234567890"
}

variable "project" {
  description = "Project name — used for tags and as the prefix for every resource name (S3 buckets, DynamoDB tables, Cognito pool, SQS/SNS), so it must stay lowercase-hyphenated and must not change once deployed"
  type        = string
  nullable    = false
  default     = "doc-analysis-app"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$", var.project))
    error_message = "project must be lowercase letters, digits and hyphens (it prefixes S3 bucket names)."
  }
}

variable "user_arn" {
  description = "IAM user ARN allowed to assume the service role"
  type        = string
}

variable "bedrock_model" {
  description = "Bedrock inference profile ID used for relationship extraction"
  type        = string
  default     = "us.amazon.nova-lite-v1:0"
}

variable "embed_model" {
  description = "Bedrock embedding model ID — must match EMBED_MODEL_ID in Source/constants/bedrock.ts"
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}

variable "alert_email" {
  description = "Email subscribed to AI monitoring alerts and budget notifications (empty = no subscription)"
  type        = string
  default     = ""
}

variable "bedrock_monthly_budget_usd" {
  description = "Monthly Amazon Bedrock spend that triggers budget alerts at 80% and 100%"
  type        = string
  default     = "25"
}

variable "invocation_log_retention_days" {
  description = "Retention for Bedrock invocation logs (contain full document text)"
  type        = number
  default     = 30
}

variable "enable_cloudtrail" {
  description = "Create a dedicated CloudTrail trail. Leave false if the account already has one."
  type        = bool
  default     = false
}

variable "secrets_manager_path" {
  description = "Path prefix for Secrets Manager secrets"
  type        = string
  default     = "doc-analysis-secret"
}

variable "svc_acct_password" {
  description = "Service account password"
  type        = string
  sensitive   = true
}

variable "svc_acct_username" {
  description = "Service account username"
  type        = string
  sensitive   = true
}

variable "qdrant_api_key" {
  description = "Qdrant API key"
  type        = string
  sensitive   = true
}

variable "neo4j_uri" {
  description = "Neo4j connection URI (e.g. bolt://localhost:7687)"
  type        = string
  default     = "bolt://localhost:7687"
}

variable "qdrant_url" {
  description = "Qdrant base URL (e.g. http://localhost:6333)"
  type        = string
  default     = "http://localhost:6333"
}

