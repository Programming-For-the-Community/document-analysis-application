data "aws_secretsmanager_secret" "app_config" {
  name = var.secrets_manager_path
}

resource "aws_secretsmanager_secret_version" "app_config" {
  secret_id = data.aws_secretsmanager_secret.app_config.id

  secret_string = jsonencode({
    SVC_ROLE_ARN                  = aws_iam_role.svc_role.arn
    COGNITO_USER_POOL_ID          = aws_cognito_user_pool.users.id
    COGNITO_CLIENT_ID             = aws_cognito_user_pool_client.electron_app.id
    S3_BUCKET                     = aws_s3_bucket.documents.bucket
    DYNAMODB_PROJECT_STATE_TABLE  = aws_dynamodb_table.project_state.name
    DYNAMODB_PROJECT_ACCESS_TABLE = aws_dynamodb_table.project_access.name
    SQS_QUEUE_URL                 = aws_sqs_queue.textract_results.url
    SNS_TOPIC_ARN                 = aws_sns_topic.textract_results.arn
    BEDROCK_MODEL_ID              = var.bedrock_model
    QDRANT_KEY                    = var.qdrant_api_key
    SVC_PWD                       = var.svc_acct_password
    SVC_USER                      = var.svc_acct_username
  })
}
