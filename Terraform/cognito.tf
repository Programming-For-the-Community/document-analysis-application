resource "aws_cognito_user_pool" "users" {
  name = "${var.tf_project_name}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = true
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = false
    require_uppercase = false
    require_numbers   = false
    require_symbols   = false
  }

  mfa_configuration = "OFF"

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  deletion_protection = "ACTIVE"

  tags = {
    Owner       = var.owner
    Project     = var.project
    Description = "User pool for the ${var.project} application"
  }
}

resource "aws_cognito_user_pool_client" "electron_app" {
  name         = "${var.tf_project_name}-electron"
  user_pool_id = aws_cognito_user_pool.users.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  prevent_user_existence_errors = "ENABLED"

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}


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
