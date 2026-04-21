# -------------------------------------------------------
# Textract + Bedrock permissions for the service role
# -------------------------------------------------------

resource "aws_iam_role_policy" "svc_role_s3" {
  name = "doc-analysis-s3-documents"
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
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.documents.arn,
          "${aws_s3_bucket.documents.arn}/*"
        ]
      }
    ]
  })
}

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
          "dynamodb:Scan"
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
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.textract_results.arn
      }
    ]
  })
}

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
        # Allows the role to pass itself to Textract so async jobs
        # can write results back to S3 on completion
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
        Resource = [
          for model in var.bedrock_models :
          "arn:aws:bedrock:${var.region}::foundation-model/${model}"
        ]
      }
    ]
  })
}
