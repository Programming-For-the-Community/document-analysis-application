import { ProcessingStatus } from '../types/document';

export interface DocumentRecord {
  documentId: string;
  projectId: string;
  ownerSub: string;
  documentName: string;
  s3Key: string;
  fileSize: number;
  uploadedAt: string;
  processingStatus: ProcessingStatus;
  queuedAt?: string;
  textractJobId?: string;
  statusUpdatedAt?: string;
}

export interface UploadFileInfo {
  name: string;
  path: string;
  size: number;
}
