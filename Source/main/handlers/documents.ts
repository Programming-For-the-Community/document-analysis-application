import crypto from 'crypto';

import { ipcMain } from 'electron';

import { AWS_DYNAMODB } from '../../aws/dynamodb';
import { AWS_S3 } from '../../aws/s3';
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

        const { s3Prefix } = meta;
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
              documentName: file.name,
              s3Key,
              fileSize: file.size,
              uploadedAt: now,
            };

            await AWS_DYNAMODB.addDocumentRecord(record, config.dynamoDB);
            uploaded.push(record);
            Logger.info(`Uploaded document: ${file.name} → ${s3Key}`);
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
        return { success: true, documents };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load documents';
        Logger.error(`document:list error: ${message}`);
        return { success: false, error: message };
      }
    }
  );
}