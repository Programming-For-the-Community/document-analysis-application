import { parseJwt } from './parseJwt';

export async function getUser(): Promise<{ username: string } | null> {
  const tokens = await window.electron.auth.getTokens();
  if (!tokens) return null;

  const payload = parseJwt(tokens.idToken);

  const username = payload['cognito:username'];
  return { username: typeof username === 'string' ? username : '' };
}
