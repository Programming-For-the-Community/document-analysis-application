import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@aws-sdk/client-sqs';

import { startPoller, stopPoller } from '../../../main/services/sqs-poller';
import { embedAndStore, saveDocumentText } from '../../../main/services/embedder';
import { discardDocumentArtifacts } from '../../../main/services/document-artifacts';
import { getSessionId } from '../../../main/services/session';
import { AWS_SQS } from '../../../classes/aws/sqs';
import { AWS_S3 } from '../../../classes/aws/s3';
import { AWS_TEXTRACT } from '../../../classes/aws/textract';
import { AWS_BEDROCK } from '../../../classes/aws/bedrock';
import { AWS_DYNAMODB } from '../../../classes/aws/dynamodb';
import { Neo4J } from '../../../classes/neo4j';
import { GraphExtractionError } from '../../../classes/graphExtractionError';
import { MAX_BATCH_WAIT_MS, TRAILING_WINDOW_MS } from '../../../constants/services/sqsPoller';
import { Logger } from '../../../utils/logger';
import { makeConfig, makeGraph } from '../../helpers';
import { sentOn } from '../../mocks/electron';

vi.mock('../../../main/services/embedder', () => ({
  embedAndStore: vi.fn(),
  saveDocumentText: vi.fn(),
}));
vi.mock('../../../main/services/session', () => ({ getSessionId: vi.fn() }));
vi.mock('../../../main/services/document-artifacts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  discardDocumentArtifacts: vi.fn(),
}));

const config = makeConfig();
const LONG_POLL_MS = 20_000;

function textractMessage(
  documentId: string,
  opts: { owner?: string; status?: string; receipt?: string; key?: string } = {}
): Message {
  return {
    ReceiptHandle: opts.receipt ?? `rh-${documentId}`,
    Body: JSON.stringify({
      Message: JSON.stringify({
        JobId: `job-${documentId}`,
        Status: opts.status ?? 'SUCCEEDED',
        StatusMessage: opts.status === 'FAILED' ? 'bad pdf' : undefined,
        DocumentLocation: {
          S3ObjectName: opts.key ?? `${opts.owner ?? 'user-sub'}/proj-1/${documentId}`,
        },
      }),
    }),
  };
}

// Each receive returns the next queued batch immediately; once drained, it
// behaves like an empty long poll (resolves with nothing after 20s).
let batches: Message[][] = [];
function queueBatches(...next: Message[][]) {
  batches.push(...next);
}

const statusesFor = (documentId: string) =>
  sentOn('document:status-update')
    .filter((u) => (u as { documentId: string }).documentId === documentId)
    .map((u) => (u as { status: string }).status);

