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
  description = "Name of the project"
  type        = string
  nullable    = false
  default     = "Document Analysis Application"
}

variable "tf_project_name" {
  description = "Name of the Terraform project (used for naming resources)"
  type        = string
  nullable    = false
  default     = "doc-analysis-app"
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

