import path from 'path';
import dotenv from 'dotenv';

import { AWSConfig, SecretValues } from '../interfaces/aws';
import { DBConnectionsConfig } from '../interfaces/db';
import { DynamoDBConfig, CognitoConfig, S3Config, SNSConfig, SQSConfig, Neo4JConfig, QdrantConfig } from '../interfaces/app';

dotenv.config({ path: process.env['NODE_ENV'] ?? path.join(__dirname, '../../.env') });

export const awsConfig: AWSConfig = {
    region: process.env['AWS_REGION'] || '',
    roleArn: process.env['AWS_ROLE_ARN'] || '',
    secretName: process.env['AWS_SECRET_NAME'] || '',
};

export const databaseCxnsConfig: DBConnectionsConfig = {
    neo4jUri: process.env['NEO4J_URI'] || '',
    qdrantUrl: process.env['QDRANT_URL'] || '',
};

export interface AppConfig {
    dynamoDB: DynamoDBConfig;
    cognito: CognitoConfig;
    s3: S3Config;
    sns: SNSConfig;
    sqs: SQSConfig;
    neo4j: Neo4JConfig;
    qdrant: QdrantConfig;
}

export function buildAppConfig(secrets: SecretValues): AppConfig {
    return {
        dynamoDB: {
            projectStateTable: secrets.dynamoProjectStateTable,
            projectAccessTable: secrets.dynamoProjectAccessTable,
        },
        cognito: {
            userPoolId: secrets.cognitoUserPoolId,
            clientId: secrets.cognitoClientId,
        },
        s3: {
            documentBucket: secrets.s3Bucket,
        },
        sns: {
            topicArn: secrets.snsTopicArn,
        },
        sqs: {
            queueUrl: secrets.sqsQueueUrl,
        },
        neo4j: {
            uri: process.env['NEO4J_URI'] || '',
            user: 'neo4j',
            password: secrets.neo4jPassword,
        },
        qdrant: {
            url: process.env['QDRANT_URL'] || '',
            apiKey: secrets.qdrantApiKey,
        },
    };
}
