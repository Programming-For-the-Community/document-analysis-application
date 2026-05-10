const DEFAULT_CHUNK_CHARS = 2000;
const DEFAULT_OVERLAP_CHARS = 400;

export function chunkText(
  text: string,
  chunkSize = DEFAULT_CHUNK_CHARS,
  overlap = DEFAULT_OVERLAP_CHARS
): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= chunkSize) return [trimmed];

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    let end = start + chunkSize;

    if (end < trimmed.length) {
      // Prefer breaking at a paragraph or sentence boundary in the last 20% of the chunk
      const searchFrom = start + Math.floor(chunkSize * 0.8);
      const newline = trimmed.lastIndexOf('\n', end);
      const period  = trimmed.lastIndexOf('. ', end);
      if (newline >= searchFrom) {
        end = newline + 1;
      } else if (period >= searchFrom) {
        end = period + 2;
      }
    }

    const chunk = trimmed.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);

    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}
