import { HOME_ERRORS } from '../../../constants/renderer/home';
import { ProjectListItem } from '../../../interfaces/renderer/home';

export async function loadProjects(): Promise<{ projects?: ProjectListItem[]; error: string | null }> {
  const result = await window.electron.projects.list();
  if (!result.success || !result.projects) return { error: result.error ?? HOME_ERRORS.PROJECT_LOAD_FAILURE };
  return { projects: result.projects, error: null };
}

export async function renameProject(id: string, name: string): Promise<{ error: string | null }> {
  const result = await window.electron.projects.rename(id, name);
  return result.success ? { error: null } : { error: result.error ?? HOME_ERRORS.PROJECT_RENAME_FAILURE };
}

export async function deleteProject(id: string): Promise<{ error: string | null }> {
  const result = await window.electron.projects.delete(id);
  return result.success ? { error: null } : { error: result.error ?? HOME_ERRORS.PROJECT_DELETE_FAILURE };
}

export async function createProject(name: string): Promise<{ project?: ProjectListItem; error: string | null }> {
  const result = await window.electron.projects.create(name);
  if (!result.success || !result.project) return { error: result.error ?? HOME_ERRORS.PROJECT_CREATION_FAILURE };
  return { project: result.project, error: null };
}