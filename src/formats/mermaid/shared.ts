import type { Graph } from '../../types';

// --- Direction mappings ---

export const MERMAID_TO_DIRECTION: Record<string, Graph['direction']> = {
  TB: 'down',
  TD: 'down',
  BT: 'up',
  LR: 'right',
  RL: 'left',
};

export const DIRECTION_TO_MERMAID: Record<string, string> = {
  down: 'TD',
  up: 'BT',
  right: 'LR',
  left: 'RL',
};

// --- String escaping ---

/** Escape a label for Mermaid output (quotes special chars). */
export function escapeMermaidLabel(s: string): string {
  const entities: Record<string, string> = {
    '\\': '\\\\',
    '#': '#35;',
    '"': '#quot;',
    ';': '#59;',
    '|': '#124;',
    '\t': '#9;',
    '\n': '#10;',
    '\r': '#13;',
    '<': '#60;',
    '>': '#62;',
  };
  return s.replace(/[\\#";|\t\n\r<>]/g, (char) => entities[char]!);
}

/** Unescape a Mermaid label back to plain text. */
export function unescapeMermaidLabel(s: string): string {
  return s
    .replace(/#quot;/g, '"')
    .replace(/#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

const ENCODED_ID_PREFIX = '__stately_id_';
const SAFE_MERMAID_ID = /^[A-Za-z0-9_]+$/;

/**
 * Escape a node id for Mermaid output so characters that collide with the
 * flowchart grammar (e.g. an id like `(root)`) cannot be misread as shape or
 * statement syntax by a spec-compliant Mermaid parser. Unsafe UTF-16 code
 * units are encoded into a namespaced bare identifier. Inverse of
 * {@link unescapeMermaidId}. Safe ids pass through unchanged.
 */
export function escapeMermaidId(s: string): string {
  if (SAFE_MERMAID_ID.test(s) && !s.startsWith(ENCODED_ID_PREFIX)) return s;

  let encoded = '';
  for (let index = 0; index < s.length; index++) {
    encoded += s.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return `${ENCODED_ID_PREFIX}${encoded}`;
}

/** Decode a node id escaped by {@link escapeMermaidId} back to its raw form. */
export function unescapeMermaidId(s: string): string {
  if (s.startsWith(ENCODED_ID_PREFIX)) {
    const encoded = s.slice(ENCODED_ID_PREFIX.length);
    if (encoded.length > 0 && encoded.length % 4 === 0 && /^[0-9a-f]+$/i.test(encoded)) {
      let decoded = '';
      for (let index = 0; index < encoded.length; index += 4) {
        decoded += String.fromCharCode(Number.parseInt(encoded.slice(index, index + 4), 16));
      }
      return decoded;
    }
  }

  // Accept entity-encoded ids emitted by pre-release converter versions.
  return s
    .replace(/#quot;/g, '"')
    .replace(/#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

// --- ID generation ---

/** Generate a deterministic edge ID from source, target, and index. */
export function generateEdgeId(
  sourceId: string,
  targetId: string,
  index: number,
): string {
  return `${sourceId}-${targetId}-${index}`;
}

// --- Comment & directive stripping ---

/** Strip `%%` single-line comments from Mermaid input. */
export function stripComments(input: string): string {
  return input
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('%%');
      if (idx === -1) return line;
      // Don't strip if inside a quoted string before the %%
      const before = line.slice(0, idx);
      const singleQuotes = (before.match(/"/g) || []).length;
      if (singleQuotes % 2 !== 0) return line; // inside quotes
      return line.slice(0, idx);
    })
    .join('\n');
}

/**
 * Strip `%%{init: {...}}%%` directives and return them separately.
 *
 * Mermaid's real directive syntax embeds a full JSON object after the key, e.g.
 * `%%{init: {"theme":"forest"}}%%`. The extracted object is stored under its key
 * (`{ init: { theme: 'forest' } }`) so it can be re-emitted verbatim.
 */
export function stripDirectives(input: string): {
  directives: Record<string, any>;
  cleaned: string;
} {
  const directives: Record<string, any> = {};
  // Match `%%{ <key> : <json-object> }%%`. `\{[\s\S]*?\}` inside is greedy-safe
  // because the whole directive is bounded by `}%%`.
  const cleaned = input.replace(
    /%%\{\s*(\w+)\s*:\s*(\{[\s\S]*?\})\s*\}%%/g,
    (_match, key, json) => {
      try {
        directives[key] = JSON.parse(json);
      } catch {
        // ignore malformed directives
      }
      return '';
    },
  );
  return { directives, cleaned };
}

/**
 * Split input into non-empty trimmed lines, stripping comments and directives.
 * Returns the cleaned lines and any extracted directives.
 */
export function prepareLines(input: string): {
  lines: string[];
  directives: Record<string, any>;
} {
  const { directives, cleaned } = stripDirectives(input);
  const stripped = stripComments(cleaned);
  const lines = stripped
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '');
  return { lines, directives };
}

/**
 * Serialize a single preserved directive object back to a Mermaid directive
 * line, e.g. `directiveToString('init', {...})` → `%%{init: {...}}%%`.
 * Returns `undefined` when the value is empty.
 */
export function directiveToString(
  key: string,
  value: Record<string, any> | undefined,
): string | undefined {
  if (!value || Object.keys(value).length === 0) return undefined;
  return `%%{${key}: ${JSON.stringify(value)}}%%`;
}

/** Validate input is a non-empty string, throw with prefix if not. */
export function validateInput(input: unknown, prefix: string): asserts input is string {
  if (typeof input !== 'string') {
    throw new Error(`${prefix}: expected a string`);
  }
  if (!input.trim()) {
    throw new Error(`${prefix}: input is empty`);
  }
}
