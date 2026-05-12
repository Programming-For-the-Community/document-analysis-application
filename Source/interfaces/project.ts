export type ProjectRole = 'OWNER' | 'VIEW' | 'EDIT';

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
  role: 'VIEW' | 'EDIT';
}
