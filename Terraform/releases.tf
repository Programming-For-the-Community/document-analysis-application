# -------------------------------------------------------
# Desktop app releases — private
#
# Layout (written by Source/scripts/release.js):
#   {platform}/latest.json                      — manifest the app checks after login
#   {platform}/{version}/{installer}            — immutable installer per version
#   {platform}/{version}/manifest.json          — copy of that version's manifest
#
# The bucket is never public. The app downloads updates with its existing
# svc-role STS credentials (read-only grant below); publishing uses the
# release_publisher policy, attached to whoever runs the release script.
# -------------------------------------------------------
resource "aws_s3_bucket" "releases" {
  bucket = "${var.project}-releases-${var.account_id}"

  tags = {
    Owner       = var.owner
    Project     = var.project
    Description = "Private desktop installer releases for the ${var.project} application"
  }
}

resource "aws_s3_bucket_public_access_block" "releases" {
  bucket = aws_s3_bucket.releases.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "releases" {
  bucket = aws_s3_bucket.releases.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "releases" {
  bucket = aws_s3_bucket.releases.id

  versioning_configuration {
    status = "Enabled"
  }
}

# latest.json is overwritten on every release — keep superseded copies for 90 days
# so a bad release can be rolled back by restoring the previous manifest version.
resource "aws_s3_bucket_lifecycle_configuration" "releases" {
  bucket = aws_s3_bucket.releases.id

  rule {
    id     = "expire-superseded-manifests"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_s3_bucket_policy" "releases" {
  bucket = aws_s3_bucket.releases.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.releases.arn,
          "${aws_s3_bucket.releases.arn}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}

# App side: download-only. The svc role can never write or delete a release.
resource "aws_iam_role_policy" "svc_role_releases" {
  name = "doc-analysis-releases-read"
  role = aws_iam_role.svc_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.releases.arn}/*"
      }
    ]
  })
}

# Publisher side: attach to the IAM user/role that runs `npm run release`.
# Not attached here because the publisher identity is outside this stack.
resource "aws_iam_policy" "release_publisher" {
  name        = "doc-analysis-release-publisher"
  description = "Publish desktop installers to the ${var.project} release bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.releases.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.releases.arn
      },
      {
        # release.js reads RELEASE_BUCKET from the app secret
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${var.secrets_manager_path}*"
      }
    ]
  })

  tags = {
    Owner   = var.owner
    Project = var.project
  }
}

output "releases_bucket_name" {
  description = "Private S3 bucket holding desktop installers"
  value       = aws_s3_bucket.releases.bucket
}

output "release_publisher_policy_arn" {
  description = "Attach to the identity that runs the release script"
  value       = aws_iam_policy.release_publisher.arn
}
