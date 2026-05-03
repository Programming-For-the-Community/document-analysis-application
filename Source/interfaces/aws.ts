export interface AWSConfig {
  region: string
  roleArn: string
  secretName: string
};

export interface RoleCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string | undefined
};

export interface SecretValues {
  cognitoUserPoolId: string
  cognitoClientId: string
  s3Bucket: string
  dynamoProjectStateTable: string
  dynamoProjectAccessTable: string
  sqsQueueUrl: string
  snsTopicArn: string
  neo4jPassword: string
  qdrantApiKey: string
};