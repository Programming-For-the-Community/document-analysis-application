import { ProjectListItem, ProjectMember } from '../app';
import { ProjectRole, MemberRole } from '../../types/app';
import { GraphNode, GraphEdge, SearchCitation } from './project';
import { DocumentRecord, UploadFileInfo } from '../interfaces/document';
import { ProcessingStatus } from '../../types/document';
import { EntityConnection } from '../interfaces/graph';
import { ConnectivityStatus } from '../interfaces/connectivity';

export {};

declare global {
  interface File {
    readonly path: string;
  }

  interface Window {
    electron: {
      auth: {
        start: (credentials: {
          username: string;
          password: string;
        }) => Promise<{ success: boolean; error?: string }>;
        signup: (credentials: {
          username: string;
          password: string;
        }) => Promise<{ success: boolean; error?: string }>;
        getTokens: () => Promise<{
          accessToken: string;
          idToken: string;
          refreshToken: string;
        } | null>;
        logout: () => Promise<void>;
      };
      config: {
        get: () => Promise<Record<string, string>>;
      };
      connectivity: {
        get: () => Promise<ConnectivityStatus>;
        onStatusUpdate: (callback: (status: ConnectivityStatus) => void) => void;
      };
      nav: {
        openProject: (project: { id: string; name: string }) => Promise<void>;
        goHome: () => Promise<void>;
      };
      projects: {
        list: () => Promise<{ success: boolean; projects?: ProjectListItem[]; error?: string }>;
        create: (
          projectName: string
        ) => Promise<{ success: boolean; project?: ProjectListItem; error?: string }>;
        rename: (
          projectId: string,
          newName: string
        ) => Promise<{ success: boolean; error?: string }>;
        delete: (projectId: string) => Promise<{ success: boolean; error?: string }>;
        getRole: (
          projectId: string
        ) => Promise<{ success: boolean; role?: ProjectRole; error?: string }>;
        share: (
          projectId: string,
          username: string,
          role: MemberRole
        ) => Promise<{ success: boolean; error?: string }>;
        unshare: (
          projectId: string,
          targetSub: string
        ) => Promise<{ success: boolean; error?: string }>;
        listMembers: (
          projectId: string
        ) => Promise<{ success: boolean; members?: ProjectMember[]; error?: string }>;
        updateRole: (
          projectId: string,
          targetSub: string,
          newRole: MemberRole
        ) => Promise<{ success: boolean; error?: string }>;
        searchUsers: (
          prefix: string
        ) => Promise<{ success: boolean; usernames?: string[]; error?: string }>;
        getSettings: (
          projectId: string
        ) => Promise<{ success: boolean; minDocFilter?: number; error?: string }>;
        setMinDocFilter: (
          projectId: string,
          minDocFilter: number
        ) => Promise<{ success: boolean; error?: string }>;
      };
      documents: {
        selectFiles: () => Promise<{
          success: boolean;
          files: UploadFileInfo[];
        }>;
        selectFolder: () => Promise<{
          success: boolean;
          files: UploadFileInfo[];
        }>;
        upload: (
          projectId: string,
          files: UploadFileInfo[]
        ) => Promise<{
          success: boolean;
          uploaded?: DocumentRecord[];
          failed?: { name: string; error: string }[];
          error?: string;
        }>;
        list: (
          projectId: string
        ) => Promise<{ success: boolean; documents?: DocumentRecord[]; error?: string }>;
        delete: (
          projectId: string,
          documentId: string
        ) => Promise<{ success: boolean; error?: string }>;
        getText: (
          projectId: string,
          documentId: string
        ) => Promise<{ success: boolean; text?: string; error?: string }>;
        retryGraph: (
          projectId: string,
          documentId: string
        ) => Promise<{ success: boolean; error?: string }>;
        onStatusUpdate: (
          callback: (update: {
            projectId: string;
            documentId: string;
            status: ProcessingStatus;
          }) => void
        ) => void;
        onDocumentAdded: (callback: (doc: DocumentRecord) => void) => void;
        onDocumentRemoved: (
          callback: (data: { projectId: string; documentId: string }) => void
        ) => void;
      };
      search: {
        query: (
          projectId: string,
          query: string
        ) => Promise<{
          success: boolean;
          answer?: string;
          citations?: SearchCitation[];
          error?: string;
        }>;
      };
      graph: {
        syncProject: (
          projectId: string
        ) => Promise<{
          success: boolean;
          loaded?: number;
          failed?: number;
          total?: number;
          error?: string;
        }>;
        getProjectGraph: (
          projectId: string,
          minDocCount: number
        ) => Promise<{
          success: boolean;
          nodes?: GraphNode[];
          edges?: GraphEdge[];
          error?: string;
        }>;
        getNodeDetail: (
          projectId: string,
          entityName: string,
          entityType: string
        ) => Promise<{
          success: boolean;
          connections?: EntityConnection[];
          documents?: Array<{ documentId: string; documentName: string }>;
          error?: string;
        }>;
      };
      preferences: {
        getTheme: () => Promise<{ success: boolean; value?: string | null; error?: string }>;
        setTheme: (theme: string) => Promise<{ success: boolean; error?: string }>;
      };
      utils: {
        getFilePath: (file: File) => string;
      };
    };
  }

}
