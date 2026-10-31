# -------------------------------------------------------
# SNS topic encryption
#
# Customer-managed keys rather than the AWS-managed alias/aws/sns key: AWS
# services that publish to a topic (CloudWatch alarms, Budgets, EventBridge)
# can only do so when the key policy grants them, which an AWS-managed key's
# policy can't. One key per region, since a topic's key must be in its region.
#
# Publishers need kms:GenerateDataKey* + kms:Decrypt. The svc role (which
# Textract assumes to publish job completions) gets those via IAM in
# svc-role.tf — the AccountAdmin statement delegates key access to IAM.
# -------------------------------------------------------

resource "aws_kms_key" "sns" {
  description         = "Encrypts the ${var.project} SNS topics in ${var.region}"
  enable_key_rotation = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdmin"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        # ai_alerts publishers (monitoring.tf)
        Sid       = "AlarmsAndBudgets"
        Effect    = "Allow"
        Principal = { Service = ["cloudwatch.amazonaws.com", "budgets.amazonaws.com"] }
        Action    = ["kms:GenerateDataKey*", "kms:Decrypt"]
        Resource  = "*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = var.account_id }
        }
      }
    ]
  })

  tags = {
    Owner   = var.owner
    Project = var.project
  }
}

resource "aws_kms_alias" "sns" {
  name          = "alias/${var.project}-sns"
  target_key_id = aws_kms_key.sns.key_id
}

# iam_alerts lives in us-east-1 (where IAM's CloudTrail events land), so its
# key does too
resource "aws_kms_key" "sns_us_east_1" {
  provider            = aws.us_east_1
  description         = "Encrypts the ${var.project} SNS topics in us-east-1"
  enable_key_rotation = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdmin"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        # iam_alerts publisher (monitoring.tf)
        Sid       = "EventBridge"
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = ["kms:GenerateDataKey*", "kms:Decrypt"]
        Resource  = "*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = var.account_id }
        }
      }
    ]
  })

  tags = {
    Owner   = var.owner
    Project = var.project
  }
}

resource "aws_kms_alias" "sns_us_east_1" {
  provider      = aws.us_east_1
  name          = "alias/${var.project}-sns"
  target_key_id = aws_kms_key.sns_us_east_1.key_id
}
