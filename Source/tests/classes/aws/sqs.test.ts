import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

import { AWS_SQS } from '../../../classes/aws/sqs';
import { clientOf, resolveClientCredentials, stubStsCredentials } from '../../helpers';

const sqs = mockClient(SQSClient);

describe('AWS_SQS', () => {
  beforeEach(() => {
    sqs.reset();
    stubStsCredentials();
    AWS_SQS.init();
  });

  it('sources credentials from the assumed role', async () => {
    await expect(resolveClientCredentials(clientOf(AWS_SQS))).resolves.toMatchObject({
      accessKeyId: 'AKIA',
    });
  });

  it('long-polls for messages', async () => {
    sqs.on(ReceiveMessageCommand).resolves({ Messages: [{ MessageId: 'm1' }] });

    await expect(AWS_SQS.receiveMessages('q')).resolves.toEqual([{ MessageId: 'm1' }]);
    expect(sqs.commandCalls(ReceiveMessageCommand)[0]!.args[0].input).toMatchObject({
      QueueUrl: 'q',
      WaitTimeSeconds: 20,
    });
  });

  it('returns an empty list when no messages arrive', async () => {
    sqs.on(ReceiveMessageCommand).resolves({});
    await expect(AWS_SQS.receiveMessages('q')).resolves.toEqual([]);
  });

  it('deletes a message', async () => {
    sqs.on(DeleteMessageCommand).resolves({});

    await AWS_SQS.deleteMessage('q', 'receipt-handle-0123456789');

    expect(sqs.commandCalls(DeleteMessageCommand)[0]!.args[0].input).toEqual({
      QueueUrl: 'q',
      ReceiptHandle: 'receipt-handle-0123456789',
    });
  });

  it('returns a message to the queue immediately', async () => {
    sqs.on(ChangeMessageVisibilityCommand).resolves({});

    await AWS_SQS.returnToQueue('q', 'rh');

    expect(sqs.commandCalls(ChangeMessageVisibilityCommand)[0]!.args[0].input).toMatchObject({
      ReceiptHandle: 'rh',
      VisibilityTimeout: 0,
    });
  });
});
