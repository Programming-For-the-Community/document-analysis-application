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

variable "bedrock_models" {
  description = "List of Bedrock model ARNs the service role is permitted to invoke"
  type        = list(string)
  default = [
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-haiku-20240307-v1:0"
  ]
}

variable "electron_callback_url" {
  description = "Custom protocol callback URL for the Electron app OAuth flow (e.g. doc-analysis://callback)"
  type        = string
  default     = "doc-analysis://callback"
}

variable "secrets_manager_path" {
  description = "Path prefix for Secrets Manager secrets"
  type        = string
  default     = "doc-analysis-secret"
}
