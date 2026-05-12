export {};

declare global {
  interface File {
    readonly path: string;
  }

  type ProjectRole = 'OWNER' | 'VIEW' | 'EDIT';

  interface ProjectListItem {
    id: string;
    name: string;
    documentCount: number;
    lastModified: string;
    role: ProjectRole;
  }

  interface ProjectMember {
    userSub: string;
    username: string;
    role: 'VIEW' | 'EDIT';
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
      nav: {
        openProject: (project: { id: string; name: string }) => Promise<void>;
        goHome: () => Promise<void>;
      };
      projects: {
        list: () => Promise<{ success: boolean; projects?: ProjectListItem[]; error?: string }>;
        create: (projectName: string) => Promise<{ success: boolean; project?: ProjectListItem; error?: string }>;
        rename: (projectId: string, newName: string) => Promise<{ success: boolean; error?: string }>;
        delete: (projectId: string) => Promise<{ success: boolean; error?: string }>;
        getRole: (projectId: string) => Promise<{ success: boolean; role?: ProjectRole; error?: string }>;
        share: (projectId: string, username: string, role: 'VIEW' | 'EDIT') => Promise<{ success: boolean; error?: string }>;
        unshare: (projectId: string, targetSub: string) => Promise<{ success: boolean; error?: string }>;
        listMembers: (projectId: string) => Promise<{ success: boolean; members?: ProjectMember[]; error?: string }>;
        updateRole: (projectId: string, targetSub: string, newRole: 'VIEW' | 'EDIT') => Promise<{ success: boolean; error?: string }>;
      };
      documents: {
        selectFiles: () => Promise<{ success: boolean; files: Array<{ name: string; path: string; size: number }> }>;
        selectFolder: () => Promise<{ success: boolean; files: Array<{ name: string; path: string; size: number }> }>;
        upload: (
          projectId: string,
          files: Array<{ name: string; path: string; size: number }>
        ) => Promise<{
          success: boolean;
          uploaded?: DocumentRecord[];
          failed?: { name: string; error: string }[];
          error?: string;
        }>;
        list: (projectId: string) => Promise<{ success: boolean; documents?: DocumentRecord[]; error?: string }>;
        delete: (projectId: string, documentId: string) => Promise<{ success: boolean; error?: string }>;
        getText: (projectId: string, documentId: string) => Promise<{ success: boolean; text?: string; error?: string }>;
        onStatusUpdate: (
          callback: (update: { projectId: string; documentId: string; status: ProcessingStatus }) => void
        ) => void;
        onDocumentAdded: (callback: (doc: DocumentRecord) => void) => void;
        onDocumentRemoved: (callback: (data: { projectId: string; documentId: string }) => void) => void;
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
        syncProject: (projectId: string) => Promise<{ success: boolean; loaded?: number; failed?: number; total?: number; error?: string }>;
        getProjectGraph: (projectId: string) => Promise<{
          success: boolean;
          nodes?: GraphNode[];
          edges?: GraphEdge[];
          error?: string;
        }>;
      };
      utils: {
        getFilePath: (file: File) => string;
      };
    };
  }

  type ProcessingStatus = 'UNPROCESSED' | 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED';

  interface SearchCitation {
    documentId:   string;
    documentName: string;
    excerpt:      string;
    score:        number;
  }

  interface GraphNode {
    data: { id: string; label: string; type: string; documentId: string };
  }

  interface GraphEdge {
    data: { id: string; source: string; target: string; label: string };
  }

  interface DocumentRecord {
    documentId: string;
    projectId: string;
    projectName: string;
    ownerSub: string;
    documentName: string;
    s3Key: string;
    fileSize: number;
    uploadedAt: string;
    processingStatus: ProcessingStatus;
    queuedAt?: string;
    textractJobId?: string;
    processingStartedAt?: string;
  }
}
