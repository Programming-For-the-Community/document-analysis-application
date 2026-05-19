import { ipcMain } from 'electron';

import { AWS_DYNAMODB } from '../../aws/dynamodb';
import { AWS_COGNITO } from '../../aws/cognito';
import { AWS_S3 } from '../../aws/s3';
import { Neo4J } from '../../aws/neo4j';
import { Qdrant } from '../../aws/qdrant';
import { AppConfig } from '../../interfaces/app';
import { ProjectListItem } from '../../interfaces/project';
import { CognitoAuthResult } from '../../types/aws';
import { Logger } from '../../utils/logger';
import { userFacingError } from '../../utils/errors';

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
type SimpleResult        = { success: boolean; error?: string };

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
      const message = userFacingError(err, 'Failed to load projects');
      Logger.error(`project:list error: ${err instanceof Error ? err.message : String(err)}`);
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
      const message = userFacingError(err, 'Failed to create project');
      Logger.error(`project:create error: ${err instanceof Error ? err.message : String(err)}`);
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
      const role = await AWS_DYNAMODB.getProjectRole(userSub, projectId, config.dynamoDB);
      if (role !== 'OWNER') {
        return { success: false, error: 'Only the project owner can rename this project' };
      }
      await AWS_DYNAMODB.renameProject(projectId, newName.trim(), userSub, config.dynamoDB);
      Logger.info(`Project ${projectId} renamed to "${newName.trim()}" via IPC`);
      return { success: true };
    } catch (err) {
      const message = userFacingError(err, 'Failed to rename project');
      Logger.error(`project:rename error: ${err instanceof Error ? err.message : String(err)}`);
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
      const role = await AWS_DYNAMODB.getProjectRole(userSub, projectId, config.dynamoDB);
      if (role !== 'OWNER') {
        return { success: false, error: 'Only the project owner can delete this project' };
      }
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
      const message = userFacingError(err, 'Failed to delete project');
      Logger.error(`project:delete error: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('project:get-role', async (_event, projectId: string): Promise<{ success: boolean; role?: string; error?: string }> => {
    const config = getAppConfig();
    const tokens = getTokens();

    if (!config || !tokens || typeof tokens === 'boolean') {
      return { success: false, error: 'App not ready' };
    }

    try {
      const userSub = extractSub(tokens.idToken);
      const role = await AWS_DYNAMODB.getProjectRole(userSub, projectId, config.dynamoDB);
      return { success: true, role: role ?? 'VIEW' };
    } catch (err) {
      const message = userFacingError(err, 'Failed to get project role');
      Logger.error(`project:get-role error: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, error: message };
    }
  });

  ipcMain.handle(
    'project:share',
    async (_event, projectId: string, targetUsername: string, role: 'VIEW' | 'EDIT'): Promise<SimpleResult> => {
      const config = getAppConfig();
      const tokens = getTokens();

      if (!config || !tokens || typeof tokens === 'boolean') {
        return { success: false, error: 'App not ready' };
      }

      try {
        const callerSub  = extractSub(tokens.idToken);
        const callerRole = await AWS_DYNAMODB.getProjectRole(callerSub, projectId, config.dynamoDB);

        if (!callerRole || callerRole === 'VIEW') {
          return { success: false, error: 'Not authorized to share this project' };
        }
        if (callerRole === 'EDIT' && role === 'EDIT') {
          return { success: false, error: 'You can only share projects in view mode' };
        }

        const targetUser = await AWS_COGNITO.findUserByUsername(targetUsername, config.cognito);
        if (!targetUser) {
          return { success: false, error: `User "${targetUsername}" not found` };
        }
        if (targetUser.sub === callerSub) {
          return { success: false, error: 'Cannot share a project with yourself' };
        }

        const existingRole = await AWS_DYNAMODB.getProjectRole(targetUser.sub, projectId, config.dynamoDB);
        if (existingRole === 'OWNER') {
          return { success: false, error: 'This user is the project owner' };
        }
        if (existingRole) {
          return { success: false, error: `"${targetUsername}" already has access to this project` };
        }

        await AWS_DYNAMODB.shareProject(projectId, targetUser.sub, targetUser.username, role, config.dynamoDB);
        Logger.info(`project:share: ${targetUsername} granted ${role} on project ${projectId}`);
        return { success: true };
      } catch (err) {
        const message = userFacingError(err, 'Failed to share project');
        Logger.error(`project:share error: ${err instanceof Error ? err.message : String(err)}`);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle(
    'project:unshare',
    async (_event, projectId: string, targetSub: string): Promise<SimpleResult> => {
      const config = getAppConfig();
      const tokens = getTokens();

      if (!config || !tokens || typeof tokens === 'boolean') {
        return { success: false, error: 'App not ready' };
      }

      try {
        const callerSub  = extractSub(tokens.idToken);
        const callerRole = await AWS_DYNAMODB.getProjectRole(callerSub, projectId, config.dynamoDB);

        if (!callerRole) {
          return { success: false, error: 'Not authorized' };
        }
        if (callerRole !== 'OWNER' && targetSub !== callerSub) {
          return { success: false, error: 'Not authorized to remove this user' };
        }

        const targetRole = await AWS_DYNAMODB.getProjectRole(targetSub, projectId, config.dynamoDB);
        if (targetRole === 'OWNER') {
          return { success: false, error: 'Cannot remove the project owner' };
        }
        if (!targetRole) {
          return { success: false, error: 'User does not have access to this project' };
        }

        await AWS_DYNAMODB.unshareProject(projectId, targetSub, config.dynamoDB);
        Logger.info(`project:unshare: user ${targetSub} removed from project ${projectId}`);
        return { success: true };
      } catch (err) {
        const message = userFacingError(err, 'Failed to remove access');
        Logger.error(`project:unshare error: ${err instanceof Error ? err.message : String(err)}`);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle('project:list-members', async (_event, projectId: string) => {
    const config = getAppConfig();
    const tokens = getTokens();

    if (!config || !tokens || typeof tokens === 'boolean') {
      return { success: false, error: 'App not ready' };
    }

    try {
      const callerSub  = extractSub(tokens.idToken);
      const callerRole = await AWS_DYNAMODB.getProjectRole(callerSub, projectId, config.dynamoDB);

      if (!callerRole) {
        return { success: false, error: 'Not authorized' };
      }

      const members = await AWS_DYNAMODB.listProjectMembers(projectId, config.dynamoDB);
      return { success: true, members };
    } catch (err) {
      const message = userFacingError(err, 'Failed to list members');
      Logger.error(`project:list-members error: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, error: message };
    }
  });

  ipcMain.handle(
    'project:search-users',
    async (_event, prefix: string): Promise<{ success: boolean; usernames?: string[]; error?: string }> => {
      const config = getAppConfig();
      const tokens = getTokens();

      if (!config || !tokens || typeof tokens === 'boolean') {
        return { success: false, error: 'App not ready' };
      }

      if (!prefix || prefix.trim().length < 1) {
        return { success: true, usernames: [] };
      }

      try {
        const usernames = await AWS_COGNITO.searchUsersByPrefix(prefix.trim(), config.cognito);
        return { success: true, usernames };
      } catch (err) {
        const message = userFacingError(err, 'User search is temporarily unavailable');
        Logger.error(`project:search-users error: ${err instanceof Error ? err.message : String(err)}`);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle('project:get-settings', async (_event, projectId: string): Promise<{ success: boolean; minDocFilter?: number; error?: string }> => {
    const config = getAppConfig();
    const tokens = getTokens();
    if (!config || !tokens || typeof tokens === 'boolean') return { success: false, error: 'App not ready' };
    try {
      const settings = await AWS_DYNAMODB.getProjectSettings(projectId, config.dynamoDB);
      return { success: true, ...settings };
    } catch (err) {
      Logger.error(`project:get-settings error: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, error: 'Failed to load project settings' };
    }
  });

  ipcMain.handle('project:set-min-doc-filter', async (_event, projectId: string, minDocFilter: number): Promise<SimpleResult> => {
    const config = getAppConfig();
    const tokens = getTokens();
    if (!config || !tokens || typeof tokens === 'boolean') return { success: false, error: 'App not ready' };
    try {
      const userSub = extractSub(tokens.idToken);
      const role = await AWS_DYNAMODB.getProjectRole(userSub, projectId, config.dynamoDB);
      if (!role) return { success: false, error: 'Not authorized' };
      await AWS_DYNAMODB.setProjectMinDocFilter(projectId, minDocFilter, config.dynamoDB);
      return { success: true };
    } catch (err) {
      Logger.error(`project:set-min-doc-filter error: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, error: 'Failed to save project settings' };
    }
  });

  ipcMain.handle(
    'project:update-role',
    async (_event, projectId: string, targetSub: string, newRole: 'VIEW' | 'EDIT'): Promise<SimpleResult> => {
      const config = getAppConfig();
      const tokens = getTokens();

      if (!config || !tokens || typeof tokens === 'boolean') {
        return { success: false, error: 'App not ready' };
      }

      try {
        const callerSub  = extractSub(tokens.idToken);
        const callerRole = await AWS_DYNAMODB.getProjectRole(callerSub, projectId, config.dynamoDB);

        if (callerRole !== 'OWNER') {
          return { success: false, error: 'Only the project owner can change roles' };
        }

        const targetRole = await AWS_DYNAMODB.getProjectRole(targetSub, projectId, config.dynamoDB);
        if (targetRole === 'OWNER') {
          return { success: false, error: "Cannot change the owner's role" };
        }
        if (!targetRole) {
          return { success: false, error: 'User does not have access to this project' };
        }

        await AWS_DYNAMODB.updateProjectRole(projectId, targetSub, newRole, config.dynamoDB);
        Logger.info(`project:update-role: user ${targetSub} on project ${projectId} → ${newRole}`);
        return { success: true };
      } catch (err) {
        const message = userFacingError(err, 'Failed to update role');
        Logger.error(`project:update-role error: ${err instanceof Error ? err.message : String(err)}`);
        return { success: false, error: message };
      }
    }
  );
}
