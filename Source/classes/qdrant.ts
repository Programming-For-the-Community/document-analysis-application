import crypto from 'crypto';
import { QdrantClient } from '@qdrant/js-client-rest';

import { Logger } from '../utils/logger';
import { QdrantConfig } from '../interfaces/config';
import { COLLECTION, VECTOR_SIZE } from '../constants/qdrant';
import { RECONNECT_INTERVAL_MS } from '../constants/connectivity';
import { DocumentChunk, SearchHit } from '../interfaces/qdrant';
import { setConnectionStatus } from '../main/services/connectivity';

export class Qdrant {
  private static client: QdrantClient;
  private static available = false;
  private static healthCheckTimer: NodeJS.Timeout | null = null;

  public static async init(config: QdrantConfig): Promise<void> {
    this.client = new QdrantClient({
      url: config.url,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    });

    // `docker compose up -d` returns as soon as the container is started, not once
    // Qdrant's HTTP server is accepting connections — retry briefly to ride that out.
    for (let attempt = 1; attempt <= 10; attempt++) {
      if (await this.connect()) break;
      if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (this.available) {
      Logger.info(`Qdrant: initialized (url: ${config.url})`);
    } else {
      Logger.warn('Qdrant: init failed — search will be unavailable until connection is restored');
    }

    // Ongoing health check: keeps connectivity status current and recovers
    // from a lost connection without requiring another search/upload attempt.
    if (!this.healthCheckTimer) {
      this.healthCheckTimer = setInterval(() => void this.connect(), RECONNECT_INTERVAL_MS);
    }
  }

  public static close(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // Single connection attempt: verifies/creates the collection and updates availability.
  private static async connect(): Promise<boolean> {
    try {
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

      this.setAvailable(true);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setAvailable(false, message);
      return false;
    }
  }

  // Updates availability and notifies the renderer, but only on a state change
  // so the 15s health check doesn't spam logs/IPC while the state is unchanged.
  private static setAvailable(value: boolean, errorMessage?: string): void {
    const changed = this.available !== value;
    this.available = value;
    if (!changed) return;

    setConnectionStatus('qdrant', value ? 'connected' : 'disconnected');
    if (value) {
      Logger.info('Qdrant: connected');
    } else {
      Logger.warn(`Qdrant: disconnected — search unavailable until reconnected: ${errorMessage}`);
    }
  }

  // Runs a Qdrant operation, falling back on failure. The ongoing health check
  // will pick up reconnection once Qdrant is reachable again.
  private static async withConnection<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
    if (!this.available) return fallback;

    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setAvailable(false, message);
      return fallback;
    }
  }

  public static async loadDocument(chunks: DocumentChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    await this.withConnection(undefined, async () => {
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
    });
  }

  // Returns the subset of documentIds that have NO chunks in Qdrant for the given project.
  public static async findMissingDocuments(
    projectId: string,
    documentIds: string[]
  ): Promise<string[]> {
    if (documentIds.length === 0) return documentIds;

    return this.withConnection(documentIds, async () => {
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
    });
  }

  public static async search(projectId: string, vector: number[], topK = 5): Promise<SearchHit[]> {
    return this.withConnection([], async () => {
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
    });
  }

  public static async deleteProject(projectId: string): Promise<void> {
    await this.withConnection(undefined, async () => {
      await this.client.delete(COLLECTION, {
        filter: { must: [{ key: 'projectId', match: { value: projectId } }] },
      });
      Logger.info(`Qdrant: deleted all chunks for project ${projectId}`);
    });
  }

  public static async deleteDocument(documentId: string): Promise<void> {
    await this.withConnection(undefined, async () => {
      await this.client.delete(COLLECTION, {
        filter: { must: [{ key: 'documentId', match: { value: documentId } }] },
      });
      Logger.info(`Qdrant: deleted chunks for document ${documentId}`);
    });
  }

  public static isAvailable(): boolean {
    return this.available;
  }
}
