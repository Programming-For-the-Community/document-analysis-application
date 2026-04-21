resource "aws_iam_role" "svc_role" {
  name = "${var.project}-svc-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:user/${var.user_arn}"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "svc_role_secrets" {
  name = "${var.project}-secrets-manager-read"
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
        Resource = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${var.secrets_manager_path}/*"
      }
    ]
  })
}

output "svc_role_arn" {
  description = "Paste this into ROLE_ARN in deploy.sh"
  value       = aws_iam_role.svc_role.arn
}
