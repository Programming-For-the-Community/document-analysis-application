import { LOGIN_ERRORS } from '../../../constants/renderer/login';

export function validateSignUp(
  username: string,
  password: string,
  confirmPassword: string
): string | null {
  if (!username || !password || !confirmPassword) return LOGIN_ERRORS.MISSING_SIGNUP_FIELDS;
  if (password !== confirmPassword) return LOGIN_ERRORS.PASSWORDS_DO_NOT_MATCH;
  if (password.length < 8) return LOGIN_ERRORS.PASSWORD_TOO_SHORT;
  return null;
}

export async function signUp(
  username: string,
  password: string
): Promise<{ error: string | null }> {
  const result = await window.electron.auth.signup({ username, password });
  return result.success ? { error: null } : { error: result.error ?? LOGIN_ERRORS.SIGNUP_FAILURE };
}
