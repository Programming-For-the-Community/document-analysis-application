import { AWS_BEDROCK } from '../../classes/aws/bedrock';
import { AWS_S3 } from '../../classes/aws/s3';
import { Qdrant } from '../../classes/qdrant';
import { chunkText } from '../../utils/chunker';
import { AppConfig } from '../../interfaces/config';
import { EmbeddingFile } from '../../interfaces/services/embedder';
import { Logger } from '../../utils/logger';

// Saves the raw extracted text to S3. Call this right after Textract / text extraction
// so there is always a stable text source available for re-embedding after restarts.
export async function saveDocumentText(
  ownerSub: string,
  projectId: string,
  documentId: string,
  text: string,
  config: AppConfig
): Promise<void> {
  const key = AWS_S3.textKey(ownerSub, projectId, documentId);
  await AWS_S3.putText(key, text, config.s3);
  Logger.debug(`[doc:${documentId}] Raw text saved → ${key}`);
}

// Qdrant points for an embedding file's chunks, each tagged with its document
function qdrantChunks({ documentId, projectId, documentName, chunks }: EmbeddingFile) {
  return chunks.map((c) => ({ ...c, documentId, projectId, documentName }));
}

// Loads a document's stored embedding file from S3 into Qdrant — the cheap way
// to restore it (no Bedrock calls). Throws if the file is missing or unreadable.
export async function loadStoredEmbeddings(
  doc: { ownerSub: string; projectId: string; documentId: string },
  config: AppConfig
): Promise<void> {
  const key = AWS_S3.embeddingKey(doc.ownerSub, doc.projectId, doc.documentId);
  const file = JSON.parse(await AWS_S3.getObjectText(key, config.s3)) as EmbeddingFile;
  await Qdrant.loadDocument(qdrantChunks(file));
}

// Chunks, embeds, and stores a document in both S3 and Qdrant.
// Called at processing time and during re-embedding in qdrant-sync.
export async function embedAndStore(
  ownerSub: string,
  projectId: string,
  documentId: string,
  documentName: string,
  text: string,
  config: AppConfig
): Promise<void> {
  const docTag = `[doc:${documentId}]`;

  const textChunks = chunkText(text);
  if (textChunks.length === 0) {
    Logger.warn(`${docTag} No text chunks to embed`);
    return;
  }

  Logger.info(`${docTag} Embedding ${textChunks.length} chunk(s)…`);
  const vectors = await Promise.all(textChunks.map((chunk) => AWS_BEDROCK.embedText(chunk)));

  const chunks = textChunks.map((t, i) => ({
    chunkIndex: i,
    text: t,
    vector: vectors[i]!,
  }));

  const embeddingFile: EmbeddingFile = { documentId, projectId, documentName, chunks };

  const key = AWS_S3.embeddingKey(ownerSub, projectId, documentId);
  await AWS_S3.putJson(key, embeddingFile, config.s3);
  Logger.info(`${docTag} Embeddings written to S3 → ${key}`);

  await Qdrant.loadDocument(qdrantChunks(embeddingFile));
}
