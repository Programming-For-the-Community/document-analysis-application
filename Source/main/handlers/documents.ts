import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { BrowserWindow, dialog, ipcMain } from 'electron';

import { AWS_DYNAMODB } from '../../aws/dynamodb';
import { AWS_S3 } from '../../aws/s3';
import { AWS_TEXTRACT } from '../../aws/textract';
import { AWS_BEDROCK } from '../../aws/bedrock';
import { AppConfig } from '../../interfaces/app';
import { DocumentRecord, UploadFileInfo } from '../../interfaces/document';
import { CognitoAuthResult } from '../../types/aws';
import { Logger } from '../../utils/logger';

type DocumentUploadResult = {
  success: boolean;
  uploaded?: DocumentRecord[];
  failed?: { name: string; error: string }[];
  error?: string;
};

type DocumentListResult = {
  success: boolean;
  documents?: DocumentRecord[];
  error?: string;
};

function collectFiles(
  dir: string,
  results: Array<{ name: string; path: string; size: number }>
): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, results);
    } else if (entry.isFile()) {
      results.push({ name: entry.name, path: fullPath, size: fs.statSync(fullPath).size });
    }
  }
}

const STALE_QUEUE_MS      = 30 * 60 * 1000; // 30 min — Textract normally completes in < 5 min
const STALE_PROCESSING_MS =  2 * 60 * 60 * 1000; // 2 hr — generous for any batch window
const TEXTRACT_TTL_MS     =  7 * 24 * 60 * 60 * 1000; // 7 days — Textract result retention

function isStaleQueued(doc: DocumentRecord): boolean {
  if (doc.processingStatus !== 'QUEUED') return false;
  if (!doc.queuedAt) return true;
  return Date.now() - new Date(doc.queuedAt).getTime() > STALE_QUEUE_MS;
}

function isStaleProcessing(doc: DocumentRecord): boolean {
  if (doc.processingStatus !== 'PROCESSING') return false;
  if (!doc.processingStartedAt) return true;
  return Date.now() - new Date(doc.processingStartedAt).getTime() > STALE_PROCESSING_MS;
}

// Returns the status to reset a stale PROCESSING doc to:
// - QUEUED if Textract results are still available (within 7-day TTL)
// - UNPROCESSED if results have expired and Textract must be re-run
function staleProcessingResetStatus(doc: DocumentRecord): 'QUEUED' | 'UNPROCESSED' {
  if (!doc.queuedAt) return 'UNPROCESSED';
  const age = Date.now() - new Date(doc.queuedAt).getTime();
  return age < TEXTRACT_TTL_MS ? 'QUEUED' : 'UNPROCESSED';
}

const TEXTRACT_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif']);
const TEXT_EXTENSIONS = new Set(['.txt', '.csv', '.md']);

