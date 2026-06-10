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
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '#quot;')
    .replace(/;/g, '#59;')
    .replace(/\|/g, '#124;')
    .replace(/#(?!quot;|59;|35;|124;)/g, '#35;');
}

/** Unescape a Mermaid label back to plain text. */
export function unescapeMermaidLabel(s: string): string {
  return s
    .replace(/#quot;/g, '"')
    .replace(/#59;/g, ';')
    .replace(/#124;/g, '|')
    .replace(/#35;/g, '#');
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

/** Strip `%%{init: ...}%%` directives and return them separately. */
export function stripDirectives(input: string): {
  directives: Record<string, any>;
  cleaned: string;
} {
  const directives: Record<string, any> = {};
  const cleaned = input.replace(
    /%%\{[\s]*init[\s]*:[\s]*(.*?)[\s]*\}%%/gs,
    (_match, json) => {
      try {
        Object.assign(directives, JSON.parse(`{${json}}`));
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

/** Validate input is a non-empty string, throw with prefix if not. */
export function validateInput(input: unknown, prefix: string): asserts input is string {
  if (typeof input !== 'string') {
    throw new Error(`${prefix}: expected a string`);
  }
  if (!input.trim()) {
    throw new Error(`${prefix}: input is empty`);
  }
}
