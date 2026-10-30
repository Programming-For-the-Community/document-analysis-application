import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { AWS_S3 } from '../../../classes/aws/s3';
import { clientOf, resolveClientCredentials, stubStsCredentials } from '../../helpers';

const s3 = mockClient(S3Client);
const config = { documentBucket: 'docs' };
const releases = { bucket: 'releases' };

type Body = GetObjectCommandOutput['Body'];
const textBody = (text: string) => ({ transformToString: async () => text }) as unknown as Body;

describe('AWS_S3', () => {
  let tmpDir: string;

  beforeEach(() => {
    s3.reset();
    stubStsCredentials();
    AWS_S3.init();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 's3-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sources credentials from the assumed role', async () => {
    await expect(resolveClientCredentials(clientOf(AWS_S3))).resolves.toMatchObject({
      accessKeyId: 'AKIA',
    });
  });

  it('builds per-document text and embedding keys', () => {
    expect(AWS_S3.textKey('o', 'p', 'd')).toBe('o/p/text/d.txt');
    expect(AWS_S3.embeddingKey('o', 'p', 'd')).toBe('o/p/embeddings/d.json');
  });

  it('deletes every page of objects under a prefix', async () => {
    s3.on(ListObjectsV2Command)
      .resolvesOnce({
        Contents: [{ Key: 'a' }, { Key: 'b' }],
        IsTruncated: true,
        NextContinuationToken: 't',
      })
      .resolvesOnce({ Contents: [], IsTruncated: false });
    s3.on(DeleteObjectsCommand).resolves({});

    await AWS_S3.deleteProjectObjects('owner/proj/', config);

    expect(s3.commandCalls(ListObjectsV2Command)[1]!.args[0].input.ContinuationToken).toBe('t');
    const deletes = s3.commandCalls(DeleteObjectsCommand);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.args[0].input.Delete!.Objects).toEqual([{ Key: 'a' }, { Key: 'b' }]);
  });

  it('lists keys across pages, skipping keyless entries', async () => {
    s3.on(ListObjectsV2Command)
      .resolvesOnce({ Contents: [{ Key: 'a' }, {}], IsTruncated: true, NextContinuationToken: 't' })
      .resolvesOnce({ Contents: [{ Key: 'b' }] })
      .resolves({});

    await expect(AWS_S3.listKeys('p/', config)).resolves.toEqual(['a', 'b']);
    await expect(AWS_S3.listKeys('p/', config)).resolves.toEqual([]);
  });

  it('reads objects as text or bytes, defaulting when the body is empty', async () => {
    s3.on(GetObjectCommand)
      .resolvesOnce({ Body: textBody('hello') })
      .resolvesOnce({})
      .resolvesOnce({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2]) } as unknown as Body,
      })
      .resolvesOnce({});

    await expect(AWS_S3.getObjectText('k', config)).resolves.toBe('hello');
    await expect(AWS_S3.getObjectText('k', config)).resolves.toBe('');
    await expect(AWS_S3.getObjectBytes('k', config)).resolves.toEqual(new Uint8Array([1, 2]));
    await expect(AWS_S3.getObjectBytes('k', config)).resolves.toEqual(new Uint8Array());
  });

  it('writes JSON and text objects with their content types', async () => {
    s3.on(PutObjectCommand).resolves({});

    await AWS_S3.putJson('k.json', { a: 1 }, config);
    await AWS_S3.putText('k.txt', 'body', config);

    const [json, text] = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input);
    expect(json).toMatchObject({
      Bucket: 'docs',
      Key: 'k.json',
      Body: '{"a":1}',
      ContentType: 'application/json',
    });
    expect(text).toMatchObject({ Key: 'k.txt', Body: 'body', ContentType: 'text/plain' });
  });

  it('deletes a batch of keys, skipping an empty batch', async () => {
    s3.on(DeleteObjectsCommand).resolves({});

    await AWS_S3.deleteKeys([], config);
    await AWS_S3.deleteKeys(['a', 'b'], config);

    const deletes = s3.commandCalls(DeleteObjectsCommand);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.args[0].input.Delete).toEqual({
      Objects: [{ Key: 'a' }, { Key: 'b' }],
      Quiet: true,
    });
  });

  it('uploads a document stream with its name and project as metadata', async () => {
    const file = path.join(tmpDir, 'doc.txt');
    fs.writeFileSync(file, 'content');
    s3.on(PutObjectCommand).resolves({});

    await AWS_S3.uploadDocument(file, 'o/p/d', 7, config, 'doc.txt', 'Project');

    const input = s3.commandCalls(PutObjectCommand)[0]!.args[0].input;
    expect(input).toMatchObject({
      Key: 'o/p/d',
      ContentLength: 7,
      Metadata: { 'document-name': 'doc.txt', 'project-name': 'Project' },
    });
    // Drain the stream so it isn't still opening the file when tmpDir is removed
    await new Promise<void>((resolve) =>
      (input.Body as fs.ReadStream).on('close', () => resolve()).resume()
    );
  });

  describe('getReleaseJson', () => {
    it('parses the release manifest', async () => {
      s3.on(GetObjectCommand).resolves({ Body: textBody('{"version":"1.2.0"}') });
      await expect(AWS_S3.getReleaseJson('win/latest.json', releases)).resolves.toEqual({
        version: '1.2.0',
      });
      expect(s3.commandCalls(GetObjectCommand)[0]!.args[0].input.Bucket).toBe('releases');
    });

    it('returns null for an empty body', async () => {
      s3.on(GetObjectCommand).resolves({});
      await expect(AWS_S3.getReleaseJson('k', releases)).resolves.toBeNull();
    });

    it('returns null when nothing has been published', async () => {
      s3.on(GetObjectCommand).rejects(Object.assign(new Error('missing'), { name: 'NoSuchKey' }));
      await expect(AWS_S3.getReleaseJson('k', releases)).resolves.toBeNull();
    });

    it('rethrows other errors', async () => {
      s3.on(GetObjectCommand).rejects(new Error('AccessDenied'));
      await expect(AWS_S3.getReleaseJson('k', releases)).rejects.toThrow('AccessDenied');
    });
  });

  describe('downloadRelease', () => {
    it('streams to disk, reporting progress and returning the SHA-512', async () => {
      const chunks = [Buffer.from('abc'), Buffer.from('defg')];
      s3.on(GetObjectCommand).resolves({ Body: Readable.from(chunks) as unknown as Body });
      const dest = path.join(tmpDir, 'setup.exe');
      const onProgress = vi.fn();

      const sha = await AWS_S3.downloadRelease('win/1.0.0/setup.exe', dest, releases, onProgress);

      expect(fs.readFileSync(dest, 'utf-8')).toBe('abcdefg');
      expect(onProgress.mock.calls.map(([n]) => n)).toEqual([3, 7]);
      expect(sha).toBe(crypto.createHash('sha512').update('abcdefg').digest('base64'));
    });

    it('rejects an empty body', async () => {
      s3.on(GetObjectCommand).resolves({});
      await expect(
        AWS_S3.downloadRelease('k', path.join(tmpDir, 'x'), releases, vi.fn())
      ).rejects.toThrow('Empty body');
    });
  });
});