async function enqueueDocument(
  doc: DocumentRecord,
  config: AppConfig
): Promise<void> {
  const ext = path.extname(doc.documentName).toLowerCase();
  const docTag = `[doc:${doc.documentId} "${doc.documentName}"]`;

  if (TEXTRACT_EXTENSIONS.has(ext)) {
    try {
      Logger.info(`${docTag} Submitting to Textract (s3Key: ${doc.s3Key})`);
      const jobId = await AWS_TEXTRACT.startDocumentAnalysis(
        doc.s3Key,
        config.s3.documentBucket,
        config.sns.topicArn,
        doc.documentId
      );
      await AWS_DYNAMODB.updateDocumentStatus(
        doc.projectId,
        doc.documentId,
        'QUEUED',
        config.dynamoDB,
        jobId
      );
      Logger.info(`${docTag} QUEUED — Textract jobId: ${jobId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error(`${docTag} Enqueue FAILED: ${message}`);
    }
    return;
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    try {
      Logger.info(`${docTag} Plain text file — bypassing Textract, processing directly`);
      await AWS_DYNAMODB.updateDocumentStatus(doc.projectId, doc.documentId, 'PROCESSING', config.dynamoDB);
      BrowserWindow.getAllWindows()[0]?.webContents.send('document:status-update', {
        projectId: doc.projectId, documentId: doc.documentId, status: 'PROCESSING',
      });
      const text = await AWS_S3.getObjectText(doc.s3Key, config.s3);
      const graph = await AWS_BEDROCK.extractRelationshipsFromText(text, doc.documentId, doc.projectId);
      const analysisKey = `${doc.ownerSub}/${doc.projectId}/analysis/${doc.documentId}.json`;
      await AWS_S3.putJson(analysisKey, graph, config.s3);
      await AWS_DYNAMODB.updateDocumentStatus(doc.projectId, doc.documentId, 'COMPLETE', config.dynamoDB);
      BrowserWindow.getAllWindows()[0]?.webContents.send('document:status-update', {
        projectId: doc.projectId, documentId: doc.documentId, status: 'COMPLETE',
      });
      Logger.info(`${docTag} COMPLETE — ${graph.entities.length} entities, ${graph.relationships.length} relationships → ${analysisKey}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error(`${docTag} Direct text processing FAILED: ${message}`);
      await AWS_DYNAMODB.updateDocumentStatus(doc.projectId, doc.documentId, 'FAILED', config.dynamoDB);
      BrowserWindow.getAllWindows()[0]?.webContents.send('document:status-update', {
        projectId: doc.projectId, documentId: doc.documentId, status: 'FAILED',
      });
    }
    return;
  }

  Logger.warn(`${docTag} Unsupported file type "${ext}" — marking FAILED`);
  await AWS_DYNAMODB.updateDocumentStatus(doc.projectId, doc.documentId, 'FAILED', config.dynamoDB);
}

export function registerDocumentHandlers(
  getAppConfig: () => AppConfig | null,
  getTokens: () => CognitoAuthResult | null
): void {
  ipcMain.handle(
    'document:upload',
    async (_event, projectId: string, files: UploadFileInfo[]): Promise<DocumentUploadResult> => {
      const config = getAppConfig();
      const tokens = getTokens();

      if (!config || !tokens || typeof tokens === 'boolean') {
        return { success: false, error: 'App not ready' };
      }

      try {
        const meta = await AWS_DYNAMODB.getProjectMeta(projectId, config.dynamoDB);
        if (!meta) return { success: false, error: 'Project not found' };

        const { s3Prefix, ownerSub, projectName } = meta;
        const uploaded: DocumentRecord[] = [];
        const failed: { name: string; error: string }[] = [];

        for (const file of files) {
          const documentId = crypto.randomUUID();
          const s3Key = `${s3Prefix}${documentId}`;
          const now = new Date().toISOString();

          try {
            await AWS_S3.uploadDocument(file.path, s3Key, file.size, config.s3);

            const record: DocumentRecord = {
              documentId,
              projectId,
              projectName,
              ownerSub,
              documentName: file.name,
              s3Key,
              fileSize: file.size,
              uploadedAt: now,
              processingStatus: 'UNPROCESSED',
            };

            await AWS_DYNAMODB.addDocumentRecord(record, config.dynamoDB);
            Logger.info(`[doc:${documentId} "${file.name}"] Uploaded → s3Key: ${s3Key}`);

            await enqueueDocument(record, config);
            uploaded.push({ ...record, processingStatus: 'QUEUED' });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            Logger.error(`Failed to upload "${file.name}": ${message}`);
            failed.push({ name: file.name, error: message });
          }
        }

        if (uploaded.length > 0) {
          await AWS_DYNAMODB.incrementDocumentCount(projectId, uploaded.length, config.dynamoDB);
        }

        return { success: true, uploaded, failed };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        Logger.error(`document:upload error: ${message}`);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle('document:select-files', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win ?? new BrowserWindow(), {
      title: 'Select Files',
      properties: ['openFile', 'multiSelections'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, files: [] };
    }

    const files = result.filePaths.map((filePath) => ({
      name: path.basename(filePath),
      path: filePath,
      size: fs.statSync(filePath).size,
    }));

    Logger.debug(`File selection returned ${files.length} file(s)`);
    return { success: true, files };
  });

  ipcMain.handle('document:select-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win ?? new BrowserWindow(), {
      title: 'Select Folder',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, files: [] };
    }

    const files: Array<{ name: string; path: string; size: number }> = [];
    collectFiles(result.filePaths[0]!, files);

    Logger.debug(`Folder selection returned ${files.length} file(s)`);
    return { success: true, files };
  });

  ipcMain.handle(
    'document:list',
    async (_event, projectId: string): Promise<DocumentListResult> => {
      const config = getAppConfig();
      const tokens = getTokens();

      if (!config || !tokens || typeof tokens === 'boolean') {
        return { success: false, error: 'App not ready' };
      }

      try {
        const documents = await AWS_DYNAMODB.listDocuments(projectId, config.dynamoDB);

        // Resolve stale QUEUED docs: check Textract job status before deciding
        // whether to re-enqueue. If the job already succeeded, the SQS message
        // is still in the queue (7-day retention) — leave it QUEUED so the poller
        // picks it up. Only re-enqueue on failure or when no job ID exists.
        const staleQueued = documents.filter(isStaleQueued);
        if (staleQueued.length > 0) {
          Logger.warn(`Resolving ${staleQueued.length} stale QUEUED document(s) for project ${projectId}`);
          await Promise.all(staleQueued.map(async (doc) => {
            const docTag = `[doc:${doc.documentId} "${doc.documentName}"]`;
            if (doc.textractJobId) {
              try {
                const { status: jobStatus, message: jobMessage } = await AWS_TEXTRACT.getJobStatus(doc.textractJobId);
                if (jobStatus === 'SUCCEEDED') {
                  Logger.info(`${docTag} Textract job already SUCCEEDED — leaving QUEUED, SQS poller will process`);
                  return; // SQS message is in queue, poller will pick it up
                }
                if (jobStatus === 'IN_PROGRESS') {
                  Logger.info(`${docTag} Textract job still IN_PROGRESS — leaving QUEUED`);
                  return;
                }
                Logger.warn(`${docTag} Textract job status ${jobStatus}: ${jobMessage} — resetting to UNPROCESSED`);
              } catch {
                Logger.warn(`${docTag} Textract job ${doc.textractJobId} not found (expired?) — resetting to UNPROCESSED`);
              }
            } else {
              Logger.warn(`${docTag} QUEUED with no Textract job ID — resetting to UNPROCESSED`);
            }
            await AWS_DYNAMODB.updateDocumentStatus(doc.projectId, doc.documentId, 'UNPROCESSED', config.dynamoDB);
            doc.processingStatus = 'UNPROCESSED';
          }));
        }

        // Reset stale PROCESSING docs — back to QUEUED if Textract results still live, else UNPROCESSED
        const staleProcessing = documents.filter(isStaleProcessing);
        if (staleProcessing.length > 0) {
          Logger.warn(`Resetting ${staleProcessing.length} stale PROCESSING document(s) for project ${projectId}`);
          await Promise.all(
            staleProcessing.map((doc) => {
              const resetTo = staleProcessingResetStatus(doc);
              return AWS_DYNAMODB.updateDocumentStatus(doc.projectId, doc.documentId, resetTo, config.dynamoDB);
            })
          );
          staleProcessing.forEach((doc) => { doc.processingStatus = staleProcessingResetStatus(doc); });
        }

        // Fire-and-forget: enqueue any UNPROCESSED documents (including just-reset ones)
        const unprocessed = documents.filter((d) => d.processingStatus === 'UNPROCESSED');
        if (unprocessed.length > 0) {
          Logger.info(`Enqueueing ${unprocessed.length} unprocessed document(s) for project ${projectId}`);
          void Promise.all(unprocessed.map((doc) => enqueueDocument(doc, config)));
        }

        return { success: true, documents };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load documents';
        Logger.error(`document:list error: ${message}`);
        return { success: false, error: message };
      }
    }
  );
}
