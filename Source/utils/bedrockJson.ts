import { jsonrepair } from 'jsonrepair';

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

  // Strategy 2: hand the full (fence-stripped) text to jsonrepair. It tokenizes
  // the text itself rather than relying on naive brace-counting, so it can fix
  // issues — like an unescaped quote inside a string value — that would otherwise
  // throw off the brace-balanced extraction below before it even runs.
  try {
    const s2 = tryParse(jsonrepair(stripped));
    if (s2) {
      Logger.warn(`Bedrock: response for document ${documentId} required JSON repair (jsonrepair on full response) to parse successfully.`);
      return s2;
    }
  } catch {
    // jsonrepair throws on input it can't fix — fall through to other strategies.
  }

  // Strategy 3: find and extract the outermost JSON object.
  const extracted = extractJsonObject(stripped);
  if (extracted) {
    const s3 = tryParse(extracted);
    if (s3) return s3;

    // Strategy 4: same object but with control characters inside strings sanitised.
    const sanitized = sanitizeJsonStrings(extracted);
    const s4 = tryParse(sanitized);
    if (s4) {
      Logger.warn(`Bedrock: response for document ${documentId} required control-character sanitisation to parse successfully.`);
      return s4;
    }

    // Strategy 5: hand off to jsonrepair on the extracted object as a last resort.
    try {
      const s5 = tryParse(jsonrepair(sanitized));
      if (s5) {
        Logger.warn(`Bedrock: response for document ${documentId} required JSON repair (jsonrepair on extracted object) to parse successfully.`);
        return s5;
      }
    } catch {
      // jsonrepair throws on input it can't fix — fall through to failure logging.
    }
  }

  Logger.warn(
    `Bedrock: all JSON parse strategies failed for document ${documentId}. ` +
      `Raw response (first 1000 chars): ${raw.slice(0, 1000)}`
  );
  return null;
}
