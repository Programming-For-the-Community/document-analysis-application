import { BrowserWindow } from 'electron';
import { Message } from '@aws-sdk/client-sqs';

import { AWS_SQS } from '../../classes/aws/sqs';
import { AWS_S3 } from '../../classes/aws/s3';
import { AWS_TEXTRACT } from '../../classes/aws/textract';
import { AWS_BEDROCK } from '../../classes/aws/bedrock';
import { AWS_DYNAMODB } from '../../classes/aws/dynamodb';
import { Neo4J } from '../../classes/neo4j';
import { GraphExtractionError } from '../../classes/graphExtractionError';
import { AppConfig } from '../../interfaces/config';
import { ParsedMessage } from '../../interfaces/services/sqsPoller';
import {
  TRAILING_WINDOW_MS,
  MAX_BATCH_WAIT_MS,
  BEDROCK_CONCURRENCY,
} from '../../constants/services/sqsPoller';
import { saveDocumentText, embedAndStore } from './embedder';
import { ProcessingStatus } from '../../types/document';
import { extractDocumentText } from '../../utils/textract';
import { getSessionId } from './session';
import { Logger } from '../../utils/logger';

function pushStatusUpdate(projectId: string, documentId: string, status: ProcessingStatus): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send('document:status-update', {
    projectId,
    documentId,
    status,
  });
}

let running = false;
let currentUserSub: string | null = null;
let currentConfig: AppConfig | null = null;

const pending = new Map<string, ParsedMessage>(); // documentId → message
let trailingTimer: ReturnType<typeof setTimeout> | null = null;
let maxBatchTimer: ReturnType<typeof setTimeout> | null = null;

// ── Batch processing ─────────────────────────────────────────────────────────

// Runs fn over every item with at most `limit` concurrent in-flight promises.
async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const active = new Set<Promise<void>>();
  for (const item of items) {
    const p: Promise<void> = fn(item).finally(() => active.delete(p));
    active.add(p);
    if (active.size >= limit) await Promise.race(active);
  }
  await Promise.all(active);
}

