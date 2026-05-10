import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  Message,
} from '@aws-sdk/client-sqs';

import { AWS_STS } from './sts';
import { awsConfig } from '../main/config';
import { Logger } from '../utils/logger';

export type { Message };

export class AWS_SQS {
  private static client: SQSClient;

  public static init(): void {
    this.client = new SQSClient({
      region: awsConfig.region,
      credentials: {
        accessKeyId: AWS_STS.credentials.accessKeyId,
        secretAccessKey: AWS_STS.credentials.secretAccessKey,
        sessionToken: AWS_STS.credentials.sessionToken,
      },
    });
    Logger.debug(`SQS client initialized (region: ${awsConfig.region})`);
  }

  public static async receiveMessages(queueUrl: string): Promise<Message[]> {
    const result = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,       // long polling
        VisibilityTimeout: 600,    // 10 min — enough for trailing window + batch processing
      })
    );
    return result.Messages ?? [];
  }

  public static async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle })
    );
    Logger.debug(`SQS message deleted: ${receiptHandle.slice(0, 20)}…`);
  }

  public static async returnToQueue(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: 0,
      })
    );
    Logger.debug(`SQS message returned to queue: ${receiptHandle.slice(0, 20)}…`);
  }
}
