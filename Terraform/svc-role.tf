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
      }
    ]
  })

  tags = {
    Owner       = var.owner
    Project     = var.project
    Description = "Service account role for the ${var.project} application"
  }
}

resource "aws_iam_role_policy" "svc_role_secrets" {
  name = "${var.tf_project_name}-secrets-manager-read"
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
