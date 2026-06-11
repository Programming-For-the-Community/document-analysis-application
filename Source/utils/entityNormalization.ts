import { ALWAYS_UPPER, ORG_SUFFIX_MAP } from '../constants/neo4j';

function isAllCaps(name: string): boolean {
  return name === name.toUpperCase() && /[A-Z]{2,}/.test(name);
}

function toTitleCase(word: string): string {
  if (ALWAYS_UPPER.has(word.toUpperCase())) return word.toUpperCase();
  // Preserve short all-caps tokens — likely acronyms or geographic codes (NY, UAE, etc.)
  if (word.length <= 4 && word === word.toUpperCase()) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function normalizeEntityName(name: string, type: string): string {
  const trimmed = name.trim();
  const tokens = trimmed.split(/\s+/);
  const cased = isAllCaps(trimmed) ? tokens.map(toTitleCase) : tokens;

  if (type === 'Organization') {
    // Normalize the last two tokens to catch compound suffixes like "Co. Ltd."
    for (let i = Math.max(0, cased.length - 2); i < cased.length; i++) {
      const canonical = ORG_SUFFIX_MAP[cased[i].toLowerCase()];
      if (canonical) cased[i] = canonical;
    }
  }

  return cased.join(' ');
}
