import { ipcMain } from 'electron';

import { AWS_DYNAMODB } from '../../aws/dynamodb';
import { AWS_S3 } from '../../aws/s3';
import { Neo4J } from '../../aws/neo4j';
import { Qdrant } from '../../aws/qdrant';
import { AppConfig } from '../../interfaces/app';
import { ProjectListItem } from '../../interfaces/project';
import { CognitoAuthResult } from '../../types/aws';
import { Logger } from '../../utils/logger';

function extractSub(idToken: string): string {
  const base64 = idToken.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '';
  const payload = JSON.parse(
    Buffer.from(base64, 'base64').toString('utf-8')
  ) as Record<string, unknown>;
  const sub = payload['sub'];
  if (typeof sub !== 'string' || !sub) throw new Error('ID token missing sub claim');
  return sub;
}

type ProjectListResult   = { success: boolean; projects?: ProjectListItem[]; error?: string };
type ProjectCreateResult = { success: boolean; project?: ProjectListItem; error?: string };
type ProjectRenameResult = { success: boolean; error?: string };
type ProjectDeleteResult = { success: boolean; error?: string };

export function registerProjectHandlers(
  getAppConfig: () => AppConfig | null,
  getTokens: () => CognitoAuthResult | null
): void {
  ipcMain.handle('project:list', async (): Promise<ProjectListResult> => {
    const config = getAppConfig();
    const tokens = getTokens();

    if (!config || !tokens || typeof tokens === 'boolean') {
      return { success: false, error: 'App not ready' };
    }

    try {
      const userSub = extractSub(tokens.idToken);
      const projects = await AWS_DYNAMODB.listProjectsForUser(userSub, config.dynamoDB);
      return { success: true, projects };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects';
      Logger.error(`project:list error: ${message}`);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('project:create', async (_event, projectName: string): Promise<ProjectCreateResult> => {
    const config = getAppConfig();
    const tokens = getTokens();

    if (!config || !tokens || typeof tokens === 'boolean') {
      return { success: false, error: 'App not ready' };
    }

    if (!projectName?.trim()) {
      return { success: false, error: 'Project name is required' };
    }

    try {
      const userSub = extractSub(tokens.idToken);
      const project = await AWS_DYNAMODB.createProject(
        projectName.trim(), userSub, config.dynamoDB
      );
      Logger.info(`Project "${project.name}" created via IPC`);
      return { success: true, project };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      Logger.error(`project:create error: ${message}`);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('project:rename', async (_event, projectId: string, newName: string): Promise<ProjectRenameResult> => {
    const config = getAppConfig();
    const tokens = getTokens();

    if (!config || !tokens || typeof tokens === 'boolean') {
      return { success: false, error: 'App not ready' };
    }

    if (!newName?.trim()) {
      return { success: false, error: 'Project name is required' };
    }

    try {
      const userSub = extractSub(tokens.idToken);
      await AWS_DYNAMODB.renameProject(projectId, newName.trim(), userSub, config.dynamoDB);
      Logger.info(`Project ${projectId} renamed to "${newName.trim()}" via IPC`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rename project';
      Logger.error(`project:rename error: ${message}`);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('project:delete', async (_event, projectId: string): Promise<ProjectDeleteResult> => {
    const config = getAppConfig();
    const tokens = getTokens();

    if (!config || !tokens || typeof tokens === 'boolean') {
      return { success: false, error: 'App not ready' };
    }

    try {
      const userSub = extractSub(tokens.idToken);
      const s3Prefix = await AWS_DYNAMODB.deleteProject(projectId, userSub, config.dynamoDB);
      await AWS_S3.deleteProjectObjects(s3Prefix, config.s3);

      await Neo4J.deleteProject(projectId).catch((err: unknown) =>
        Logger.warn(`project:delete Neo4j cleanup failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
      );
      await Qdrant.deleteProject(projectId).catch((err: unknown) =>
        Logger.warn(`project:delete Qdrant cleanup failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
      );

      Logger.info(`Project ${projectId} deleted via IPC`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete project';
      Logger.error(`project:delete error: ${message}`);
      return { success: false, error: message };
    }
  });
}