import { ENTITY_TYPES, RELATIONSHIP_TYPES } from './bedrock';

export const VALID_ENTITY_TYPES = new Set<string>(ENTITY_TYPES);

export const VALID_REL_TYPES = new Set<string>(RELATIONSHIP_TYPES);

// Tokens that should stay uppercased in title case (acronyms / initialisms).
export const ALWAYS_UPPER = new Set(['LLC', 'LLP', 'LP', 'PLC', 'USA', 'UK', 'US', 'EU']);

// Maps lowercase suffix variants → canonical display form (Organization names only).
export const ORG_SUFFIX_MAP: Record<string, string> = {
  // Company
  co: 'Company',
  'co.': 'Company',
  company: 'Company',
  // Corporation
  corp: 'Corporation',
  'corp.': 'Corporation',
  corporation: 'Corporation',
  // Incorporated
  inc: 'Inc.',
  'inc.': 'Inc.',
  incorporated: 'Inc.',
  // Limited
  ltd: 'Ltd.',
  'ltd.': 'Ltd.',
  limited: 'Ltd.',
  // Associates
  assoc: 'Associates',
  'assoc.': 'Associates',
  associates: 'Associates',
  // Group / Holdings (common but not abbreviations — normalise spelling only)
  group: 'Group',
  holdings: 'Holdings',
  international: 'International',
  industries: 'Industries',
  enterprises: 'Enterprises',
  solutions: 'Solutions',
  services: 'Services',
};
