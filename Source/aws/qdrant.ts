import crypto from 'crypto';

import { QdrantClient } from '@qdrant/js-client-rest';

import { QdrantConfig } from '../interfaces/config';
import { Logger } from '../utils/logger';

const COLLECTION = 'document_chunks';
const VECTOR_SIZE = 1024; // Titan Embed Text V2 default

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

export class Qdrant {
  private static client: QdrantClient;
  private static available = false;

  public static async init(config: QdrantConfig): Promise<void> {
    try {
      this.client = new QdrantClient({
        url: config.url,
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      });

      const existing = await this.client.getCollections();
      const exists = existing.collections.some((c) => c.name === COLLECTION);

      if (!exists) {
        await this.client.createCollection(COLLECTION, {
          vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
        });
        await this.client.createPayloadIndex(COLLECTION, {
          field_name: 'documentId',
          field_schema: 'keyword',
        });
        await this.client.createPayloadIndex(COLLECTION, {
          field_name: 'projectId',
          field_schema: 'keyword',
        });
        Logger.info(`Qdrant: created collection "${COLLECTION}"`);
      } else {
        Logger.debug(`Qdrant: collection "${COLLECTION}" already exists`);
      }

      this.available = true;
      Logger.info(`Qdrant: initialized (url: ${config.url})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.warn(`Qdrant: init failed — search will be unavailable: ${message}`);
    }
  }

  public static async loadDocument(chunks: DocumentChunk[]): Promise<void> {
    if (!this.available || chunks.length === 0) return;

    const documentId = chunks[0]!.documentId;

    // Delete stale chunks first so re-processing is idempotent
    await this.client.delete(COLLECTION, {
      filter: { must: [{ key: 'documentId', match: { value: documentId } }] },
    });

    await this.client.upsert(COLLECTION, {
      wait: true,
      points: chunks.map((c) => ({
        id: crypto.randomUUID(),
        vector: c.vector,
        payload: {
          documentId: c.documentId,
          projectId: c.projectId,
          documentName: c.documentName,
          chunkIndex: c.chunkIndex,
          text: c.text,
        },
      })),
    });

    Logger.info(`Qdrant: loaded ${chunks.length} chunk(s) for document ${documentId}`);
  }

  // Returns the subset of documentIds that have NO chunks in Qdrant for the given project.
  public static async findMissingDocuments(
    projectId: string,
    documentIds: string[]
  ): Promise<string[]> {
    if (!this.available || documentIds.length === 0) return documentIds;

    const found = new Set<string>();
    let offset: number | string | null = null;

    do {
      const result = await this.client.scroll(COLLECTION, {
        filter: { must: [{ key: 'projectId', match: { value: projectId } }] },
        limit: 200,
        offset: offset ?? undefined,
        with_payload: ['documentId'],
        with_vector: false,
      });

      for (const point of result.points) {
        const docId = point.payload?.['documentId'] as string | undefined;
        if (docId) found.add(docId);
      }

      const next = result.next_page_offset;
      offset = typeof next === 'number' || typeof next === 'string' ? next : null;
    } while (offset !== null);

    return documentIds.filter((id) => !found.has(id));
  }

  public static async search(projectId: string, vector: number[], topK = 5): Promise<SearchHit[]> {
    if (!this.available) return [];

    const results = await this.client.search(COLLECTION, {
      vector,
      limit: topK,
      filter: { must: [{ key: 'projectId', match: { value: projectId } }] },
      with_payload: true,
    });

    return results.map((r) => ({
      documentId: (r.payload?.['documentId'] as string) ?? '',
      documentName: (r.payload?.['documentName'] as string) ?? 'Unknown',
      text: (r.payload?.['text'] as string) ?? '',
      score: r.score,
    }));
  }

  public static async deleteProject(projectId: string): Promise<void> {
    if (!this.available) return;
    await this.client.delete(COLLECTION, {
      filter: { must: [{ key: 'projectId', match: { value: projectId } }] },
    });
    Logger.info(`Qdrant: deleted all chunks for project ${projectId}`);
  }

  public static async deleteDocument(documentId: string): Promise<void> {
    if (!this.available) return;
    await this.client.delete(COLLECTION, {
      filter: { must: [{ key: 'documentId', match: { value: documentId } }] },
    });
    Logger.info(`Qdrant: deleted chunks for document ${documentId}`);
  }

  public static isAvailable(): boolean {
    return this.available;
  }
}
