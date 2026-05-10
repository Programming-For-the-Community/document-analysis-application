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
      nav: {
        openProject: (project: { id: string; name: string }) => Promise<void>;
        goHome: () => Promise<void>;
      };
      projects: {
        list: () => Promise<{ success: boolean; projects?: ProjectListItem[]; error?: string }>;
        create: (projectName: string) => Promise<{ success: boolean; project?: ProjectListItem; error?: string }>;
        rename: (projectId: string, newName: string) => Promise<{ success: boolean; error?: string }>;
        delete: (projectId: string) => Promise<{ success: boolean; error?: string }>;
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
        onStatusUpdate: (
          callback: (update: { projectId: string; documentId: string; status: ProcessingStatus }) => void
        ) => void;
      };
      utils: {
        getFilePath: (file: File) => string;
      };
    };
  }

  interface ProjectListItem {
    id: string;
    name: string;
    documentCount: number;
    lastModified: string;
  }

  type ProcessingStatus = 'UNPROCESSED' | 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED';

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
