import path from 'path';
import dotenv from 'dotenv';

import { AWSConfig } from '../interfaces/aws';
import { DBConnectionsConfig } from '../interfaces/db';

dotenv.config({ path: process.env['NODE_ENV'] ?? path.join(__dirname, '../../.env') });

export const awsConfig: AWSConfig = {
    region: process.env['AWS_REGION'] || '',
    roleArn: process.env['AWS_ROLE_ARN'] || '',
    secretName: process.env['AWS_SECRET_NAME'] || '',
};

export const databaseCxnsConfig: DBConnectionsConfig = {
    neo4jUri: process.env['NEO4J_URI'] || '',
    qdrantUrl: process.env['QDRANT_URL'] || '',
}