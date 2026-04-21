# -------------------------------------------------------
# Textract job completion notifications
#
# Flow:
#   Textract job completes
#     → publishes to SNS topic
#       → SNS delivers to SQS queue
#         → Electron app polls SQS
#           → fetches results from S3
#           → imports into local Neo4j
# -------------------------------------------------------

resource "aws_sns_topic" "textract_results" {
  name = "${var.tf_project_name}-textract-results"

  tags = {
    Owner       = var.owner
    Project     = var.project
    Description = "Textract async job completion notifications"
  }
}

resource "aws_sqs_queue" "textract_results" {
  name                       = "${var.tf_project_name}-textract-results"
  message_retention_seconds  = 86400  # 1 day
  visibility_timeout_seconds = 300    # 5 min — enough time to process a result
  receive_wait_time_seconds  = 20     # long polling, reduces empty responses

  tags = {
    Owner       = var.owner
    Project     = var.project
    Description = "Queue for Textract job completion events"
  }
}

# Allow SNS to send messages to the SQS queue
resource "aws_sqs_queue_policy" "textract_results" {
  queue_url = aws_sqs_queue.textract_results.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.textract_results.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.textract_results.arn
          }
        }
      }
    ]
  })
}

# Allow Textract to publish to the SNS topic
resource "aws_sns_topic_policy" "textract_results" {
  arn = aws_sns_topic.textract_results.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "textract.amazonaws.com" }
        Action    = "sns:Publish"
        Resource  = aws_sns_topic.textract_results.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = var.account_id
          }
        }
      }
    ]
  })
}

# Subscribe SQS to SNS
resource "aws_sns_topic_subscription" "textract_results" {
  topic_arn = aws_sns_topic.textract_results.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.textract_results.arn
}

output "textract_sns_topic_arn" {
  description = "Pass this to StartDocumentAnalysis as the NotificationChannel SNS topic ARN"
  value       = aws_sns_topic.textract_results.arn
}

output "textract_sqs_queue_url" {
  description = "Electron app polls this queue URL for Textract completion events"
  value       = aws_sqs_queue.textract_results.url
}
