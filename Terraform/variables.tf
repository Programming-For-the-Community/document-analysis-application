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

variable "user_arn" {
  description = "IAM user ARN allowed to assume the service role"
  type        = string
}

variable "secrets_manager_path" {
  description = "Path prefix for Secrets Manager secrets"
  type        = string
  default     = "doc-analysis-secret"
}
