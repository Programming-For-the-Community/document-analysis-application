export interface ParsedMessage {
  receiptHandle: string;
  jobId: string;
  s3Key: string; // owner_sub/project_id/document_id
  ownerSub: string;
  projectId: string;
  documentId: string;
  status: string;
  statusMessage: string;
}
