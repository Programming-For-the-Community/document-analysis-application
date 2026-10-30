import { jsonrepair } from 'jsonrepair';

import { BedrockJsonPayload } from '../interfaces/bedrock';
import { Logger } from './logger';

function stripFences(raw: string): string {
  // trim() first so the closing fence is anchored at the very end — avoids a
  // `\s*```\s*$` pattern, which backtracks quadratically on long whitespace runs.
  return raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
}

// Classifies each character of a JSON text by whether it's part of a string
// literal. 'escaped' is the character right after a backslash inside a string.
type CharKind = 'structural' | 'string' | 'escaped';

function createStringTracker(): (ch: string) => CharKind {
  let inString = false;
  let escape = false;
  return (ch) => {
    if (escape) {
      escape = false;
      return 'escaped';
    }
    if (ch === '"') {
      inString = !inString;
      return 'string';
    }
    if (!inString) return 'structural';
    if (ch === '\\') escape = true;
    return 'string';
  };
}

// Returns the substring from the first '{' to its matching closing '}'.
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  const track = createStringTracker();
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!;
    if (track(ch) !== 'structural') continue;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return raw.slice(start, i + 1);
  }
  return null;
}

const CONTROL_ESCAPES: Record<string, string> = {
  '\n': String.raw`\n`,
  '\r': String.raw`\r`,
  '\t': String.raw`\t`,
};

// Escapes literal control characters that are illegal in JSON, but only
// inside string values — structural whitespace between tokens is left alone.
// Control characters other than \n, \r and \t (NUL, BEL, etc.) are dropped.
function sanitizeJsonStrings(raw: string): string {
  const track = createStringTracker();
  let out = '';
  for (const ch of raw) {
    const isControl = (ch.codePointAt(0) ?? 0) < 0x20;
    out += track(ch) === 'string' && isControl ? (CONTROL_ESCAPES[ch] ?? '') : ch;
  }
  return out;
}

// Only a JSON object counts — jsonrepair will happily "repair" plain prose into
// a JSON string, which would otherwise pass as an empty (but successful) graph.
function tryParse(candidate: string): BedrockJsonPayload | null {
  try {
    const value: unknown = JSON.parse(candidate);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as BedrockJsonPayload)
      : null;
  } catch {
    return null;
  }
}

// Which parse strategy succeeded — 'clean' means the model returned valid JSON
// (possibly wrapped in fences or prose); anything else means the output was malformed.
export type BedrockParseStrategy = 'clean' | 'repaired' | 'sanitised';

export interface BedrockParseResult {
  payload: BedrockJsonPayload;
  strategy: BedrockParseStrategy;
}

export function parseBedrockJson(raw: string, documentId: string): BedrockParseResult | null {
  // Strategy 1: strip code fences and parse directly.
  const stripped = stripFences(raw);
  const s1 = tryParse(stripped);
  if (s1) return { payload: s1, strategy: 'clean' };

  // Strategy 2: hand the full (fence-stripped) text to jsonrepair. It tokenizes
  // the text itself rather than relying on naive brace-counting, so it can fix
  // issues — like an unescaped quote inside a string value — that would otherwise
  // throw off the brace-balanced extraction below before it even runs.
  try {
    const s2 = tryParse(jsonrepair(stripped));
    if (s2) {
      Logger.warn(
        `Bedrock: response for document ${documentId} required JSON repair (jsonrepair on full response) to parse successfully.`
      );
      return { payload: s2, strategy: 'repaired' };
    }
  } catch {
    // jsonrepair throws on input it can't fix — fall through to other strategies.
  }

  // Strategy 3: find and extract the outermost JSON object.
  const extracted = extractJsonObject(stripped);
  if (extracted) {
    const s3 = tryParse(extracted);
    if (s3) return { payload: s3, strategy: 'clean' };

    // Strategy 4: same object but with control characters inside strings sanitised.
    const sanitized = sanitizeJsonStrings(extracted);
    const s4 = tryParse(sanitized);
    if (s4) {
      Logger.warn(
        `Bedrock: response for document ${documentId} required control-character sanitisation to parse successfully.`
      );
      return { payload: s4, strategy: 'sanitised' };
    }

    // Strategy 5: hand off to jsonrepair on the extracted object as a last resort.
    try {
      const s5 = tryParse(jsonrepair(sanitized));
      if (s5) {
        Logger.warn(
          `Bedrock: response for document ${documentId} required JSON repair (jsonrepair on extracted object) to parse successfully.`
        );
        return { payload: s5, strategy: 'repaired' };
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
