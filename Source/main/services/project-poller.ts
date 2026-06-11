import { BrowserWindow } from 'electron';

import { AWS_DYNAMODB } from '../../classes/aws/dynamodb';
import { AWS_S3 } from '../../classes/aws/s3';
import { Neo4J } from '../../classes/neo4j';
import { Qdrant } from '../../classes/qdrant';
import { RelationshipGraph } from '../../interfaces/bedrock';
import { AppConfig } from '../../interfaces/config';
import { DocumentRecord } from '../../interfaces/document';
import { EmbeddingFile } from '../../interfaces/services/embedder';
import { POLL_INTERVAL_MS } from '../../constants/services/projectPoller';
import { embedAndStore } from './embedder';
import { Logger } from '../../utils/logger';

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let currentUserSub: string | null = null;
let currentConfig: AppConfig | null = null;

// Per-project document IDs seen on the last poll cycle — used to diff for adds/removals
const trackedDocIds = new Map<string, Set<string>>();
// Per-document status seen on the last poll cycle — used to diff for status changes
const trackedStatuses = new Map<string, string>();

function pushToRenderer(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, data);
}

async function loadDocIntoLocalStores(doc: DocumentRecord, config: AppConfig): Promise<void> {
  const docTag = `[project-poller doc:${doc.documentId} "${doc.documentName}"]`;

  const analysisKey = `${doc.ownerSub}/${doc.projectId}/analysis/${doc.documentId}.json`;
  try {
    const text = await AWS_S3.getObjectText(analysisKey, config.s3);
    const graph = JSON.parse(text) as RelationshipGraph;
    await Neo4J.loadGraph(graph);
    Logger.debug(`${docTag} Loaded into Neo4j`);
  } catch (err) {
    Logger.warn(`${docTag} Neo4j load failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!Qdrant.isAvailable()) return;

  const embKey = AWS_S3.embeddingKey(doc.ownerSub, doc.projectId, doc.documentId);
  try {
    const embText = await AWS_S3.getObjectText(embKey, config.s3);
    const file = JSON.parse(embText) as EmbeddingFile;
    await Qdrant.loadDocument(
      file.chunks.map((c) => ({
        ...c,
        documentId: file.documentId,
        projectId: file.projectId,
        documentName: file.documentName,
      }))
    );
    Logger.debug(`${docTag} Loaded into Qdrant from embedding file`);
    return;
  } catch {
    /* fall through to raw text */
  }

  const rawKey = AWS_S3.textKey(doc.ownerSub, doc.projectId, doc.documentId);
  try {
    const rawText = await AWS_S3.getObjectText(rawKey, config.s3);
    await embedAndStore(
      doc.ownerSub,
      doc.projectId,
      doc.documentId,
      doc.documentName,
      rawText,
      config
    );
    Logger.debug(`${docTag} Loaded into Qdrant from raw text`);
  } catch (err) {
    Logger.warn(
      `${docTag} Qdrant load failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function pollProject(
  project: { id: string; name: string },
  config: AppConfig
): Promise<void> {
  const documents = await AWS_DYNAMODB.listDocuments(project.id, config.dynamoDB);
  const currentIds = new Set(documents.map((d) => d.documentId));
  const isFirst = !trackedDocIds.has(project.id);
  const prevIds = trackedDocIds.get(project.id) ?? new Set<string>();

  if (!isFirst) {
    // New documents added by another device or user
    for (const doc of documents) {
      if (!prevIds.has(doc.documentId)) {
        Logger.info(
          `[project-poller] New document "${doc.documentName}" in project "${project.name}"`
        );
        pushToRenderer('document:added', doc);
        if (doc.processingStatus === 'COMPLETE') {
          void loadDocIntoLocalStores(doc, config);
        }
      }
    }

    // Documents deleted by another device or user
    for (const prevId of prevIds) {
      if (!currentIds.has(prevId)) {
        Logger.info(`[project-poller] Document ${prevId} removed from project "${project.name}"`);
        await Neo4J.deleteDocument(prevId).catch((err: unknown) =>
          Logger.warn(
            `[project-poller] Neo4j cleanup for ${prevId}: ${err instanceof Error ? err.message : String(err)}`
          )
        );
        if (Qdrant.isAvailable()) {
          await Qdrant.deleteDocument(prevId).catch((err: unknown) =>
            Logger.warn(
              `[project-poller] Qdrant cleanup for ${prevId}: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        }
        pushToRenderer('document:removed', { projectId: project.id, documentId: prevId });
        trackedStatuses.delete(prevId);
      }
    }

    // Status changes on documents that existed last poll (e.g. another device processed a doc)
    for (const doc of documents) {
      if (!prevIds.has(doc.documentId)) continue;
      const prevStatus = trackedStatuses.get(doc.documentId);
      if (prevStatus !== undefined && prevStatus !== doc.processingStatus) {
        Logger.info(
          `[project-poller] Status change "${doc.documentName}": ${prevStatus} → ${doc.processingStatus}`
        );
        pushToRenderer('document:status-update', {
          projectId: doc.projectId,
          documentId: doc.documentId,
          status: doc.processingStatus,
        });
        if (doc.processingStatus === 'COMPLETE') {
          void loadDocIntoLocalStores(doc, config);
        }
      }
    }
  } else {
    Logger.debug(
      `[project-poller] First poll for project "${project.name}" — ${documents.length} document(s) tracked`
    );
  }

  // Update tracking maps
  trackedDocIds.set(project.id, currentIds);
  for (const doc of documents) {
    trackedStatuses.set(doc.documentId, doc.processingStatus);
  }
}

async function pollOnce(): Promise<void> {
  if (!currentUserSub || !currentConfig) return;
  const userSub = currentUserSub;
  const config = currentConfig;

  try {
    const projects = await AWS_DYNAMODB.listProjectsForUser(userSub, config.dynamoDB);
    const currentProjectIds = new Set(projects.map((p) => p.id));

    // Projects deleted by another device or user
    for (const [projectId] of trackedDocIds) {
      if (!currentProjectIds.has(projectId)) {
        Logger.info(
          `[project-poller] Project ${projectId} no longer exists — cleaning up local stores`
        );
        const orphanedDocs = trackedDocIds.get(projectId) ?? new Set<string>();
        for (const docId of orphanedDocs) trackedStatuses.delete(docId);
        trackedDocIds.delete(projectId);
        await Neo4J.deleteProject(projectId).catch(() => {});
        if (Qdrant.isAvailable()) await Qdrant.deleteProject(projectId).catch(() => {});
        pushToRenderer('project:removed', { projectId });
      }
    }

    await Promise.all(projects.map((p) => pollProject(p, config)));
  } catch (err) {
    Logger.error(
      `[project-poller] Poll error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function scheduleNext(): void {
  if (!running) return;
  timer = setTimeout(() => {
    void pollOnce().finally(scheduleNext);
  }, POLL_INTERVAL_MS);
}

export function startProjectPoller(userSub: string, config: AppConfig): void {
  stopProjectPoller();
  currentUserSub = userSub;
  currentConfig = config;
  running = true;
  trackedDocIds.clear();
  trackedStatuses.clear();
  Logger.info(
    `[project-poller] Started for user ${userSub} (interval: ${POLL_INTERVAL_MS / 1000}s)`
  );
  scheduleNext();
}

export function stopProjectPoller(): void {
  running = false;
  currentUserSub = null;
  currentConfig = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  trackedDocIds.clear();
  trackedStatuses.clear();
  Logger.info('[project-poller] Stopped');
}
