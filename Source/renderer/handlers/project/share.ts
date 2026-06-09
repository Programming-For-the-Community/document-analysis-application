import { MemberRole } from '../../../types/app';
import { ProjectMember } from '../../../interfaces/app';
import { PROJECT_ERRORS } from '../../../constants/renderer/project';

export async function loadMembers(
  projectId: string
): Promise<{ members?: ProjectMember[]; error: string | null }> {
  const result = await window.electron.projects.listMembers(projectId);
  if (!result.success || !result.members)
    return { error: result.error ?? PROJECT_ERRORS.SHARE_MEMEBER_RETREIVAL_FAILURE };
  return { members: result.members, error: null };
}

export async function shareUser(
  projectId: string,
  username: string,
  role: MemberRole
): Promise<{ error: string | null }> {
  const result = await window.electron.projects.share(projectId, username, role);
  return result.success ? { error: null } : { error: result.error ?? PROJECT_ERRORS.PROJECT_SHARE_FAILURE };
}

export async function unshareUser(
  projectId: string,
  userSub: string
): Promise<{ error: string | null }> {
  const result = await window.electron.projects.unshare(projectId, userSub);
  return result.success ? { error: null } : { error: result.error ?? PROJECT_ERRORS.PROJECT_UNSHARE_FAILURE };
}

export async function updateMemberRole(
  projectId: string,
  userSub: string,
  newRole: MemberRole
): Promise<{ error: string | null }> {
  const result = await window.electron.projects.updateRole(projectId, userSub, newRole);
  return result.success ? { error: null } : { error: result.error ?? PROJECT_ERRORS.MEMBER_ROLE_UPDATE_FAILURE };
}

export async function searchUsers(prefix: string): Promise<string[]> {
  const result = await window.electron.projects.searchUsers(prefix);
  return result.success && result.usernames ? result.usernames : [];
}
