import {
  TextractClient,
  StartDocumentAnalysisCommand,
  FeatureType,
} from '@aws-sdk/client-textract';

import { AWS_STS } from './sts';
import { awsConfig } from '../main/config';
import { Logger } from '../utils/logger';

export class AWS_TEXTRACT {
  private static client: TextractClient;

  public static init(): void {
    this.client = new TextractClient({
      region: awsConfig.region,
      credentials: {
        accessKeyId: AWS_STS.credentials.accessKeyId,
        secretAccessKey: AWS_STS.credentials.secretAccessKey,
        sessionToken: AWS_STS.credentials.sessionToken,
      },
    });
    Logger.debug(`Textract client initialized (region: ${awsConfig.region})`);
  }

  public static async startDocumentAnalysis(
    s3Key: string,
    s3Bucket: string,
    snsTopicArn: string,
    documentId: string
  ): Promise<string> {
    const result = await this.client.send(
      new StartDocumentAnalysisCommand({
        DocumentLocation: {
          S3Object: { Bucket: s3Bucket, Name: s3Key },
        },
        FeatureTypes: [FeatureType.FORMS, FeatureType.TABLES],
        NotificationChannel: {
          SNSTopicArn: snsTopicArn,
          RoleArn: awsConfig.roleArn,
        },
        JobTag: documentId,
      })
    );
    const jobId = result.JobId ?? '';
    Logger.info(`Textract job started for document ${documentId}: jobId=${jobId}`);
    return jobId;
  }
}
