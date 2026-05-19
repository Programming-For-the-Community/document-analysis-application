export type ProcessingStatus = 'UNPROCESSED' | 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED' | 'GRAPH_FAILED';

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