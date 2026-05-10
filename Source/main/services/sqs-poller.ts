import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BrowserWindow } from 'electron';

import { AWS_SQS, Message } from '../../aws/sqs';
import { AWS_TEXTRACT } from '../../aws/textract';
import { AWS_BEDROCK } from '../../aws/bedrock';
import { AWS_DYNAMODB } from '../../aws/dynamodb';
import { AWS_STS } from '../../aws/sts';
import { AppConfig } from '../../interfaces/app';
import { ProcessingStatus } from '../../interfaces/document';
import { awsConfig } from '../config';
import { getSessionId } from './session';
import { Logger } from '../../utils/logger';

function pushStatusUpdate(projectId: string, documentId: string, status: ProcessingStatus): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send('document:status-update', {
    projectId,
    documentId,
    status,
  });
}

const TRAILING_WINDOW_MS = 2 * 60 * 1000;  // 2 min after last completion
const MAX_BATCH_WAIT_MS  = 10 * 60 * 1000; // 10 min hard cap

interface PendingMessage {
  receiptHandle: string;
  jobId: string;
  jobTag: string;       // documentId
  s3Key: string;        // owner_sub/project_id/document_id
  ownerSub: string;
  projectId: string;
  documentId: string;
}

let running = false;
let currentUserSub: string | null = null;
let currentConfig: AppConfig | null = null;

const pending = new Map<string, PendingMessage>(); // documentId → message
let trailingTimer: ReturnType<typeof setTimeout> | null = null;
let maxBatchTimer: ReturnType<typeof setTimeout> | null = null;

// ── Batch processing ─────────────────────────────────────────────────────────

async function processBatch(): Promise<void> {
  clearTimers();
  if (pending.size === 0) return;

  const batch = [...pending.values()];
  pending.clear();

  const config = currentConfig;
  if (!config) return;

  Logger.info(`Processing Textract batch: ${batch.length} document(s)`);

  // Lazy S3 client for writing analysis output
  const s3 = new S3Client({
    region: awsConfig.region,
    credentials: {
      accessKeyId: AWS_STS.credentials.accessKeyId,
      secretAccessKey: AWS_STS.credentials.secretAccessKey,
      sessionToken: AWS_STS.credentials.sessionToken,
    },
  });

  for (const msg of batch) {
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
      Logger.info(`${docTag} Textract results fetched — ${blocks.length} block(s) in ${Date.now() - textractStart}ms`);

      const bedrockStart = Date.now();
      const graph = await AWS_BEDROCK.extractRelationships(blocks, msg.documentId, msg.projectId);
      Logger.info(
        `${docTag} Bedrock inference complete — ${graph.entities.length} entity/entities, ${graph.relationships.length} relationship(s) in ${Date.now() - bedrockStart}ms`
      );

      const analysisKey = `${msg.ownerSub}/${msg.projectId}/analysis/${msg.documentId}.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: config.s3.documentBucket,
          Key: analysisKey,
          Body: JSON.stringify(graph),
          ContentType: 'application/json',
        })
      );
      Logger.info(`${docTag} Analysis written to S3 → ${analysisKey}`);

      await AWS_DYNAMODB.updateDocumentStatus(
        msg.projectId,
        msg.documentId,
        'COMPLETE',
        config.dynamoDB
      );
      pushStatusUpdate(msg.projectId, msg.documentId, 'COMPLETE');

      // Only delete the SQS message after a successful write to S3
      await AWS_SQS.deleteMessage(config.sqs.queueUrl, msg.receiptHandle);
      Logger.info(`${docTag} COMPLETE — total processing time: ${Date.now() - batchStart}ms`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error(`${docTag} Processing FAILED: ${message}`);
      // Do not delete the SQS message — it will reappear after visibility timeout
    }
  }
}

function clearTimers(): void {
  if (trailingTimer) { clearTimeout(trailingTimer); trailingTimer = null; }
  if (maxBatchTimer) { clearTimeout(maxBatchTimer); maxBatchTimer = null; }
}

function scheduleTrailingWindow(): void {
  if (trailingTimer) clearTimeout(trailingTimer);
  trailingTimer = setTimeout(() => void processBatch(), TRAILING_WINDOW_MS);

  if (!maxBatchTimer) {
    maxBatchTimer = setTimeout(() => void processBatch(), MAX_BATCH_WAIT_MS);
  }
}

// ── Message parsing ──────────────────────────────────────────────────────────

function parseMessage(msg: Message): PendingMessage | null {
  try {
    const outer = JSON.parse(msg.Body ?? '{}') as Record<string, unknown>;
    const inner = JSON.parse(outer['Message'] as string) as Record<string, unknown>;

    const jobId  = inner['JobId'] as string;
    const status = inner['Status'] as string;
    const jobTag = inner['JobTag'] as string; // documentId
    const loc    = inner['DocumentLocation'] as Record<string, string>;
    const s3Key  = loc?.['S3ObjectName'] ?? '';

    if (status !== 'SUCCEEDED') {
      const statusMessage = (inner['StatusMessage'] as string | undefined) ?? 'no details';
      Logger.warn(`Textract job ${jobId} completed with status ${status}: ${statusMessage} (document: ${jobTag})`);
      return null;
    }

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
      jobTag,
      s3Key,
      ownerSub,
      projectId,
      documentId,
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
  currentConfig  = config;
  running        = true;
  Logger.info(`SQS poller started for user ${userSub}`);
  void poll();
}

export function stopPoller(): void {
  running        = false;
  currentUserSub = null;
  currentConfig  = null;
  clearTimers();
  pending.clear();
  Logger.info('SQS poller stopped');
}
