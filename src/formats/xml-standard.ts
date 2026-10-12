/** XML 1.0 native character domain; JSON strings are checked after serialization. */
function isXMLCharacter(value: number): boolean {
  return value === 9 || value === 10 || value === 13 || value >= 32 && value <= 0xd7ff || value >= 0xe000 && value <= 0xfffd || value >= 0x10000 && value <= 0x10ffff;
}

/** Validate the actual native wire tree without rejecting JSON-escaped user data. */
export function getValidatedXMLValue(value: unknown): void {
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === 'string') {
      for (const character of current) if (!isXMLCharacter(character.codePointAt(0)!)) throw new Error('XML standard profile: invalid XML 1.0 character');
    } else if (typeof current === 'number' && !Number.isFinite(current)) throw new Error('XML standard profile: nonfinite native number');
    else if (current && typeof current === 'object') for (const value of Object.values(current)) pending.push(value);
  }
}

/** Preserve attribute whitespace and text CR through native XML normalization. */
export function getStandardXML(source: string): string {
  let tag = false, quote = '', output = '';
  for (const character of source) {
    if (character === '\r') output += '&#13;';
    else if (quote && (character === '\t' || character === '\n')) output += character === '\t' ? '&#9;' : '&#10;';
    else output += character;
    if (quote) { if (character === quote) quote = ''; }
    else if (tag && (character === '"' || character === "'")) quote = character;
    else if (character === '<') tag = true;
    else if (character === '>') tag = false;
  }
  return output;
}

/** NMTOKEN accepts XML NameChar, but whitespace normalization must not change IDs. */
export function isXMLNMTOKEN(value: string): boolean {
  return /^[A-Za-z0-9_.:\-\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0300-\u036F\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]+$/u.test(value);
}
