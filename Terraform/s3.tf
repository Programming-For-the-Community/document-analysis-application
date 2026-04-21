resource "aws_s3_bucket" "documents" {
  bucket = "${var.tf_project_name}-documents-${var.account_id}"

  tags = {
    Owner       = var.owner
    Project     = var.project
    Description = "Source document storage for the ${var.project} application"
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Grant Textract permission to read documents from S3
resource "aws_s3_bucket_policy" "documents" {
  bucket = aws_s3_bucket.documents.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "textract.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.documents.arn}/*"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = var.account_id
          }
        }
      }
    ]
  })
}

output "documents_bucket_name" {
  description = "S3 bucket name for document uploads"
  value       = aws_s3_bucket.documents.bucket
}

output "documents_bucket_arn" {
  description = "S3 bucket ARN for document uploads"
  value       = aws_s3_bucket.documents.arn
}
