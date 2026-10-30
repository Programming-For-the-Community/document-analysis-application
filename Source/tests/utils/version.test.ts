import { describe, expect, it } from 'vitest';

import { compareVersions } from '../../utils/version';

describe('compareVersions', () => {
  it('orders by numeric segment, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareVersions('1.9.3', '1.10.0')).toBeLessThan(0);
  });

  it('treats missing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
  });

  it('sorts a pre-release before its release', () => {
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBeLessThan(0);
    expect(compareVersions('1.2.0', '1.2.0-beta.1')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0-beta.2', '1.2.0-beta.1')).toBeGreaterThan(0);
  });

  it('returns 0 for identical versions', () => {
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });
});