describe('SQS poller', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    batches = [];
    vi.mocked(getSessionId).mockReturnValue('session-id');
    vi.spyOn(AWS_SQS, 'receiveMessages').mockImplementation(async () => {
      const next = batches.shift();
      if (next) return next;
      await new Promise((resolve) => setTimeout(resolve, LONG_POLL_MS));
      return [];
    });
    vi.spyOn(AWS_SQS, 'deleteMessage').mockResolvedValue();
    vi.spyOn(AWS_SQS, 'returnToQueue').mockResolvedValue();
    vi.spyOn(AWS_DYNAMODB, 'updateDocumentStatus').mockResolvedValue(true);
    vi.spyOn(AWS_DYNAMODB, 'getDocumentName').mockResolvedValue('report.pdf');
    vi.spyOn(AWS_TEXTRACT, 'getDocumentAnalysis').mockResolvedValue([
      { BlockType: 'LINE', Text: 'Jane works at Acme' },
    ]);
    vi.spyOn(AWS_BEDROCK, 'extractRelationships').mockImplementation(async (_b, documentId) =>
      makeGraph(documentId)
    );
    vi.spyOn(AWS_S3, 'putJson').mockResolvedValue();
    vi.spyOn(Neo4J, 'loadGraph').mockResolvedValue();
    vi.mocked(saveDocumentText).mockResolvedValue();
    vi.mocked(embedAndStore).mockResolvedValue();
    vi.mocked(discardDocumentArtifacts).mockResolvedValue();
  });

  afterEach(() => {
    stopPoller();
    vi.useRealTimers();
  });

  async function receiveAndProcess(...messages: Message[]) {
    queueBatches(messages);
    startPoller('user-sub', config);
    await vi.advanceTimersByTimeAsync(TRAILING_WINDOW_MS);
  }

  it('processes a finished Textract job end to end', async () => {
    await receiveAndProcess(textractMessage('doc-1'));

    expect(AWS_DYNAMODB.updateDocumentStatus).toHaveBeenNthCalledWith(
      1,
      'proj-1',
      'doc-1',
      'PROCESSING',
      config.dynamoDB
    );
    expect(saveDocumentText).toHaveBeenCalledWith(
      'user-sub',
      'proj-1',
      'doc-1',
      'Jane works at Acme',
      config
    );
    expect(AWS_S3.putJson).toHaveBeenCalledWith(
      'user-sub/proj-1/analysis/doc-1.json',
      makeGraph('doc-1'),
      config.s3
    );
    expect(Neo4J.loadGraph).toHaveBeenCalledWith(makeGraph('doc-1'));
    expect(embedAndStore).toHaveBeenCalledWith(
      'user-sub',
      'proj-1',
      'doc-1',
      'report.pdf',
      'Jane works at Acme',
      config
    );
    expect(AWS_DYNAMODB.updateDocumentStatus).toHaveBeenLastCalledWith(
      'proj-1',
      'doc-1',
      'COMPLETE',
      config.dynamoDB
    );
    expect(statusesFor('doc-1')).toEqual(['PROCESSING', 'COMPLETE']);
    expect(AWS_SQS.deleteMessage).toHaveBeenCalledWith(config.sqs.queueUrl, 'rh-doc-1');
  });

  it('waits for the trailing window before processing', async () => {
    queueBatches([textractMessage('doc-1')]);
    startPoller('user-sub', config);

    await vi.advanceTimersByTimeAsync(TRAILING_WINDOW_MS - 1_000);
    expect(AWS_TEXTRACT.getDocumentAnalysis).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(AWS_TEXTRACT.getDocumentAnalysis).toHaveBeenCalled();
  });

  it('caps how long a steady stream of messages can delay the batch', async () => {
    // A new message every minute keeps resetting the 2-minute trailing window
    vi.mocked(AWS_SQS.receiveMessages).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      return [textractMessage(`doc-${Date.now()}`)];
    });
    startPoller('user-sub', config);

    await vi.advanceTimersByTimeAsync(MAX_BATCH_WAIT_MS + 60_000);

    expect(AWS_TEXTRACT.getDocumentAnalysis).toHaveBeenCalled();
  });

  it('keeps only the freshest receipt for a re-delivered document', async () => {
    await receiveAndProcess(
      textractMessage('doc-1', { receipt: 'old' }),
      textractMessage('doc-1', { receipt: 'new' })
    );

    expect(AWS_TEXTRACT.getDocumentAnalysis).toHaveBeenCalledTimes(1);
    expect(AWS_SQS.deleteMessage).toHaveBeenCalledWith(config.sqs.queueUrl, 'new');
  });

  it('processes large batches with bounded concurrency', async () => {
    const messages = Array.from({ length: 7 }, (_, i) => textractMessage(`doc-${i}`));
    await receiveAndProcess(...messages);

    expect(AWS_SQS.deleteMessage).toHaveBeenCalledTimes(7);
  });

  it('returns other users’ messages to the queue immediately', async () => {
    await receiveAndProcess(textractMessage('doc-1', { owner: 'someone-else' }));

    expect(AWS_SQS.returnToQueue).toHaveBeenCalledWith(config.sqs.queueUrl, 'rh-doc-1');
    expect(AWS_TEXTRACT.getDocumentAnalysis).not.toHaveBeenCalled();
  });

  it('resets documents whose Textract job failed', async () => {
    await receiveAndProcess(textractMessage('doc-1', { status: 'FAILED' }));

    expect(AWS_SQS.deleteMessage).toHaveBeenCalledWith(config.sqs.queueUrl, 'rh-doc-1');
    expect(AWS_DYNAMODB.updateDocumentStatus).toHaveBeenCalledWith(
      'proj-1',
      'doc-1',
      'UNPROCESSED',
      config.dynamoDB
    );
    expect(statusesFor('doc-1')).toEqual(['UNPROCESSED']);
  });

  it('ignores malformed messages', async () => {
    await receiveAndProcess(
      { ReceiptHandle: 'rh', Body: 'not json' },
      textractMessage('doc-1', { key: 'too/short' })
    );

    expect(AWS_TEXTRACT.getDocumentAnalysis).not.toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalledWith('Unexpected S3 key format: too/short');
  });

  it('discards results for documents deleted before processing', async () => {
    vi.mocked(AWS_DYNAMODB.updateDocumentStatus).mockResolvedValueOnce(false);

    await receiveAndProcess(textractMessage('doc-1'));

    expect(AWS_TEXTRACT.getDocumentAnalysis).not.toHaveBeenCalled();
    expect(AWS_SQS.deleteMessage).toHaveBeenCalledWith(config.sqs.queueUrl, 'rh-doc-1');
  });

  it('removes written artifacts for documents deleted mid-processing', async () => {
    vi.mocked(AWS_DYNAMODB.updateDocumentStatus)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await receiveAndProcess(textractMessage('doc-1'));

    expect(discardDocumentArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-1', ownerSub: 'user-sub' }),
      config
    );
    expect(statusesFor('doc-1')).toEqual(['PROCESSING']);
    expect(AWS_SQS.deleteMessage).toHaveBeenCalled();
  });

  it('saves an empty graph and marks GRAPH_FAILED when extraction fails', async () => {
    vi.mocked(AWS_BEDROCK.extractRelationships).mockRejectedValue(
      new GraphExtractionError('doc-1')
    );

    await receiveAndProcess(textractMessage('doc-1'));

    expect(AWS_S3.putJson).toHaveBeenCalledWith(
      expect.any(String),
      { documentId: 'doc-1', projectId: 'proj-1', entities: [], relationships: [] },
      config.s3
    );
    expect(Neo4J.loadGraph).not.toHaveBeenCalled();
    expect(embedAndStore).toHaveBeenCalled();
    expect(statusesFor('doc-1')).toEqual(['PROCESSING', 'GRAPH_FAILED']);
    expect(AWS_SQS.deleteMessage).toHaveBeenCalled();
  });

  it('treats graph and embedding store failures as non-fatal', async () => {
    vi.spyOn(Neo4J, 'loadGraph').mockRejectedValue(new Error('neo4j down'));
    vi.mocked(embedAndStore).mockRejectedValue('qdrant down');
    vi.mocked(AWS_DYNAMODB.getDocumentName).mockRejectedValue(new Error('ddb down'));

    await receiveAndProcess(textractMessage('doc-1'));

    expect(embedAndStore).toHaveBeenCalledWith(
      'user-sub',
      'proj-1',
      'doc-1',
      'doc-1',
      expect.any(String),
      config
    );
    expect(statusesFor('doc-1')).toEqual(['PROCESSING', 'COMPLETE']);
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Neo4j load failed (non-fatal): neo4j down')
    );
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Qdrant embedding failed (non-fatal): qdrant down')
    );
  });

  it('leaves the message for redelivery on an unexpected failure', async () => {
    vi.mocked(AWS_BEDROCK.extractRelationships).mockRejectedValue(new Error('ThrottlingException'));

    await receiveAndProcess(textractMessage('doc-1'));

    expect(AWS_SQS.deleteMessage).not.toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Processing FAILED: ThrottlingException')
    );
  });

  it('keeps polling after a receive error', async () => {
    vi.mocked(AWS_SQS.receiveMessages).mockRejectedValueOnce('network down');

    await receiveAndProcess(textractMessage('doc-1'));

    expect(Logger.error).toHaveBeenCalledWith('SQS poll error: network down');
    expect(AWS_SQS.deleteMessage).toHaveBeenCalled();
  });

  it('stops once the session is gone', async () => {
    vi.mocked(getSessionId).mockReturnValue(null);

    startPoller('user-sub', config);
    await vi.advanceTimersByTimeAsync(LONG_POLL_MS * 2);

    expect(AWS_SQS.receiveMessages).not.toHaveBeenCalled();
  });

  it('drops pending work when stopped, and restarts cleanly', async () => {
    queueBatches([textractMessage('doc-1')]);
    startPoller('user-sub', config);
    await vi.advanceTimersByTimeAsync(0);
    startPoller('user-sub', config); // restart while running
    stopPoller();

    await vi.advanceTimersByTimeAsync(MAX_BATCH_WAIT_MS);

    expect(AWS_TEXTRACT.getDocumentAnalysis).not.toHaveBeenCalled();
  });
});
