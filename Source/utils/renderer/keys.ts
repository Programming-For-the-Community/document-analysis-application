// React keys for lists with no unique id: each item's key is built from its own
// content, so it stays with the item when the list changes (an array index
// doesn't). Repeats of the same content get a #2, #3… suffix to stay unique.
export function withContentKeys<T>(
  items: readonly T[],
  contentOf: (item: T) => string
): Array<{ item: T; key: string }> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = contentOf(item);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { item, key: count === 1 ? base : `${base}#${count}` };
  });
}
