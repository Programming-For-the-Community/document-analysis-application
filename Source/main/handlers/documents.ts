import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { BrowserWindow, dialog, ipcMain } from 'electron';

import { AWS_DYNAMODB } from '../../aws/dynamodb';
import { AWS_S3 } from '../../aws/s3';
import { AWS_TEXTRACT } from '../../aws/textract';
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

async function enqueueDocument(
  doc: DocumentRecord,
  config: AppConfig
): Promise<void> {
  try {
    await AWS_TEXTRACT.startDocumentAnalysis(
      doc.s3Key,
      config.s3.documentBucket,
      config.sns.topicArn,
      doc.documentId
    );
    await AWS_DYNAMODB.updateDocumentStatus(
      doc.projectId,
      doc.documentId,
      'QUEUED',
      config.dynamoDB
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(`Failed to enqueue document ${doc.documentId}: ${message}`);
  }
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
            Logger.info(`Uploaded document: ${file.name} → ${s3Key}`);

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

        // Fire-and-forget: enqueue any documents that were never sent to Textract
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
