import { describe, expect, it } from 'vitest';

import { normalizeEntityName } from '../../utils/entityNormalization';

describe('normalizeEntityName', () => {
  it('title-cases all-caps names', () => {
    expect(normalizeEntityName('JONATHAN SMITHERS', 'Person')).toBe('Jonathan Smithers');
  });

  it('keeps known acronyms and short codes upper-case', () => {
    expect(normalizeEntityName('GLOBEX USA LLC', 'Organization')).toBe('Globex USA LLC');
  });

  it('leaves mixed-case names alone apart from trimming', () => {
    expect(normalizeEntityName('  McDonald  ', 'Person')).toBe('McDonald');
  });

  it('canonicalises organisation suffixes', () => {
    expect(normalizeEntityName('Acme corp.', 'Organization')).toBe('Acme Corporation');
    expect(normalizeEntityName('Acme corp.', 'Person')).toBe('Acme corp.');
  });
});
