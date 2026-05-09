export {};

declare global {
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
        delete: (projectId: string) => Promise<{ success: boolean; error?: string }>;
      };
    };
  }

  interface ProjectListItem {
    id: string;
    name: string;
    documentCount: number;
    lastModified: string;
  }
}
