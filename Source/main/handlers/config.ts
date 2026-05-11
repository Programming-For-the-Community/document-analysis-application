import { ipcMain } from 'electron';

import { awsConfig } from '../config';
import { AWS_SECRETS } from '../../aws/secrets';
import { AppConfig } from '../../interfaces/app';
import { Logger } from '../../utils/logger';

export function registerConfigHandlers(getAppConfig: () => AppConfig | null): void {
  ipcMain.handle('config:get', () => {
    const config = getAppConfig();

    Logger.debug(
      `config:get — region: ${awsConfig.region}, s3: ${config?.s3.documentBucket ?? 'n/a'}, ` +
      `neo4j: ${config?.neo4j.uri ?? 'n/a'} (password: ********), ` +
      `qdrant: ${config?.qdrant.url ?? 'n/a'} (key: ********)`
    );

    return {
      region: awsConfig.region,
      roleArn: AWS_SECRETS.secrets?.SVC_ROLE_ARN,
      s3Bucket: config?.s3.documentBucket,
      dynamoProjectStateTable: config?.dynamoDB.projectStateTable,
      dynamoProjectAccessTable: config?.dynamoDB.projectAccessTable,
      sqsQueueUrl: config?.sqs.queueUrl,
      snsTopicArn: config?.sns.topicArn,
      neo4jUri: config?.neo4j.uri,
      neo4jPassword: config?.neo4j.password,
      qdrantUrl: config?.qdrant.url,
      qdrantApiKey: config?.qdrant.apiKey,
    };
  });
}