# -------------------------------------------------------
# Project state table — cloud source of truth for cross-device sync
#
# Partition key : project_id
# Sort key      : document_id  (use "META" for project-level records)
#
# Record types:
#   PK=project_id, SK="META"        → project metadata + membership
#   PK=project_id, SK=document_id   → document processing state + S3 result keys
# -------------------------------------------------------
resource "aws_dynamodb_table" "project_state" {
  name         = "${var.tf_project_name}-project-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "project_id"
  range_key    = "document_id"

  attribute {
    name = "project_id"
    type = "S"
  }

  attribute {
    name = "document_id"
    type = "S"
  }

  attribute {
    name = "owner_sub"
    type = "S"
  }

  # GSI: look up all projects owned by a user
  global_secondary_index {
    name            = "owner-index"
    hash_key        = "owner_sub"
    range_key       = "project_id"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Owner       = var.owner
    Project     = var.project
    Description = "Project and document processing state for cross-device sync"
  }
}

# -------------------------------------------------------
# Project access table — tracks which users can access which projects
#
# Partition key : user_sub   (Cognito sub)
# Sort key      : project_id
# -------------------------------------------------------
resource "aws_dynamodb_table" "project_access" {
  name         = "${var.tf_project_name}-project-access"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_sub"
  range_key    = "project_id"

  attribute {
    name = "user_sub"
    type = "S"
  }

  attribute {
    name = "project_id"
    type = "S"
  }

  tags = {
    Owner       = var.owner
    Project     = var.project
    Description = "User-to-project access mapping for sharing and cross-device sync"
  }
}

output "dynamodb_project_state_table" {
  description = "DynamoDB table name for project and document state"
  value       = aws_dynamodb_table.project_state.name
}

output "dynamodb_project_access_table" {
  description = "DynamoDB table name for project access/sharing"
  value       = aws_dynamodb_table.project_access.name
}
