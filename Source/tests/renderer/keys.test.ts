import { describe, expect, it } from 'vitest';

import { withContentKeys } from '../../utils/renderer/keys';

describe('withContentKeys', () => {
  it('keys items by content and suffixes repeats', () => {
    const rows = withContentKeys(['a', 'b', 'a', 'a'], (s) => s);

    expect(rows.map((r) => r.key)).toEqual(['a', 'b', 'a#2', 'a#3']);
    expect(rows.map((r) => r.item)).toEqual(['a', 'b', 'a', 'a']);
  });

  it('keeps an item’s key when items before it are removed', () => {
    const before = withContentKeys(['x', 'y'], (s) => s);
    const after = withContentKeys(['y'], (s) => s);

    expect(after[0].key).toBe(before[1].key);
  });
});
