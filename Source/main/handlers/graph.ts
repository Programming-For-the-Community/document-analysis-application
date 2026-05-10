import { ipcMain } from 'electron';

import { Neo4J } from '../../aws/neo4j';
import { AWS_S3 } from '../../aws/s3';
import { AWS_DYNAMODB } from '../../aws/dynamodb';
import { RelationshipGraph } from '../../aws/bedrock';
import { AppConfig } from '../../interfaces/app';
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
  ipcMain.handle(
    'graph:sync-project',
    async (_event, projectId: string): Promise<SyncResult> => {
      const config = getAppConfig();
      const tokens = getTokens();

      if (!config || !tokens || typeof tokens === 'boolean') {
        return { success: false, error: 'App not ready' };
      }

      try {
        const meta = await AWS_DYNAMODB.getProjectMeta(projectId, config.dynamoDB);
        if (!meta) return { success: false, error: 'Project not found' };

        const prefix = `${meta.ownerSub}/${projectId}/analysis/`;
        const keys = await AWS_S3.listKeys(prefix, config.s3);
        Logger.info(`graph:sync-project: ${keys.length} analysis file(s) found for project ${projectId}`);

        let loaded = 0;
        let failed = 0;

        for (const key of keys) {
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
        }

        Logger.info(`graph:sync-project: loaded ${loaded}/${keys.length} graph(s) for project ${projectId}`);
        return { success: true, loaded, failed, total: keys.length };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        Logger.error(`graph:sync-project error: ${message}`);
        return { success: false, error: message };
      }
    }
  );
}
