import { AWS_S3 } from '../../classes/aws/s3';
import { Neo4J } from '../../classes/neo4j';
import { Qdrant } from '../../classes/qdrant';
import { AppConfig } from '../../interfaces/config';
import { Logger } from '../../utils/logger';

export interface DocumentRef {
  ownerSub: string;
  projectId: string;
  documentId: string;
}

export function analysisKey(doc: DocumentRef): string {
  return `${doc.ownerSub}/${doc.projectId}/analysis/${doc.documentId}.json`;
}

// Best-effort removal of everything the processing pipeline writes for a document
// (analysis JSON, raw text, embeddings, graph, vectors). Used when a document is
// deleted while it was still being processed — the delete handler's own cleanup
// ran before these artifacts existed.
export async function discardDocumentArtifacts(doc: DocumentRef, config: AppConfig): Promise<void> {
  const docTag = `[doc:${doc.documentId} project:${doc.projectId}]`;
  const warn = (what: string) => (err: unknown) =>
    Logger.warn(
      `${docTag} ${what} cleanup failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`
    );

  await AWS_S3.deleteKeys(
    [
      analysisKey(doc),
      AWS_S3.textKey(doc.ownerSub, doc.projectId, doc.documentId),
      AWS_S3.embeddingKey(doc.ownerSub, doc.projectId, doc.documentId),
    ],
    config.s3
  ).catch(warn('S3'));
  await Neo4J.deleteDocument(doc.documentId).catch(warn('Neo4j'));
  await Qdrant.deleteDocument(doc.documentId).catch(warn('Qdrant'));
}
