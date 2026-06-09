import { ipcMain } from 'electron';

import { Neo4J } from '../../aws/neo4j';
import { AWS_S3 } from '../../aws/s3';
import { AWS_DYNAMODB } from '../../aws/dynamodb';
import { RelationshipGraph } from '../../aws/bedrock';
import { AppConfig } from '../../interfaces/config';
import { CognitoAuthResult } from '../../types/aws';
import { Logger } from '../../utils/logger';

type SyncResult = {
  success: boolean;
  loaded?: number;
  failed?: number;
  total?: number;
  error?: string;
};

export function registerGraphHandlers(
  getAppConfig: () => AppConfig | null,
  getTokens: () => CognitoAuthResult | null
): void {
  ipcMain.handle('graph:sync-project', async (_event, projectId: string): Promise<SyncResult> => {
    const config = getAppConfig();
    const tokens = getTokens();

    if (!config || !tokens || typeof tokens === 'boolean') {
      return { success: false, error: 'App not ready' };
    }

    try {
      const meta = await AWS_DYNAMODB.getProjectMeta(projectId, config.dynamoDB);
      if (!meta) return { success: false, error: 'Project not found' };

      const documents = await AWS_DYNAMODB.listDocuments(projectId, config.dynamoDB);
      const complete = documents.filter((d) => d.processingStatus === 'COMPLETE');
      const total = complete.length;

      if (total === 0) {
        Logger.info(`graph:sync-project: no complete documents for project ${projectId}`);
        return { success: true, loaded: 0, failed: 0, total: 0 };
      }

      // Only download documents not already in Neo4j — avoids redundant S3 reads
      const missing = await Neo4J.findMissingDocuments(complete.map((d) => d.documentId));
      Logger.info(
        `graph:sync-project: ${missing.length}/${total} document(s) missing from Neo4j for project ${projectId}`
      );

      if (missing.length === 0) {
        return { success: true, loaded: 0, failed: 0, total };
      }

      const missingSet = new Set(missing);
      let loaded = 0;
      let failed = 0;

      const docsToLoad = complete.filter((d) => missingSet.has(d.documentId));
      const BATCH_SIZE = 5;
      for (let i = 0; i < docsToLoad.length; i += BATCH_SIZE) {
        const batch = docsToLoad.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (doc) => {
            const key = `${doc.ownerSub}/${projectId}/analysis/${doc.documentId}.json`;
            try {
              const text = await AWS_S3.getObjectText(key, config.s3);
              const graph = JSON.parse(text) as RelationshipGraph;
              await Neo4J.loadGraph(graph);
              loaded++;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              Logger.error(`graph:sync-project: failed to load ${key}: ${message}`);
              failed++;
            }
          })
        );
      }

      Logger.info(
        `graph:sync-project: loaded ${loaded}/${missing.length} missing graph(s) for project ${projectId}`
      );
      return { success: true, loaded, failed, total };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      Logger.error(`graph:sync-project error: ${message}`);
      return { success: false, error: message };
    }
  });

  ipcMain.handle(
    'graph:get-node-detail',
    async (_event, projectId: string, entityName: string, entityType: string) => {
      const config = getAppConfig();
      const tokens = getTokens();

      if (!config || !tokens || typeof tokens === 'boolean') {
        return { success: false, error: 'App not ready' };
      }

      try {
        const { connections, documentIds } = await Neo4J.getNodeDetail(
          projectId,
          entityName,
          entityType
        );

        const documents = await Promise.all(
          documentIds.map(async (docId) => {
            const name = await AWS_DYNAMODB.getDocumentName(
              projectId,
              docId,
              config.dynamoDB
            ).catch(() => null);
            return { documentId: docId, documentName: name ?? docId };
          })
        );

        return { success: true, connections, documents };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load node detail';
        Logger.error(`graph:get-node-detail error: ${message}`);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle(
    'graph:get-project-graph',
    async (_event, projectId: string, minDocCount: number) => {
      const config = getAppConfig();
      const tokens = getTokens();

      if (!config || !tokens || typeof tokens === 'boolean') {
        return { success: false, error: 'App not ready' };
      }

      const safeMinDocCount = Math.max(2, Number.isFinite(minDocCount) ? minDocCount : 2);

      try {
        const graph = await Neo4J.getProjectGraph(projectId, safeMinDocCount);
        return { success: true, nodes: graph.nodes, edges: graph.edges };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load graph';
        Logger.error(`graph:get-project-graph error: ${message}`);
        return { success: false, error: message };
      }
    }
  );
}
