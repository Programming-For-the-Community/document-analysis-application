export interface DocumentChunk {
  documentId: string;
  projectId: string;
  documentName: string;
  chunkIndex: number;
  text: string;
  vector: number[];
}

export interface SearchHit {
  documentId: string;
  documentName: string;
  text: string;
  score: number;
}
