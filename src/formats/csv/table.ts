export interface CSVCell { value: string; start: number; end: number; quoted: boolean }
export interface CSVTable { headers: string[]; rows: CSVCell[][] }

/** Strict header-bearing RFC 4180 table with lexical cell spans. */
export function getCSVTable(source: string, delimiter: ',' | '\t'): CSVTable {
  if (typeof source !== 'string' || !source) throw new Error('CSV: a non-empty header is required');
  const records: CSVCell[][] = [];
  let row: CSVCell[] = [];
  let index = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (index < source.length) {
    const start = index;
    const quoted = source[index] === '"';
    let value: string;
    if (quoted) {
      index++;
      const contentStart = index;
      let closed = false;
      while (index < source.length) {
        if (source[index] !== '"') { index++; continue; }
        if (source[index + 1] === '"') { index += 2; continue; }
        value = source.slice(contentStart, index).replace(/""/g, '"');
        index++; closed = true; break;
      }
      if (!closed) throw new Error(`CSV: unterminated quoted cell at ${start}`);
      if (index < source.length && ![delimiter, '\r', '\n'].includes(source[index])) throw new Error(`CSV: unexpected text after quoted cell at ${index}`);
    } else {
      while (index < source.length && ![delimiter, '\r', '\n'].includes(source[index])) {
        if (source[index] === '"') throw new Error(`CSV: quote in unquoted cell at ${index}`);
        index++;
      }
      value = source.slice(start, index);
    }
    row.push({ value: value!, start, end: index, quoted });
    if (source[index] === delimiter) {
      index++;
      if (index === source.length) row.push({ value: '', start: index, end: index, quoted: false });
      continue;
    }
    if (source[index] === '\r') {
      if (source[index + 1] !== '\n') throw new Error(`CSV: bare CR outside a quoted cell at ${index}`);
      index += 2;
    } else if (source[index] === '\n') index++;
    records.push(row); row = [];
  }
  if (row.length) records.push(row);
  const headers = records.shift()?.map((cell) => cell.value) ?? [];
  if (!headers.length || headers.some((name) => !name) || new Set(headers).size !== headers.length) throw new Error('CSV: headers must be unique non-empty strings');
  for (const cells of records) if (cells.length !== headers.length) throw new Error(`CSV: row has ${cells.length} cells; header has ${headers.length}`);
  return { headers, rows: records };
}

export function toCSVCell(value: string, delimiter: ',' | '\t', quoted = false): string {
  return quoted || value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
