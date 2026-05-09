export function extractSub(idToken: string): string {
  const base64 = idToken.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '';
  const payload = JSON.parse(
    Buffer.from(base64, 'base64').toString('utf-8')
  ) as Record<string, unknown>;
  const sub = payload['sub'];
  if (typeof sub !== 'string' || !sub) throw new Error('ID token missing sub claim');
  return sub;
}