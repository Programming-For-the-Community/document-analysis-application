resource "aws_iam_role" "svc_role" {
  name = "doc-analysis-svc-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = var.user_arn
        }
        Action = "sts:AssumeRole"
      },
      {
        Effect = "Allow"
        Principal = {
          Service = "textract.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Owner       = var.owner
    Project     = var.project
    Description = "Service account role for the ${var.project} application"
  }
}

# -------------------------------------------------------
# Secrets Manager
# -------------------------------------------------------
resource "aws_iam_role_policy" "svc_role_secrets" {
  name = "doc-analysis-secrets-manager"
  role = aws_iam_role.svc_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${var.secrets_manager_path}*"
      }
    ]
  })
}

# -------------------------------------------------------
# SNS — publish (used by Textract when it assumes this role to notify completion)
# -------------------------------------------------------
resource "aws_iam_role_policy" "svc_role_sns" {
  name = "doc-analysis-sns"
  role = aws_iam_role.svc_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "sns:Publish"
        Resource = aws_sns_topic.textract_results.arn
      }
    ]
  })
}

# -------------------------------------------------------
# S3
# -------------------------------------------------------
resource "aws_iam_role_policy" "svc_role_s3" {
  name = "doc-analysis-s3"
  role = aws_iam_role.svc_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:CreateMultipartUpload",
          "s3:UploadPart",
          "s3:CompleteMultipartUpload",
          "s3:AbortMultipartUpload",
          "s3:DeleteObjects"
        ]
        Resource = [
          aws_s3_bucket.documents.arn,
          "${aws_s3_bucket.documents.arn}/*"
        ]
      }
    ]
  })
}

# -------------------------------------------------------
# DynamoDB
# -------------------------------------------------------
resource "aws_iam_role_policy" "svc_role_dynamodb" {
  name = "doc-analysis-dynamodb"
  role = aws_iam_role.svc_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:TransactWriteItems",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.project_state.arn,
          "${aws_dynamodb_table.project_state.arn}/index/*",
          aws_dynamodb_table.project_access.arn,
          "${aws_dynamodb_table.project_access.arn}/index/*"
        ]
      }
    ]
  })
}

# -------------------------------------------------------
# SQS
# -------------------------------------------------------
resource "aws_iam_role_policy" "svc_role_sqs" {
  name = "doc-analysis-sqs"
  role = aws_iam_role.svc_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = aws_sqs_queue.textract_results.arn
      }
    ]
  })
}

# -------------------------------------------------------
# Textract
# -------------------------------------------------------
resource "aws_iam_role_policy" "svc_role_textract" {
  name = "doc-analysis-textract"
  role = aws_iam_role.svc_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "textract:StartDocumentAnalysis",
          "textract:GetDocumentAnalysis",
          "textract:StartDocumentTextDetection",
          "textract:GetDocumentTextDetection",
          "textract:AnalyzeDocument"
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = "arn:aws:iam::${var.account_id}:role/doc-analysis-svc-role"
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "textract.amazonaws.com"
          }
        }
      }
    ]
  })
}

# -------------------------------------------------------
# Bedrock
# -------------------------------------------------------
resource "aws_iam_role_policy" "svc_role_bedrock" {
  name = "doc-analysis-bedrock"
  role = aws_iam_role.svc_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        # Cross-region inference profiles route to models in multiple regions,
        # so resource-level restriction to a single-region ARN won't cover them.
        Resource = "*"
      }
    ]
  })
}

# -------------------------------------------------------
# Cognito
# -------------------------------------------------------
resource "aws_iam_role_policy" "svc_role_cognito" {
  name = "doc-analysis-cognito"
  role = aws_iam_role.svc_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminRespondToAuthChallenge",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminGetUser",
          "cognito-idp:ListUsers",
          "cognito-idp:InitiateAuth"
        ]
        Resource = aws_cognito_user_pool.users.arn
      }
    ]
  })
}
