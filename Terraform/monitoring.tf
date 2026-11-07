# -------------------------------------------------------
# AI monitoring, observability & access assurance
#
#   1. Bedrock model invocation logging  — server-side audit of every prompt/response
#   2. Alerts topic                      — alarms + budget notifications
#   3. Bedrock platform alarms           — AWS/Bedrock throttles and errors, token anomaly
#   4. App quality alarms                — DocAnalysis/AI metrics emitted by the Electron app
#   5. Dashboard
#   6. Bedrock spend budget
#   7. svc-role change alert             — EventBridge on IAM policy edits (us-east-1)
#   8. Optional CloudTrail trail         — only when var.enable_cloudtrail = true
#
# NOTE: invocation logging is account + region wide — it captures every Bedrock
# call in var.region for this account, not just this app's.
# -------------------------------------------------------

# -------------------------------------------------------
# 1. Bedrock model invocation logging
# -------------------------------------------------------

# Invocation logs contain full document text — encrypt with a dedicated key
resource "aws_kms_key" "invocation_logs" {
  description         = "Encrypts Bedrock invocation logs for ${var.project}"
  enable_key_rotation = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.kms_account_admin_statement,
      {
        Sid       = "CloudWatchLogs"
        Effect    = "Allow"
        Principal = { Service = "logs.${var.region}.amazonaws.com" }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*"
        ]
        Resource = "*"
        Condition = {
          ArnLike = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.region}:${var.account_id}:log-group:${local.invocation_log_group}"
          }
        }
      }
    ]
  })

  tags = {
    Owner   = var.owner
    Project = var.project
  }
}

locals {
  invocation_log_group = "/aws/bedrock/${var.project}/invocations"
}

resource "aws_cloudwatch_log_group" "invocations" {
  name              = local.invocation_log_group
  retention_in_days = var.invocation_log_retention_days
  kms_key_id        = aws_kms_key.invocation_logs.arn

  tags = {
    Owner   = var.owner
    Project = var.project
  }
}

# Payloads over 100 KB (most document extraction prompts) are delivered here
# instead of inline in the log event.
resource "aws_s3_bucket" "invocation_logs" {
  bucket = "${var.project}-invocation-logs-${var.account_id}"

  tags = {
    Owner       = var.owner
    Project     = var.project
    Description = "Large Bedrock invocation log payloads for the ${var.project} application"
  }
}

resource "aws_s3_bucket_public_access_block" "invocation_logs" {
  bucket = aws_s3_bucket.invocation_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "invocation_logs" {
  bucket = aws_s3_bucket.invocation_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Access logs go to the shared bucket in access-logs.tf
resource "aws_s3_bucket_logging" "invocation_logs" {
  bucket        = aws_s3_bucket.invocation_logs.id
  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "invocation-logs/"
}

resource "aws_s3_bucket_lifecycle_configuration" "invocation_logs" {
  bucket = aws_s3_bucket.invocation_logs.id

  rule {
    id     = "expire-invocation-payloads"
    status = "Enabled"

    filter {}

    expiration {
      days = var.invocation_log_retention_days
    }
  }
}

resource "aws_s3_bucket_policy" "invocation_logs" {
  bucket = aws_s3_bucket.invocation_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "BedrockLogDelivery"
        Effect    = "Allow"
        Principal = { Service = "bedrock.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.invocation_logs.arn}/*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = var.account_id }
          ArnLike      = { "aws:SourceArn" = "arn:aws:bedrock:${var.region}:${var.account_id}:*" }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.invocation_logs.arn,
          "${aws_s3_bucket.invocation_logs.arn}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}

resource "aws_iam_role" "bedrock_logging" {
  name = "doc-analysis-bedrock-logging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "bedrock.amazonaws.com" }
        Action    = "sts:AssumeRole"
        Condition = {
          StringEquals = { "aws:SourceAccount" = var.account_id }
          ArnLike      = { "aws:SourceArn" = "arn:aws:bedrock:${var.region}:${var.account_id}:*" }
        }
      }
    ]
  })

  tags = {
    Owner       = var.owner
    Project     = var.project
    Description = "Lets Bedrock deliver model invocation logs to CloudWatch"
  }
}

