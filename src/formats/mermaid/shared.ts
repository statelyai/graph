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

/** Native display strings require Unicode scalars; NUL HTML references normalize. */
export function getMermaidDisplayText(value: string): string {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0) throw new Error('Mermaid: NUL display text is unrepresentable');
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('Mermaid: display text must contain Unicode scalars');
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error('Mermaid: display text must contain Unicode scalars');
  }
  return value;
}

/** Escape a label for Mermaid output (quotes special chars). */
export function escapeMermaidLabel(s: string): string {
  getMermaidDisplayText(s);
  const entities: Record<string, string> = {
    '\\': '#92;',
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
  return getMermaidDisplayText(s
    .replace(/#quot;/g, '"')
    .replace(/#(\d+);/g, (match, code) => {
      const point = Number(code);
      return Number.isSafeInteger(point) && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }));
}

export function isMermaidEscaped(input: string, index: number): boolean {
  let count = 0;
  while (index > 0 && input[--index] === '\\') count++;
  return count % 2 === 1;
}

/** Source annotations preserved independently of the editable graph projection. */
export interface MermaidSourceData {
  source?: {
    comments?: string[];
    /** YAML is opaque; retaining it does not imply parsing its configuration. */
    frontmatter?: string;
    directives?: Record<string, any>;
    /** Unsupported statements are retained for inspection, never projected as nodes. */
    unknownStatements?: string[];
  };
}

/** Split outside quoted strings, brackets and braces; optionally split whitespace. */
export function getMermaidTokens(input: string, delimiter = ',', escapedQuotes = true): string[] {
  const tokens: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quote) {
      if (char === quote && (!escapedQuotes || !isMermaidEscaped(input, i))) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if ('[{('.includes(char)) depth++;
    if (']})'.includes(char)) depth = Math.max(0, depth - 1);
    if (depth === 0 && !isMermaidEscaped(input, i) && (delimiter === ' ' ? /\s/.test(char) : char === delimiter)) {
      const token = input.slice(start, i).trim();
      if (token) tokens.push(token);
      start = i + 1;
    }
  }
  const token = input.slice(start).trim();
  if (token) tokens.push(token);
  return tokens;
}

export function getMermaidStyle(input: string): Record<string, string> {
  const properties: Record<string, string> = Object.create(null);
  for (const token of getMermaidTokens(input)) {
    const index = token.indexOf(':');
    if (index < 0) continue;
    properties[token.slice(0, index).trim()] = token.slice(index + 1).trim().replace(/;$/, '');
  }
  return properties;
}

export function getMermaidProperties(input: string): Record<string, string | number | boolean> {
  const properties: Record<string, string | number | boolean> = Object.create(null);
  for (const token of getMermaidTokens(input)) {
    const match = token.match(/^\s*["']?([\w-]+)["']?\s*:\s*([\s\S]*)$/);
    if (!match) continue;
    const value = match[2].trim();
    let text = value.replace(/^(["'])([\s\S]*)\1$/, '$2');
    if (value.startsWith('"') && value.endsWith('"')) {
      try { text = JSON.parse(value); } catch { /* Flowchart strings also permit entity escaping. */ }
    }
    properties[match[1]] = value === 'true' ? true : value === 'false' ? false
      : /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value)
      : unescapeMermaidLabel(text);
  }
  return properties;
}

export function toMermaidProperties(properties: Record<string, string | number | boolean>): string {
  return Object.entries(properties).map(([key, value]) => `${key}: ${typeof value === 'string'
    ? `"${escapeMermaidLabel(value)}"` : value}`).join(', ');
}

export function getMermaidPreamble(data: MermaidSourceData & { init?: Record<string, any> }): string[] {
  const lines: string[] = [];
  if (data.source?.frontmatter) lines.push(data.source.frontmatter);
  for (const [key, value] of Object.entries(data.source?.directives ?? {})) {
    if (key === 'init' && data.init) continue;
    const directive = directiveToString(key, value);
    if (directive) lines.push(directive);
  }
  for (const comment of data.source?.comments ?? []) lines.push(comment);
  return lines;
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

/** Display fallback for absent labels; unsafe scalar IDs remain safe native aliases. */
export function getMermaidIdDisplay(id: string): string {
  try { return getMermaidDisplayText(id); } catch { return escapeMermaidId(id); }
}

/** Decode a node id escaped by {@link escapeMermaidId} back to its raw form. */
export function unescapeMermaidId(s: string): string {
  if (s.startsWith(ENCODED_ID_PREFIX)) {
    const encoded = s.slice(ENCODED_ID_PREFIX.length);
    if (encoded.length % 4 === 0 && /^[0-9a-f]*$/i.test(encoded)) {
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
      const idx = getMermaidCommentIndex(line);
      if (idx === -1) return line;
      return line.slice(0, idx);
    })
    .join('\n');
}

function getMermaidCommentIndex(line: string): number {
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '"' && !isMermaidEscaped(line, index)) quoted = !quoted;
    if (!quoted && line.startsWith('%%', index)) return index;
  }
  return -1;
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
  source?: MermaidSourceData['source'];
} {
  const frontmatterMatch = input.match(/^\s*(---\r?\n[\s\S]*?\r?\n---)(?:\r?\n|$)/);
  const withoutFrontmatter = frontmatterMatch ? input.slice(frontmatterMatch[0].length) : input;
  const { directives, cleaned } = stripDirectives(withoutFrontmatter);
  const comments = cleaned.split('\n').flatMap((line) => {
    const index = getMermaidCommentIndex(line);
    if (index < 0) return [];
    return [line.slice(index)];
  });
  const stripped = stripComments(cleaned);
  const lines = stripped
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '');
  const source = {
    ...(frontmatterMatch && { frontmatter: frontmatterMatch[1] }),
    ...(comments.length && { comments }),
    ...(Object.keys(directives).length && { directives }),
  };
  return { lines, directives, ...(Object.keys(source).length && { source }) };
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
