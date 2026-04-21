resource "aws_cognito_user_pool" "users" {
  name = "${var.tf_project_name}-users"

  # Use email as the login identifier
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  # Send verification and recovery codes via email
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Verification email sent on sign-up
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your ${var.project} verification code"
    email_message        = "Your verification code is {####}"
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 5
      max_length = 254
    }
  }

  tags = {
    Owner       = var.owner
    Project     = var.project
    Description = "User pool for the ${var.project} application"
  }
}

# App client for the Electron app
# Uses PKCE (no client secret) — correct for native/desktop apps
resource "aws_cognito_user_pool_client" "electron_app" {
  name         = "${var.tf_project_name}-electron"
  user_pool_id = aws_cognito_user_pool.users.id

  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]

  # Custom protocol callback for Electron
  callback_urls = ["${var.electron_callback_url}"]
  logout_urls   = ["${var.electron_callback_url}/logout"]

  supported_identity_providers = ["COGNITO"]

  # Token validity
  access_token_validity  = 1   # hours
  id_token_validity      = 1   # hours
  refresh_token_validity = 30  # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Prevent user existence errors leaking during login
  prevent_user_existence_errors = "ENABLED"
}

# Hosted UI domain for the OAuth login page
resource "aws_cognito_user_pool_domain" "users" {
  domain       = "${var.tf_project_name}-auth"
  user_pool_id = aws_cognito_user_pool.users.id
}

# Allow the svc_role to look up users by email (needed for the sharing feature)
resource "aws_iam_role_policy" "svc_role_cognito" {
  name = "doc-analysis-cognito-read"
  role = aws_iam_role.svc_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:GetUser",
          "cognito-idp:ListUsers",
          "cognito-idp:AdminGetUser"
        ]
        Resource = aws_cognito_user_pool.users.arn
      }
    ]
  })
}

# -------------------------------------------------------
# Outputs
# -------------------------------------------------------
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID — needed in the Electron app config"
  value       = aws_cognito_user_pool.users.id
}

output "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.users.arn
}

output "cognito_client_id" {
  description = "Cognito App Client ID — needed in the Electron app config"
  value       = aws_cognito_user_pool_client.electron_app.id
}

output "cognito_auth_domain" {
  description = "Cognito hosted UI base URL"
  value       = "https://${aws_cognito_user_pool_domain.users.domain}.auth.${var.region}.amazoncognito.com"
}