resource "aws_iam_role_policy" "bedrock_logging" {
  name = "doc-analysis-bedrock-logging"
  role = aws_iam_role.bedrock_logging.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.invocations.arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.invocation_logs.arn}/*"
      }
    ]
  })
}

resource "aws_bedrock_model_invocation_logging_configuration" "this" {
  depends_on = [
    aws_iam_role_policy.bedrock_logging,
    aws_s3_bucket_policy.invocation_logs
  ]

  logging_config {
    text_data_delivery_enabled      = true
    embedding_data_delivery_enabled = false # vectors are large and carry no audit value
    image_data_delivery_enabled     = false

    cloudwatch_config {
      log_group_name = aws_cloudwatch_log_group.invocations.name
      role_arn       = aws_iam_role.bedrock_logging.arn

      large_data_delivery_s3_config {
        bucket_name = aws_s3_bucket.invocation_logs.bucket
        key_prefix  = "large-payloads"
      }
    }
  }
}

# -------------------------------------------------------
# 2. Alerts topic — alarms and budget notifications
# -------------------------------------------------------
resource "aws_sns_topic" "ai_alerts" {
  name              = "doc-analysis-ai-alerts"
  kms_master_key_id = aws_kms_key.sns.arn

  tags = {
    Owner   = var.owner
    Project = var.project
  }
}

# Replaces the default topic policy, so the account-owner statement is restated
resource "aws_sns_topic_policy" "ai_alerts" {
  arn = aws_sns_topic.ai_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountOwner"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.account_id}:root" }
        Action    = ["sns:Publish", "sns:Subscribe", "sns:GetTopicAttributes", "sns:SetTopicAttributes"]
        Resource  = aws_sns_topic.ai_alerts.arn
      },
      {
        Sid       = "AlarmsAndBudgets"
        Effect    = "Allow"
        Principal = { Service = ["cloudwatch.amazonaws.com", "budgets.amazonaws.com"] }
        Action    = "sns:Publish"
        Resource  = aws_sns_topic.ai_alerts.arn
        Condition = {
          StringEquals = { "aws:SourceAccount" = var.account_id }
        }
      }
    ]
  })
}

resource "aws_sns_topic_subscription" "ai_alerts_email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.ai_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# -------------------------------------------------------
# 3. Bedrock platform alarms (AWS/Bedrock — free, no instrumentation)
# -------------------------------------------------------
locals {
  bedrock_alarm_models = {
    chat  = var.bedrock_model
    embed = var.embed_model
  }

  bedrock_alarm_metrics = {
    throttles     = { metric = "InvocationThrottles", threshold = 0, period = 300 }
    server-errors = { metric = "InvocationServerErrors", threshold = 0, period = 300 }
    # Client errors are usually IAM denials or request validation failures
    client-errors = { metric = "InvocationClientErrors", threshold = 5, period = 900 }
  }

  bedrock_alarms = {
    for pair in setproduct(keys(local.bedrock_alarm_models), keys(local.bedrock_alarm_metrics)) :
    "${pair[0]}-${pair[1]}" => merge(local.bedrock_alarm_metrics[pair[1]], {
      model_id = local.bedrock_alarm_models[pair[0]]
    })
  }
}

resource "aws_cloudwatch_metric_alarm" "bedrock" {
  for_each = local.bedrock_alarms

  alarm_name          = "doc-analysis-bedrock-${each.key}"
  alarm_description   = "${each.value.metric} for ${each.value.model_id} above ${each.value.threshold}"
  namespace           = "AWS/Bedrock"
  metric_name         = each.value.metric
  dimensions          = { ModelId = each.value.model_id }
  statistic           = "Sum"
  period              = each.value.period
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = each.value.threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ai_alerts.arn]
  ok_actions          = [aws_sns_topic.ai_alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "bedrock_output_tokens_anomaly" {
  alarm_name          = "doc-analysis-bedrock-output-tokens-anomaly"
  alarm_description   = "Hourly output tokens for ${var.bedrock_model} above the expected band"
  comparison_operator = "GreaterThanUpperThreshold"
  evaluation_periods  = 2
  threshold_metric_id = "band"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ai_alerts.arn]

  metric_query {
    id          = "tokens"
    return_data = true

    metric {
      namespace   = "AWS/Bedrock"
      metric_name = "OutputTokenCount"
      dimensions  = { ModelId = var.bedrock_model }
      period      = 3600
      stat        = "Sum"
    }
  }

  metric_query {
    id          = "band"
    expression  = "ANOMALY_DETECTION_BAND(tokens, 3)"
    label       = "Expected output tokens"
    return_data = true
  }
}

# -------------------------------------------------------
# 4. App quality alarms (DocAnalysis/AI — emitted by Source/classes/aws/cloudwatch.ts)
#
# Each counter is published as 0 or 1 per extraction, so Sum is always present
# once any extraction runs and the rate math never divides by missing data.
# Rates are suppressed until at least 5 extractions land in the hour.
# -------------------------------------------------------
locals {
  extraction_rate_alarms = {
    failure-rate     = { metric = "ExtractionFailed", threshold = 5, what = "unparseable Bedrock JSON" }
    truncation-rate  = { metric = "ExtractionTruncated", threshold = 10, what = "responses cut off at maxTokens" }
    zero-entity-rate = { metric = "ExtractionZeroEntities", threshold = 20, what = "documents with no entities extracted" }
  }
}

resource "aws_cloudwatch_metric_alarm" "extraction_rate" {
  for_each = local.extraction_rate_alarms

  alarm_name          = "doc-analysis-extraction-${each.key}"
  alarm_description   = "More than ${each.value.threshold}% of extractions in an hour were ${each.value.what}"
  comparison_operator = "GreaterThanThreshold"
  threshold           = each.value.threshold
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ai_alerts.arn]
  ok_actions          = [aws_sns_topic.ai_alerts.arn]

  metric_query {
    id          = "rate"
    expression  = "IF(attempts >= 5, 100 * hits / attempts, 0)"
    label       = "${each.value.metric} %"
    return_data = true
  }

  metric_query {
    id = "attempts"
    metric {
      namespace   = local.app_metrics_namespace
      metric_name = "ExtractionAttempts"
      dimensions  = { ModelId = var.bedrock_model }
      period      = 3600
      stat        = "Sum"
    }
  }

  metric_query {
    id = "hits"
    metric {
      namespace   = local.app_metrics_namespace
      metric_name = each.value.metric
      dimensions  = { ModelId = var.bedrock_model }
      period      = 3600
      stat        = "Sum"
    }
  }
}

# -------------------------------------------------------
# 5. Dashboard
# -------------------------------------------------------
locals {
  chat_dim  = ["ModelId", var.bedrock_model]
  embed_dim = ["ModelId", var.embed_model]
  app_ns    = local.app_metrics_namespace
}

resource "aws_cloudwatch_dashboard" "ai" {
  dashboard_name = "doc-analysis-ai"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title  = "Bedrock invocations"
          region = var.region
          stat   = "Sum"
          period = 300
          metrics = [
            concat(["AWS/Bedrock", "Invocations"], local.chat_dim, [{ label = "Chat" }]),
            concat(["AWS/Bedrock", "Invocations"], local.embed_dim, [{ label = "Embeddings" }])
          ]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "Bedrock errors & throttles"
          region = var.region
          stat   = "Sum"
          period = 300
          metrics = [
            concat(["AWS/Bedrock", "InvocationClientErrors"], local.chat_dim),
            concat(["AWS/Bedrock", "InvocationServerErrors"], local.chat_dim),
            concat(["AWS/Bedrock", "InvocationThrottles"], local.chat_dim),
            concat(["AWS/Bedrock", "InvocationThrottles"], local.embed_dim, [{ label = "Embed throttles" }])
          ]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title  = "Tokens (chat model)"
          region = var.region
          stat   = "Sum"
          period = 3600
          metrics = [
            concat(["AWS/Bedrock", "InputTokenCount"], local.chat_dim),
            concat(["AWS/Bedrock", "OutputTokenCount"], local.chat_dim)
          ]
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title  = "Latency (p90)"
          region = var.region
          stat   = "p90"
          period = 300
          metrics = [
            concat(["AWS/Bedrock", "InvocationLatency"], local.chat_dim, [{ label = "Bedrock (server)" }]),
            concat([local.app_ns, "ExtractionLatency"], local.chat_dim, [{ label = "Extraction (app)" }]),
            concat([local.app_ns, "SearchLatency"], local.chat_dim, [{ label = "Search end-to-end (app)" }])
          ]
        }
      },
      {
        type = "metric", x = 0, y = 12, width = 12, height = 6
        properties = {
          title  = "Extraction quality (per hour)"
          region = var.region
          stat   = "Sum"
          period = 3600
          metrics = [
            concat([local.app_ns, "ExtractionAttempts"], local.chat_dim),
            concat([local.app_ns, "ExtractionFailed"], local.chat_dim),
            concat([local.app_ns, "ExtractionRepaired"], local.chat_dim),
            concat([local.app_ns, "ExtractionTruncated"], local.chat_dim),
            concat([local.app_ns, "ExtractionZeroEntities"], local.chat_dim)
          ]
        }
      },
      {
        type = "metric", x = 12, y = 12, width = 12, height = 6
        properties = {
          title  = "Search quality (per hour)"
          region = var.region
          stat   = "Sum"
          period = 3600
          metrics = [
            concat([local.app_ns, "SearchQueries"], local.chat_dim),
            concat([local.app_ns, "SearchZeroHits"], local.chat_dim),
            concat([local.app_ns, "SearchEmptyAnswer"], local.chat_dim)
          ]
        }
      },
      {
        type = "metric", x = 0, y = 18, width = 12, height = 6
        properties = {
          title  = "Graph size per document (avg)"
          region = var.region
          stat   = "Average"
          period = 3600
          metrics = [
            concat([local.app_ns, "EntitiesPerDocument"], local.chat_dim),
            concat([local.app_ns, "RelationshipsPerDocument"], local.chat_dim)
          ]
        }
      }
    ]
  })
}

# -------------------------------------------------------
# 6. Bedrock spend budget
# -------------------------------------------------------
resource "aws_budgets_budget" "bedrock" {
  name         = "doc-analysis-bedrock-monthly"
  budget_type  = "COST"
  limit_amount = var.bedrock_monthly_budget_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = ["Amazon Bedrock"]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.ai_alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.ai_alerts.arn]
  }

  depends_on = [aws_sns_topic_policy.ai_alerts]
}

# -------------------------------------------------------
# 7. svc-role change alert (us-east-1 — where IAM's CloudTrail events land)
#
# Fires on any inline/managed policy or trust policy change to the svc role,
# including legitimate `terraform apply` runs that touch it.
# -------------------------------------------------------
resource "aws_sns_topic" "iam_alerts" {
  provider          = aws.us_east_1
  name              = "doc-analysis-iam-alerts"
  kms_master_key_id = aws_kms_key.sns_us_east_1.arn

  tags = {
    Owner   = var.owner
    Project = var.project
  }
}

resource "aws_sns_topic_policy" "iam_alerts" {
  provider = aws.us_east_1
  arn      = aws_sns_topic.iam_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountOwner"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.account_id}:root" }
        Action    = ["sns:Publish", "sns:Subscribe", "sns:GetTopicAttributes", "sns:SetTopicAttributes"]
        Resource  = aws_sns_topic.iam_alerts.arn
      },
      {
        Sid       = "EventBridge"
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sns:Publish"
        Resource  = aws_sns_topic.iam_alerts.arn
        Condition = {
          ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.svc_role_changed.arn }
        }
      }
    ]
  })
}

resource "aws_sns_topic_subscription" "iam_alerts_email" {
  provider  = aws.us_east_1
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.iam_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_event_rule" "svc_role_changed" {
  provider    = aws.us_east_1
  name        = "doc-analysis-svc-role-changed"
  description = "Permissions or trust policy of ${aws_iam_role.svc_role.name} changed"

  event_pattern = jsonencode({
    source        = ["aws.iam"]
    "detail-type" = ["AWS API Call via CloudTrail"]
    detail = {
      eventSource = ["iam.amazonaws.com"]
      eventName = [
        "PutRolePolicy",
        "DeleteRolePolicy",
        "AttachRolePolicy",
        "DetachRolePolicy",
        "UpdateAssumeRolePolicy"
      ]
      requestParameters = {
        roleName = [aws_iam_role.svc_role.name]
      }
    }
  })
}

resource "aws_cloudwatch_event_target" "svc_role_changed" {
  provider = aws.us_east_1
  rule     = aws_cloudwatch_event_rule.svc_role_changed.name
  arn      = aws_sns_topic.iam_alerts.arn
}

# -------------------------------------------------------
# 8. Optional CloudTrail trail
#
# Bedrock runtime calls (InvokeModel/Converse) are management events and show in
# the free 90-day Event history without a trail. Enable this for longer retention
# or if the account has no trail (EventBridge IAM alerts above need one).
# -------------------------------------------------------
resource "aws_s3_bucket" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = "${var.project}-cloudtrail-${var.account_id}"

  tags = {
    Owner   = var.owner
    Project = var.project
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Access logs go to the shared bucket in access-logs.tf
resource "aws_s3_bucket_logging" "cloudtrail" {
  count         = var.enable_cloudtrail ? 1 : 0
  bucket        = aws_s3_bucket.cloudtrail[0].id
  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "cloudtrail/"
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.cloudtrail[0].arn,
          "${aws_s3_bucket.cloudtrail[0].arn}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
      {
        Sid       = "AclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.cloudtrail[0].arn
        Condition = {
          StringEquals = { "aws:SourceArn" = local.trail_arn }
        }
      },
      {
        Sid       = "Write"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.cloudtrail[0].arn}/AWSLogs/${var.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"  = "bucket-owner-full-control"
            "aws:SourceArn" = local.trail_arn
          }
        }
      }
    ]
  })
}

locals {
  trail_name = "doc-analysis-trail"
  trail_arn  = "arn:aws:cloudtrail:${var.region}:${var.account_id}:trail/${local.trail_name}"
}

resource "aws_cloudtrail" "this" {
  count                         = var.enable_cloudtrail ? 1 : 0
  name                          = local.trail_name
  s3_bucket_name                = aws_s3_bucket.cloudtrail[0].id
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true

  depends_on = [aws_s3_bucket_policy.cloudtrail]

  tags = {
    Owner   = var.owner
    Project = var.project
  }
}

output "ai_alerts_topic_arn" {
  description = "SNS topic for AI alarms and budget notifications"
  value       = aws_sns_topic.ai_alerts.arn
}

output "ai_dashboard_name" {
  description = "CloudWatch dashboard for AI monitoring"
  value       = aws_cloudwatch_dashboard.ai.dashboard_name
}
