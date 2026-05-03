export interface DynamoDBConfig {
  projectStateTable: string
  projectAccessTable: string
}

export interface Neo4JConfig {
    uri: string
    user: string
    password: string
};

export interface QdrantConfig {
    url: string
    apiKey: string
};

export interface CognitoConfig {
    userPoolId: string
    clientId: string
};

export interface S3Config {
    documentBucket: string
};

export interface SNSConfig {
    topicArn: string
};

export interface SQSConfig {
    queueUrl: string
};