export interface DocumentRecord {
  documentId: string;
  projectId: string;
  documentName: string;
  s3Key: string;
  fileSize: number;
  uploadedAt: string;
}

export interface UploadFileInfo {
  name: string;
  path: string;
  size: number;
}