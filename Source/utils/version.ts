// Compares dotted numeric versions (1.10.0 > 1.9.3). A pre-release suffix
// (1.2.0-beta.1) sorts before the plain release of the same number.
// Returns >0 if a is newer, <0 if b is newer, 0 if equal.
export function compareVersions(a: string, b: string): number {
  const [aCore, aPre] = a.split('-', 2);
  const [bCore, bPre] = b.split('-', 2);
  const aParts = (aCore ?? '').split('.').map(Number);
  const bParts = (bCore ?? '').split('.').map(Number);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }

  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  return (aPre ?? '').localeCompare(bPre ?? '');
}
