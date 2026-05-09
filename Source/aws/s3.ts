import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

import { AWS_STS } from './sts';
import { awsConfig } from '../main/config';
import { S3Config } from '../interfaces/app';
import { Logger } from '../utils/logger';

export class AWS_S3 {
  // Client is created inside init() because it needs STS credentials
  // that aren't available until AWS_STS.init() has completed.
  private static client: S3Client;

  public static init(): void {
    this.client = new S3Client({
      region: awsConfig.region,
      credentials: {
        accessKeyId: AWS_STS.credentials.accessKeyId,
        secretAccessKey: AWS_STS.credentials.secretAccessKey,
        sessionToken: AWS_STS.credentials.sessionToken,
      },
    });
    Logger.debug(`S3 client initialized (region: ${awsConfig.region})`);
  }

  public static async deleteProjectObjects(prefix: string, config: S3Config): Promise<void> {
    Logger.info(`Deleting S3 objects under prefix: ${prefix}`);
    let continuationToken: string | undefined;
    let totalDeleted = 0;

    do {
      const listResult = await this.client.send(
        new ListObjectsV2Command({
          Bucket: config.documentBucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      const objects = listResult.Contents ?? [];
      if (objects.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: config.documentBucket,
            Delete: {
              Objects: objects.map((obj) => ({ Key: obj.Key! })),
              Quiet: true,
            },
          })
        );
        totalDeleted += objects.length;
      }

      continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
    } while (continuationToken);

    Logger.info(`Deleted ${totalDeleted} S3 object(s) under prefix: ${prefix}`);
  }
}