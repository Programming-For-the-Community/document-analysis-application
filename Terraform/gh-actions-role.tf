data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "gh_actions_role" {
  name = "doc-analysis-gh-actions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = data.aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:*"
          }
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "gh_actions_terraform" {
  name = "doc-analysis-gh-actions-terraform"
  role = aws_iam_role.gh_actions_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::doc-analysis-tfstate-048908104884",
          "arn:aws:s3:::doc-analysis-tfstate-048908104884/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:GetRole",
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:UpdateRole",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:GetRolePolicy",
          "iam:PassRole"
        ]
        Resource = "arn:aws:iam::${var.account_id}:role/doc-analysis-*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:CreateSecret",
          "secretsmanager:DeleteSecret",
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecret"
        ]
        Resource = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${var.secrets_manager_path}/*"
      }
    ]
  })
}

output "gh_actions_role_arn" {
  description = "Set this as the AWS_DEPLOY_SVC_ACCT_ARN secret in GitHub"
  value       = aws_iam_role.gh_actions_role.arn
}
