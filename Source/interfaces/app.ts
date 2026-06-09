import { ProjectRole, MemberRole } from '../types/app';

export interface ProjectListItem {
  id: string;
  name: string;
  documentCount: number;
  lastModified: string;
  role: ProjectRole;
}

export interface ProjectMember {
  userSub: string;
  username: string;
  role: MemberRole;
}

export interface ProjectInfo {
  projectId: string;
  projectName: string;
  role: ProjectRole;
  minDocFilter: number;
  loading: boolean;
}