async function processOneDocument(msg: ParsedMessage, config: AppConfig): Promise<void> {
  const docTag = `[doc:${msg.documentId} project:${msg.projectId}]`;
  const batchStart = Date.now();
  Logger.info(`${docTag} Processing started (Textract job: ${msg.jobId})`);

  try {
    await AWS_DYNAMODB.updateDocumentStatus(
      msg.projectId,
      msg.documentId,
      'PROCESSING',
      config.dynamoDB
    );
    pushStatusUpdate(msg.projectId, msg.documentId, 'PROCESSING');

    const textractStart = Date.now();
    const blocks = await AWS_TEXTRACT.getDocumentAnalysis(msg.jobId);
    Logger.info(
      `${docTag} Textract results fetched — ${blocks.length} block(s) in ${Date.now() - textractStart}ms`
    );

    const documentText = extractDocumentText(blocks);

    // Save raw text to S3 so re-embedding is always possible after restarts
    await saveDocumentText(msg.ownerSub, msg.projectId, msg.documentId, documentText, config);

    const bedrockStart = Date.now();
    let graphFailed = false;
    let graph = await AWS_BEDROCK.extractRelationships(blocks, msg.documentId, msg.projectId).catch(
      (err: unknown) => {
        if (!(err instanceof GraphExtractionError)) throw err;
        graphFailed = true;
        Logger.warn(
          `${docTag} Graph extraction failed — saving empty graph, document will be GRAPH_FAILED`
        );
        return {
          documentId: msg.documentId,
          projectId: msg.projectId,
          entities: [],
          relationships: [],
        };
      }
    );

    Logger.info(
      `${docTag} Bedrock inference complete — ${graph.entities.length} entity/entities, ${graph.relationships.length} relationship(s) in ${Date.now() - bedrockStart}ms`
    );

    const analysisKey = `${msg.ownerSub}/${msg.projectId}/analysis/${msg.documentId}.json`;
    await AWS_S3.putJson(analysisKey, graph, config.s3);
    Logger.info(`${docTag} Analysis written to S3 → ${analysisKey}`);

    if (!graphFailed) {
      await Neo4J.loadGraph(graph).catch((err: unknown) =>
        Logger.warn(
          `${docTag} Neo4j load failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }

    const documentName =
      (await AWS_DYNAMODB.getDocumentName(msg.projectId, msg.documentId, config.dynamoDB).catch(
        () => null
      )) ?? msg.documentId;

    // Embeddings always run regardless of graph extraction outcome.
    await embedAndStore(
      msg.ownerSub,
      msg.projectId,
      msg.documentId,
      documentName,
      documentText,
      config
    ).catch((err: unknown) =>
      Logger.warn(
        `${docTag} Qdrant embedding failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`
      )
    );

    const finalStatus = graphFailed ? 'GRAPH_FAILED' : 'COMPLETE';
    await AWS_DYNAMODB.updateDocumentStatus(
      msg.projectId,
      msg.documentId,
      finalStatus,
      config.dynamoDB
    );
    pushStatusUpdate(msg.projectId, msg.documentId, finalStatus);

    // Always delete the SQS message — GRAPH_FAILED is a stable terminal state.
    await AWS_SQS.deleteMessage(config.sqs.queueUrl, msg.receiptHandle);
    Logger.info(`${docTag} ${finalStatus} — total processing time: ${Date.now() - batchStart}ms`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(`${docTag} Processing FAILED: ${message}`);
    // Do not delete the SQS message — it will reappear after visibility timeout
  }
}

async function processBatch(): Promise<void> {
  clearTimers();
  if (pending.size === 0) return;

  const batch = [...pending.values()];
  pending.clear();

  const config = currentConfig;
  if (!config) return;

  Logger.info(
    `Processing Textract batch: ${batch.length} document(s) (concurrency: ${BEDROCK_CONCURRENCY})`
  );
  await withConcurrency(batch, BEDROCK_CONCURRENCY, (msg) => processOneDocument(msg, config));
}

function clearTimers(): void {
  if (trailingTimer) {
    clearTimeout(trailingTimer);
    trailingTimer = null;
  }
  if (maxBatchTimer) {
    clearTimeout(maxBatchTimer);
    maxBatchTimer = null;
  }
}

function scheduleTrailingWindow(): void {
  if (trailingTimer) clearTimeout(trailingTimer);
  trailingTimer = setTimeout(() => void processBatch(), TRAILING_WINDOW_MS);

  if (!maxBatchTimer) {
    maxBatchTimer = setTimeout(() => void processBatch(), MAX_BATCH_WAIT_MS);
  }
}

// ── Message parsing ──────────────────────────────────────────────────────────

function parseMessage(msg: Message): ParsedMessage | null {
  try {
    const outer = JSON.parse(msg.Body ?? '{}') as Record<string, unknown>;
    const inner = JSON.parse(outer['Message'] as string) as Record<string, unknown>;

    const jobId = inner['JobId'] as string;
    const status = inner['Status'] as string;
    const loc = inner['DocumentLocation'] as Record<string, string>;
    const s3Key = loc?.['S3ObjectName'] ?? '';
    const statusMessage = (inner['StatusMessage'] as string | undefined) ?? 'no details';

    // S3 key format: owner_sub/project_id/document_id
    const parts = s3Key.split('/');
    if (parts.length < 3) {
      Logger.error(`Unexpected S3 key format: ${s3Key}`);
      return null;
    }

    const [ownerSub, projectId, documentId] = parts as [string, string, string];

    return {
      receiptHandle: msg.ReceiptHandle!,
      jobId,
      s3Key,
      ownerSub,
      projectId,
      documentId,
      status,
      statusMessage,
    };
  } catch (err) {
    Logger.error(`Failed to parse SQS message: ${err}`);
    return null;
  }
}

// ── Poll loop ────────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  while (running) {
    // Stop polling if session has been invalidated
    if (!getSessionId()) {
      Logger.info('SQS poller: session gone — stopping');
      running = false;
      break;
    }

    try {
      const messages = await AWS_SQS.receiveMessages(currentConfig!.sqs.queueUrl);

      for (const msg of messages) {
        const parsed = parseMessage(msg);
        if (!parsed) continue;

        // Only process documents belonging to the currently logged-in user.
        // Immediately return other users' messages to the queue (VisibilityTimeout=0)
        // so their session can pick them up without waiting out our 10-min timeout.
        if (parsed.ownerSub !== currentUserSub) {
          Logger.debug(`SQS: returning message for user ${parsed.ownerSub} to queue immediately`);
          void AWS_SQS.returnToQueue(currentConfig!.sqs.queueUrl, msg.ReceiptHandle!);
          continue;
        }

        // Delete failed Textract jobs immediately rather than waiting for the 30-min stale check
        if (parsed.status !== 'SUCCEEDED') {
          const docTag = `[doc:${parsed.documentId} project:${parsed.projectId}]`;
          Logger.warn(
            `${docTag} Textract job ${parsed.status}: ${parsed.statusMessage} — deleting SQS message, resetting to UNPROCESSED`
          );
          void AWS_SQS.deleteMessage(currentConfig!.sqs.queueUrl, parsed.receiptHandle);
          void AWS_DYNAMODB.updateDocumentStatus(
            parsed.projectId,
            parsed.documentId,
            'UNPROCESSED',
            currentConfig!.dynamoDB
          );
          pushStatusUpdate(parsed.projectId, parsed.documentId, 'UNPROCESSED');
          continue;
        }

        // De-duplicate: if already pending, update receipt handle to the fresher one
        pending.set(parsed.documentId, parsed);
        Logger.debug(`SQS: queued document ${parsed.documentId} for batch processing`);
        scheduleTrailingWindow();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error(`SQS poll error: ${message}`);
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function startPoller(userSub: string, config: AppConfig): void {
  if (running) stopPoller();
  currentUserSub = userSub;
  currentConfig = config;
  running = true;
  Logger.info(`SQS poller started for user ${userSub}`);
  void poll();
}

export function stopPoller(): void {
  running = false;
  currentUserSub = null;
  currentConfig = null;
  clearTimers();
  pending.clear();
  Logger.info('SQS poller stopped');
}
