import { loginErrors } from '../../../constants/renderer/login';

export function validateSignIn(username: string, password: string): string | null {
  if (!username || !password) return loginErrors.MISSING_CREDENTIALS;
  return null;
}

export async function signIn(username: string, password: string): Promise<{ error: string | null }> {
  const result = await window.electron.auth.start({ username, password });
  return result.success ? { error: null } : { error: result.error ?? loginErrors.SIGNIN_FAILURE };
}