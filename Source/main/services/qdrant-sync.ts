import path from 'path';

import { AWS_DYNAMODB } from '../../aws/dynamodb';
import { AWS_S3 } from '../../aws/s3';
import { Qdrant } from '../../aws/qdrant';
import { RelationshipGraph } from '../../aws/bedrock';
import { AppConfig } from '../../interfaces/app';
import { Logger } from '../../utils/logger';
import {
  EmbeddingFile,
  embeddingS3Key,
  textS3Key,
  embedAndStore,
} from './embedder';

const TEXT_EXTENSIONS = new Set(['.txt', '.csv', '.md']);

// Builds a readable text representation from a relationship graph for documents
// where the original text is no longer available (e.g. Textract-processed PDFs
// that pre-date raw text storage). Quality is lower than full-text embedding but
// still enables entity-based semantic search.
function synthesizeTextFromGraph(graph: RelationshipGraph): string {
  const entityById = new Map(graph.entities.map((e) => [e.id, e]));

  const entityLines = graph.entities
    .map((e) => `${e.value} (${e.type})`)
    .join('\n');

  const relLines = graph.relationships
    .map((r) => {
      const src = entityById.get(r.source)?.value ?? r.source;
      const tgt = entityById.get(r.target)?.value ?? r.target;
      const attrs = r.attributes
        ? ' ' + Object.entries(r.attributes).map(([k, v]) => `${k}: ${v}`).join(', ')
        : '';
      return `${src} — ${r.type.replace(/_/g, ' ')} — ${tgt}${attrs}`;
    })
    .join('\n');

  return [
    `Entities:\n${entityLines || '(none)'}`,
    `Relationships:\n${relLines || '(none)'}`,
  ].join('\n\n');
}

async function recoverFromS3Origin(
  doc: { documentId: string; projectId: string; ownerSub: string; documentName: string; s3Key: string },
  config: AppConfig,
  docTag: string
): Promise<void> {
  const ext = path.extname(doc.documentName).toLowerCase();

  if (TEXT_EXTENSIONS.has(ext)) {
    // Original text file is still in S3 — download and embed
    Logger.info(`${docTag} Recovering: downloading original text from s3Key`);
    const text = await AWS_S3.getObjectText(doc.s3Key, config.s3);
    await embedAndStore(doc.ownerSub, doc.projectId, doc.documentId, doc.documentName, text, config);
    return;
  }

  // PDF/image — Textract results are gone. Synthesize text from the analysis JSON.
  const analysisKey = `${doc.ownerSub}/${doc.projectId}/analysis/${doc.documentId}.json`;
  let analysisText: string;
  try {
    analysisText = await AWS_S3.getObjectText(analysisKey, config.s3);
  } catch {
    Logger.warn(`${docTag} No text, embedding, or analysis file available — cannot embed`);
    return;
  }

  const graph = JSON.parse(analysisText) as RelationshipGraph;
  if (graph.entities.length === 0) {
    Logger.warn(`${docTag} Analysis JSON has no entities — skipping embedding`);
    return;
  }

  const syntheticText = synthesizeTextFromGraph(graph);
  Logger.info(`${docTag} Recovering: embedding from synthesized entity/relationship text (${graph.entities.length} entities)`);
  await embedAndStore(doc.ownerSub, doc.projectId, doc.documentId, doc.documentName, syntheticText, config);
}

export async function syncQdrantForUser(userSub: string, config: AppConfig): Promise<void> {
  if (!Qdrant.isAvailable()) {
    Logger.warn('Qdrant sync: Qdrant is not available — skipping');
    return;
  }

  Logger.info(`Qdrant sync: starting for user ${userSub}`);

  try {
    const projects = await AWS_DYNAMODB.listProjectsForUser(userSub, config.dynamoDB);
    Logger.info(`Qdrant sync: ${projects.length} project(s) found`);

    for (const project of projects) {
      try {
        const documents = await AWS_DYNAMODB.listDocuments(project.id, config.dynamoDB);
        const complete  = documents.filter((d) => d.processingStatus === 'COMPLETE');
        if (complete.length === 0) continue;

        const missing = await Qdrant.findMissingDocuments(
          project.id,
          complete.map((d) => d.documentId)
        );

        if (missing.length === 0) {
          Logger.debug(`Qdrant sync: project "${project.name}" — all ${complete.length} document(s) already in Qdrant`);
          continue;
        }

        Logger.info(`Qdrant sync: project "${project.name}" — loading ${missing.length}/${complete.length} missing document(s)`);
        const missingSet = new Set(missing);

        await Promise.all(
          complete
            .filter((d) => missingSet.has(d.documentId))
            .map(async (doc) => {
              const docTag = `[doc:${doc.documentId} "${doc.documentName}"]`;
              try {
                // 1. S3 embedding file — fastest path, no Bedrock cost
                const embKey = embeddingS3Key(doc.ownerSub, doc.projectId, doc.documentId);
                try {
                  const embText = await AWS_S3.getObjectText(embKey, config.s3);
                  const file = JSON.parse(embText) as EmbeddingFile;
                  await Qdrant.loadDocument(
                    file.chunks.map((c) => ({
                      ...c,
                      documentId:   file.documentId,
                      projectId:    file.projectId,
                      documentName: file.documentName,
                    }))
                  );
                  Logger.debug(`Qdrant sync: ${docTag} loaded from S3 embedding file`);
                  return;
                } catch { /* fall through */ }

                // 2. Saved raw text file — re-embed (Bedrock cost, but avoids Textract)
                const rawKey = textS3Key(doc.ownerSub, doc.projectId, doc.documentId);
                try {
                  const rawText = await AWS_S3.getObjectText(rawKey, config.s3);
                  Logger.info(`${docTag} Re-embedding from saved raw text`);
                  await embedAndStore(doc.ownerSub, doc.projectId, doc.documentId, doc.documentName, rawText, config);
                  return;
                } catch { /* fall through */ }

                // 3. Legacy document — recover from original S3 file or analysis JSON
                Logger.info(`${docTag} No embedding or text file — attempting legacy recovery`);
                await recoverFromS3Origin(doc, config, docTag);
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                Logger.error(`Qdrant sync: failed for "${doc.documentName}" (${doc.documentId}): ${message}`);
              }
            })
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.error(`Qdrant sync: error processing project "${project.name}" (${project.id}): ${message}`);
      }
    }

    Logger.info(`Qdrant sync: complete for user ${userSub}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(`Qdrant sync: failed: ${message}`);
  }
}
