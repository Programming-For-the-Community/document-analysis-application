import { describe, expect, it } from 'vitest';

import { chunkText } from '../../utils/chunker';

describe('chunkText', () => {
  it('returns nothing for blank text', () => {
    expect(chunkText('   \n ')).toEqual([]);
  });

  it('returns short text as a single trimmed chunk', () => {
    expect(chunkText('  hello world  ')).toEqual(['hello world']);
  });

  it('splits long text into overlapping chunks that cover all of it', () => {
    const text = Array.from({ length: 300 }, (_, i) => `Sentence number ${i}.`).join(' ');
    const chunks = chunkText(text, 500, 100);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(500));
    expect(chunks[0]!.startsWith('Sentence number 0.')).toBe(true);
    expect(chunks.at(-1)!.endsWith('Sentence number 299.')).toBe(true);
  });

  it('prefers breaking at a sentence boundary', () => {
    const text = `${'a'.repeat(450)}. ${'b'.repeat(300)}`;
    const [first] = chunkText(text, 500, 50);
    expect(first!.endsWith('.')).toBe(true);
  });
});
