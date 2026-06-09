import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  Block,
} from '@aws-sdk/client-textract';

export type { Block };

import { AWS_STS } from './sts';
import { AWS_SECRETS } from './secrets';
import { awsConfig } from '../main/config';
import { Logger } from '../utils/logger';

export class AWS_TEXTRACT {
  private static client: TextractClient;

  public static init(): void {
    this.client = new TextractClient({
      region: awsConfig.region,
      credentials: async () => {
        await AWS_STS.maybeRefresh();
        return {
          accessKeyId: AWS_STS.credentials.accessKeyId,
          secretAccessKey: AWS_STS.credentials.secretAccessKey,
          sessionToken: AWS_STS.credentials.sessionToken,
        };
      },
    });
    Logger.debug(`Textract client initialized (region: ${awsConfig.region})`);
  }

  public static async getJobStatus(
    jobId: string
  ): Promise<{
    status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'PARTIAL_SUCCESS';
    message: string;
  }> {
    const result = await this.client.send(
      new GetDocumentTextDetectionCommand({ JobId: jobId, MaxResults: 1 })
    );
    return {
      status: (result.JobStatus ?? 'FAILED') as
        | 'IN_PROGRESS'
        | 'SUCCEEDED'
        | 'FAILED'
        | 'PARTIAL_SUCCESS',
      message: result.StatusMessage ?? 'no details',
    };
  }

  public static async getDocumentAnalysis(jobId: string): Promise<Block[]> {
    const blocks: Block[] = [];
    let nextToken: string | undefined;

    do {
      const result = await this.client.send(
        new GetDocumentTextDetectionCommand({ JobId: jobId, NextToken: nextToken })
      );
      blocks.push(...(result.Blocks ?? []));
      nextToken = result.NextToken;
    } while (nextToken);

    Logger.debug(`GetDocumentTextDetection ${jobId}: retrieved ${blocks.length} block(s)`);
    return blocks;
  }

  public static async startDocumentAnalysis(
    s3Key: string,
    s3Bucket: string,
    snsTopicArn: string,
    documentId: string
  ): Promise<string> {
    const result = await this.client.send(
      new StartDocumentTextDetectionCommand({
        DocumentLocation: {
          S3Object: { Bucket: s3Bucket, Name: s3Key },
        },
        NotificationChannel: {
          SNSTopicArn: snsTopicArn,
          RoleArn: AWS_SECRETS.secrets.SVC_ROLE_ARN,
        },
        JobTag: documentId,
      })
    );
    const jobId = result.JobId ?? '';
    Logger.info(`Textract text detection started for document ${documentId}: jobId=${jobId}`);
    return jobId;
  }
}
