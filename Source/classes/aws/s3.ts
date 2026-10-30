import crypto from 'crypto';
import fs from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { AWS_STS } from './sts';
import { awsConfig } from '../../main/config';
import { S3Config, ReleasesConfig } from '../../interfaces/config';
import { Logger } from '../../utils/logger';

export class AWS_S3 {
  // Client is created inside init() because it needs STS credentials
  // that aren't available until AWS_STS.init() has completed.
  private static client: S3Client;

  public static init(): void {
    this.client = new S3Client({
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

  public static async listKeys(prefix: string, config: S3Config): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: config.documentBucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );
      for (const obj of result.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
  }

  public static textKey(ownerSub: string, projectId: string, documentId: string): string {
    return `${ownerSub}/${projectId}/text/${documentId}.txt`;
  }

  public static embeddingKey(ownerSub: string, projectId: string, documentId: string): string {
    return `${ownerSub}/${projectId}/embeddings/${documentId}.json`;
  }

  public static async getObjectText(key: string, config: S3Config): Promise<string> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: config.documentBucket, Key: key })
    );
    return (await result.Body?.transformToString()) ?? '';
  }

  public static async getObjectBytes(key: string, config: S3Config): Promise<Uint8Array> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: config.documentBucket, Key: key })
    );
    return (await result.Body?.transformToByteArray()) ?? new Uint8Array();
  }

  public static async putJson(key: string, data: unknown, config: S3Config): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: config.documentBucket,
        Key: key,
        Body: JSON.stringify(data),
        ContentType: 'application/json',
      })
    );
    Logger.debug(`Wrote JSON to S3: ${key}`);
  }

  public static async putText(key: string, text: string, config: S3Config): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: config.documentBucket,
        Key: key,
        Body: text,
        ContentType: 'text/plain',
      })
    );
    Logger.debug(`Wrote text to S3: ${key}`);
  }

  public static async deleteKeys(keys: string[], config: S3Config): Promise<void> {
    if (keys.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: config.documentBucket,
        Delete: {
          Objects: keys.map((k) => ({ Key: k })),
          Quiet: true,
        },
      })
    );
    Logger.debug(`Deleted ${keys.length} S3 object(s)`);
  }

  public static async uploadDocument(
    filePath: string,
    s3Key: string,
    fileSize: number,
    config: S3Config,
    documentName: string,
    projectName: string
  ): Promise<void> {
    Logger.debug(`Uploading ${s3Key} (${fileSize} bytes)`);
    await this.client.send(
      new PutObjectCommand({
        Bucket: config.documentBucket,
        Key: s3Key,
        Body: fs.createReadStream(filePath),
        ContentLength: fileSize,
        Metadata: {
          'document-name': documentName,
          'project-name': projectName,
        },
      })
    );
    Logger.debug(`Uploaded ${s3Key}`);
  }

  // ── Release bucket (read-only for the app) ────────────────────────────────

  // Returns null when the object doesn't exist (no release published yet).
  public static async getReleaseJson<T>(key: string, config: ReleasesConfig): Promise<T | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key })
      );
      return JSON.parse((await result.Body?.transformToString()) ?? 'null') as T | null;
    } catch (err) {
      if (err instanceof Error && err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  // Streams a release object to disk, hashing as it goes so large installers
  // are never held in memory. Returns the base64 SHA-512 of what was written.
  public static async downloadRelease(
    key: string,
    destPath: string,
    config: ReleasesConfig,
    onProgress: (bytes: number) => void
  ): Promise<string> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key })
    );
    if (!result.Body) throw new Error(`Empty body for release object ${key}`);

    const hash = crypto.createHash('sha512');
    let received = 0;
    const body = result.Body as Readable;
    body.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      received += chunk.length;
      onProgress(received);
    });

    await pipeline(body, fs.createWriteStream(destPath));
    return hash.digest('base64');
  }
}
