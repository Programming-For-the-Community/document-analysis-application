export interface EmbeddingFile {
  documentId: string;
  projectId: string;
  documentName: string;
  chunks: Array<{
    chunkIndex: number;
    text: string;
    vector: number[];
  }>;
}
