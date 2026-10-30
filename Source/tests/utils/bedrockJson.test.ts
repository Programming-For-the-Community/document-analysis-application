import { describe, expect, it } from 'vitest';

import { parseBedrockJson } from '../../utils/bedrockJson';

const graph = { entities: [{ id: 'e1', type: 'Person', value: 'Jane Doe' }], relationships: [] };

describe('parseBedrockJson', () => {
  it('parses clean JSON', () => {
    expect(parseBedrockJson(JSON.stringify(graph), 'doc')).toEqual({
      payload: graph,
      strategy: 'clean',
    });
  });

  it('strips markdown fences and surrounding whitespace', () => {
    const raw = `  \`\`\`json\n${JSON.stringify(graph)}\n\`\`\`  \n`;
    expect(parseBedrockJson(raw, 'doc')).toEqual({ payload: graph, strategy: 'clean' });
  });

  it('extracts the object from surrounding prose, ignoring braces inside strings', () => {
    const raw = 'Here is the result: {"entities":[{"id":"e1","value":"a } b"}]} — done';
    expect(parseBedrockJson(raw, 'doc')?.payload).toEqual({
      entities: [{ id: 'e1', value: 'a } b' }],
    });
  });

  it('handles escaped quotes inside strings', () => {
    const raw = 'x {"entities":[{"id":"e1","value":"say \\"hi\\" } {"}]} y';
    expect(parseBedrockJson(raw, 'doc')?.payload).toEqual({
      entities: [{ id: 'e1', value: 'say "hi" } {' }],
    });
  });

  it('escapes literal newlines/tabs in strings and drops other control characters', () => {
    const raw = '{"entities":[{"id":"e1","value":"line1\nline2\ttab\u0007bell"}]}';
    const result = parseBedrockJson(raw, 'doc');
    expect(result?.strategy).toBe('sanitised');
    expect(result?.payload).toEqual({ entities: [{ id: 'e1', value: 'line1\nline2\ttabbell' }] });
  });

  it('repairs malformed JSON', () => {
    const raw = '{"entities":[{"id":"e1","value":"x",}],}';
    expect(parseBedrockJson(raw, 'doc')?.strategy).toBe('repaired');
  });

  // Prose around the object makes jsonrepair reject the full text, so these reach
  // the extracted-object strategies.
  it('repairs a malformed object wrapped in prose', () => {
    const raw = 'Answer: {"entities":[{"id":"e1","value":"x",}]} thanks';
    expect(parseBedrockJson(raw, 'doc')).toEqual({
      payload: { entities: [{ id: 'e1', value: 'x' }] },
      strategy: 'repaired',
    });
  });

  it('gives up on a wrapped object that never closes', () => {
    expect(parseBedrockJson('Result: {"entities": [ trailing', 'doc')).toBeNull();
  });

  it('gives up on a wrapped object that cannot be repaired', () => {
    expect(parseBedrockJson('Result: {{}} trailing', 'doc')).toBeNull();
  });

  it('returns null when nothing is recoverable', () => {
    expect(parseBedrockJson('no json here at all', 'doc')).toBeNull();
  });

  it('stays fast on long whitespace runs (no regex backtracking)', () => {
    const raw = `${JSON.stringify(graph)}${' '.repeat(200_000)}x`;
    const started = performance.now();
    parseBedrockJson(raw, 'doc');
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
