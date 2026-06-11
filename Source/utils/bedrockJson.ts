import { BedrockJsonPayload } from '../interfaces/bedrock';
import { Logger } from './logger';

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');
}

// Returns the substring from the first '{' to its matching closing '}'.
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

// Escapes literal control characters that are illegal in JSON, but only
// inside string values — structural whitespace between tokens is left alone.
function sanitizeJsonStrings(raw: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const code = ch.charCodeAt(0);
    if (escape) {
      escape = false;
      out += ch;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      out += ch;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString && code < 0x20) {
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
      // Skip other control characters (NUL, BEL, etc.)
      continue;
    }
    out += ch;
  }
  return out;
}

function tryParse(candidate: string): BedrockJsonPayload | null {
  try {
    return JSON.parse(candidate) as BedrockJsonPayload;
  } catch {
    return null;
  }
}

export function parseBedrockJson(raw: string, documentId: string): BedrockJsonPayload | null {
  // Strategy 1: strip code fences and parse directly.
  const stripped = stripFences(raw);
  const s1 = tryParse(stripped);
  if (s1) return s1;

  // Strategy 2: find and extract the outermost JSON object.
  const extracted = extractJsonObject(stripped);
  if (extracted) {
    const s2 = tryParse(extracted);
    if (s2) return s2;

    // Strategy 3: same object but with control characters inside strings sanitised.
    const s3 = tryParse(sanitizeJsonStrings(extracted));
    if (s3) return s3;
  }

  Logger.warn(
    `Bedrock: all JSON parse strategies failed for document ${documentId}. ` +
      `Raw response (first 200 chars): ${raw.slice(0, 200)}`
  );
  return null;
}
