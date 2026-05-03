export {}

declare global {
  interface Window {
    electron: {
      auth: {
        start: (credentials: {
          username: string
          password: string
        }) => Promise<{ success: boolean; error?: string }>
        getTokens: () => Promise<{
          accessToken: string
          idToken: string
          refreshToken: string
        } | null>
        logout: () => Promise<void>
      }
      config: {
        get: () => Promise<Record<string, string>>
      }
    }
  }
}
