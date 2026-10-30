import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  TextractClient,
} from '@aws-sdk/client-textract';

import { AWS_TEXTRACT } from '../../../classes/aws/textract';
import { AWS_SECRETS } from '../../../classes/aws/secrets';
import { SecretValues } from '../../../interfaces/aws';
import { clientOf, resolveClientCredentials, stubStsCredentials } from '../../helpers';

const textract = mockClient(TextractClient);

describe('AWS_TEXTRACT', () => {
  beforeEach(() => {
    textract.reset();
    stubStsCredentials();
    AWS_TEXTRACT.init();
  });

  it('sources credentials from the assumed role', async () => {
    await expect(resolveClientCredentials(clientOf(AWS_TEXTRACT))).resolves.toMatchObject({
      accessKeyId: 'AKIA',
    });
  });

  it('reports job status, defaulting to FAILED', async () => {
    textract
      .on(GetDocumentTextDetectionCommand)
      .resolvesOnce({ JobStatus: 'SUCCEEDED', StatusMessage: 'ok' })
      .resolvesOnce({});

    await expect(AWS_TEXTRACT.getJobStatus('job')).resolves.toEqual({
      status: 'SUCCEEDED',
      message: 'ok',
    });
    await expect(AWS_TEXTRACT.getJobStatus('job')).resolves.toEqual({
      status: 'FAILED',
      message: 'no details',
    });
  });

  it('collects blocks across every result page', async () => {
    textract
      .on(GetDocumentTextDetectionCommand)
      .resolvesOnce({ Blocks: [{ BlockType: 'LINE', Text: 'a' }], NextToken: 't1' })
      .resolvesOnce({ NextToken: 't2' })
      .resolvesOnce({ Blocks: [{ BlockType: 'LINE', Text: 'b' }] });

    const blocks = await AWS_TEXTRACT.getDocumentAnalysis('job');

    expect(blocks.map((b) => b.Text)).toEqual(['a', 'b']);
    expect(textract.commandCalls(GetDocumentTextDetectionCommand)[1]!.args[0].input.NextToken).toBe(
      't1'
    );
  });

  it('starts text detection with an SNS notification channel', async () => {
    vi.spyOn(AWS_SECRETS, 'secrets', 'get').mockReturnValue({
      SVC_ROLE_ARN: 'arn:role',
    } as SecretValues);
    textract.on(StartDocumentTextDetectionCommand).resolvesOnce({ JobId: 'job-1' }).resolves({});

    await expect(
      AWS_TEXTRACT.startDocumentAnalysis('key', 'bucket', 'arn:topic', 'doc')
    ).resolves.toBe('job-1');
    await expect(
      AWS_TEXTRACT.startDocumentAnalysis('key', 'bucket', 'arn:topic', 'doc')
    ).resolves.toBe('');

    expect(
      textract.commandCalls(StartDocumentTextDetectionCommand)[0]!.args[0].input
    ).toMatchObject({
      DocumentLocation: { S3Object: { Bucket: 'bucket', Name: 'key' } },
      NotificationChannel: { SNSTopicArn: 'arn:topic', RoleArn: 'arn:role' },
      JobTag: 'doc',
    });
  });
});
