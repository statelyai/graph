import { createGraphDocumentConverter } from '../document';
import { getGMLDocumentPatch, getGMLDocumentProjection } from './document';
import type { Graph, GraphNode, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import { createFormatData, getFormatMetadata, getUserData } from '../xml-preservation';

export interface GMLImportOptions {
  /** Disable legacy backslash escapes and read native GML strings literally. */
  standard?: boolean;
}

export interface GMLExportOptions {
  /** Use integer identity references required by standard GML; retain Graph IDs in a versioned extension. */
  standard?: boolean;
}

const blockEntries = new WeakMap<object, Array<[string, any]>>();

// --- GML serializer ---

/**
 * Converts a graph to GML (Graph Modelling Language) string.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { toGML } from '@statelyai/graph/gml';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const gml = toGML(graph);
 * // graph [
 * //   directed 1
 * //   node [ id "a" ]
 * //   node [ id "b" ]
 * //   edge [ id "e0" source "a" target "b" ]
 * // ]
 * ```
 */
export function toGML(graph: Graph, options: GMLExportOptions = {}): string {
  const lines: string[] = [];
  const getString = options.standard ? getValidatedGMLString : getGMLString;
  if (options.standard) {
    for (const entity of [graph, ...graph.nodes, ...graph.edges]) {
      for (const key of ['id', 'parentId', 'initialNodeId', 'sourceId', 'targetId']) {
        const value = (entity as unknown as Record<string, unknown>)[key];
        if (typeof value === 'string') getValidatedGMLString(value);
      }
    }
  }
  const nodeIds = new Map(graph.nodes.map((node,index) => [node.id,index]));
  const getNodeId = (id: string): string => options.standard ? String(nodeIds.get(id) ?? (() => { throw new Error(`GML: unknown endpoint ${id}`); })()) : getString(id);
  getNativeLines(lines, getFormatMetadata(graph.data,'gml')?.topLevel ?? [], '', options.standard);
  lines.push('graph [');
  lines.push(`  directed ${graph.mode === 'undirected' ? 0 : 1}`);
  if (options.standard) {
    const pairs = new Set<string>();
    let parallel = false;
    for (const edge of graph.edges) {
      const pair = graph.mode === 'undirected' ? [edge.sourceId, edge.targetId].sort() : [edge.sourceId, edge.targetId];
      const key = JSON.stringify(pair);
      if (pairs.has(key)) parallel = true;
      pairs.add(key);
    }
    const hints = (getFormatMetadata(graph.data, 'gml')?.entries ?? []).filter((entry: any[]) => entry[0] === 'multigraph');
    if (parallel && hints.length && (hints.length !== 1 || hints[0][1] !== 1)) throw new Error('GML standard profile: native multigraph hint conflicts with parallel edges');
    if (parallel && !hints.length) lines.push('  multigraph 1');
  }
  // GML `directed` is binary; preserve bidirectional via a dialect key.
  if (graph.mode === 'bidirectional') {
    lines.push(`  mode ${getString(graph.mode)}`);
  }
  if (graph.id !== '') lines.push(`  id ${options.standard ? '0' : getString(graph.id)}`);
  if (options.standard) lines.push(`  stately ${getString(JSON.stringify({ format:'stately',version:1,originalId:graph.id }))}`);
  getNativeLines(lines,getFormatMetadata(graph.data,'gml')?.entries ?? [],'  ', options.standard);
  if (graph.initialNodeId != null) {
    lines.push(`  initialNodeId ${getString(graph.initialNodeId)}`);
  }
  if (getUserData(graph.data,'gml') !== undefined) {
    lines.push(`  data ${getString(JSON.stringify(getUserData(graph.data,'gml')))}`);
  }
  if (graph.direction) lines.push(`  direction ${getString(graph.direction)}`);
  if (graph.style !== undefined) {
    lines.push(`  style ${getString(JSON.stringify(graph.style))}`);
  }

  // Build children map for hierarchical nesting
  const childrenMap = new Map<string | null, GraphNode[]>();
  for (const node of graph.nodes) {
    const pid = node.parentId ?? null;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(node);
  }

  // Recursive node writer
  function addNodeLines(node: GraphNode, indent: string) {
    lines.push(`${indent}node [`);
    lines.push(`${indent}  id ${getNodeId(node.id)}`);
    lines.push(`${indent}  stately ${getString(JSON.stringify({ format:'stately',version:1,index:nodeIds.get(node.id),...(options.standard && {originalId:node.id,parentId:node.parentId}),...(node.label === null && {nullLabel:true}) }))}`);
    getNativeLines(lines,getFormatMetadata(node.data,'gml')?.entries ?? [],indent + '  ', options.standard);
    if (node.label != null && !(node.label === '' && getFormatMetadata(node.data, 'gml')?.implicitLabel)) lines.push(`${indent}  label ${getString(node.label)}`);
    if (node.initialNodeId != null)
      lines.push(`${indent}  initialNodeId ${getString(node.initialNodeId)}`);
    if (getUserData(node.data,'gml') !== undefined)
      lines.push(`${indent}  data ${getString(JSON.stringify(getUserData(node.data,'gml')))}`);
    if (node.ports !== undefined) {
      lines.push(`${indent}  ports ${getString(JSON.stringify(node.ports))}`);
    }
    if (node.shape !== undefined) lines.push(`${indent}  shape ${getString(node.shape)}`);
    if (node.color !== undefined) lines.push(`${indent}  color ${getString(node.color)}`);
    if (node.style !== undefined) {
      lines.push(`${indent}  style ${getString(JSON.stringify(node.style))}`);
    }
    if (
      node.x !== undefined ||
      node.y !== undefined ||
      node.width !== undefined ||
      node.height !== undefined || getFormatMetadata(node.data,'gml')?.graphics?.length
    ) {
      lines.push(`${indent}  graphics [`);
      getNativeLines(lines,getFormatMetadata(node.data,'gml')?.graphics ?? [],indent+'    ', options.standard);
      if (node.x !== undefined) lines.push(`${indent}    x ${node.x}`);
      if (node.y !== undefined) lines.push(`${indent}    y ${node.y}`);
      if (node.width !== undefined) lines.push(`${indent}    w ${node.width}`);
      if (node.height !== undefined)
        lines.push(`${indent}    h ${node.height}`);
      lines.push(`${indent}  ]`);
    }
    // Nested children
    const children = childrenMap.get(node.id);
    if (children && !options.standard) {
      for (const child of children) {
        addNodeLines(child, indent + '  ');
      }
    }
    lines.push(`${indent}]`);
  }

  // Write root nodes
  const roots = options.standard ? graph.nodes : childrenMap.get(null) ?? [];
  for (const node of roots) {
    addNodeLines(node, '  ');
  }

  for (const [edgeIndex,edge] of graph.edges.entries()) {
    lines.push('  edge [');
    lines.push(`    id ${options.standard ? edgeIndex : getString(edge.id)}`);
    if (options.standard || edge.label === null) lines.push(`    stately ${getString(JSON.stringify({format:'stately',version:1,...(options.standard && {originalId:edge.id}),...(edge.label === null && {nullLabel:true})}))}`);
    getNativeLines(lines,getFormatMetadata(edge.data,'gml')?.entries ?? [],'    ', options.standard);
    lines.push(`    source ${getNodeId(edge.sourceId)}`);
    lines.push(`    target ${getNodeId(edge.targetId)}`);
    if (edge.mode) lines.push(`    mode ${getString(edge.mode)}`);
    if (edge.label != null && !(edge.label === '' && getFormatMetadata(edge.data, 'gml')?.implicitLabel)) lines.push(`    label ${getString(edge.label)}`);
    if (getUserData(edge.data,'gml') !== undefined)
      lines.push(`    data ${getString(JSON.stringify(getUserData(edge.data,'gml')))}`);
    if (edge.weight !== undefined) lines.push(`    weight ${edge.weight}`);
    if (edge.points !== undefined) {
      lines.push(`    points ${getString(JSON.stringify(edge.points))}`);
    }
    if (edge.routing !== undefined) {
      lines.push(`    routing ${getString(edge.routing)}`);
    }
    if (edge.sourcePort !== undefined) {
      lines.push(`    sourcePort ${getString(edge.sourcePort)}`);
    }
    if (edge.targetPort !== undefined) {
      lines.push(`    targetPort ${getString(edge.targetPort)}`);
    }
    if (edge.color !== undefined) lines.push(`    color ${getString(edge.color)}`);
    if (edge.style !== undefined) {
      lines.push(`    style ${getString(JSON.stringify(edge.style))}`);
    }
    if (
      edge.x !== undefined ||
      edge.y !== undefined ||
      edge.width !== undefined ||
      edge.height !== undefined || getFormatMetadata(edge.data,'gml')?.graphics?.length
    ) {
      lines.push('    graphics [');
      getNativeLines(lines,getFormatMetadata(edge.data,'gml')?.graphics ?? [],'      ', options.standard);
      if (edge.x !== undefined) lines.push(`      x ${edge.x}`);
      if (edge.y !== undefined) lines.push(`      y ${edge.y}`);
      if (edge.width !== undefined) lines.push(`      w ${edge.width}`);
      if (edge.height !== undefined) lines.push(`      h ${edge.height}`);
      lines.push('    ]');
    }
    lines.push('  ]');
  }

  lines.push(']');
  return lines.join('\n');
}

function getGMLString(value: string): string {
  return `"${[...value].map((ch) => ch === '&' ? '&amp;' : ch === '"' ? '&quot;' : ch === '\\' || ch.codePointAt(0)! < 32 || ch.codePointAt(0)! >= 127 ? `&#${ch.codePointAt(0)};` : ch).join('')}"`;
}

function getValidatedGMLString(value: string): string {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) throw new Error('GML standard profile: native strings must contain Unicode scalar values, not lone surrogates');
  }
  return getGMLString(value);
}

function getDecodedString(value: string): string {
  const names: Record<string,string> = {"AElig": "Æ", "Aacute": "Á", "Acirc": "Â", "Agrave": "À", "Aring": "Å", "Atilde": "Ã", "Auml": "Ä", "Ccedil": "Ç", "ETH": "Ð", "Eacute": "É", "Ecirc": "Ê", "Egrave": "È", "Euml": "Ë", "Iacute": "Í", "Icirc": "Î", "Igrave": "Ì", "Iuml": "Ï", "Ntilde": "Ñ", "Oacute": "Ó", "Ocirc": "Ô", "Ograve": "Ò", "Oslash": "Ø", "Otilde": "Õ", "Ouml": "Ö", "THORN": "Þ", "Uacute": "Ú", "Ucirc": "Û", "Ugrave": "Ù", "Uuml": "Ü", "Yacute": "Ý", "aacute": "á", "acirc": "â", "acute": "´", "aelig": "æ", "agrave": "à", "amp": "&", "aring": "å", "atilde": "ã", "auml": "ä", "brvbar": "¦", "ccedil": "ç", "cedil": "¸", "cent": "¢", "copy": "©", "curren": "¤", "deg": "°", "divide": "÷", "eacute": "é", "ecirc": "ê", "egrave": "è", "eth": "ð", "euml": "ë", "frac12": "½", "frac14": "¼", "frac34": "¾", "gt": ">", "iacute": "í", "icirc": "î", "iexcl": "¡", "igrave": "ì", "iquest": "¿", "iuml": "ï", "laquo": "«", "lt": "<", "macr": "¯", "micro": "µ", "middot": "·", "nbsp": " ", "not": "¬", "ntilde": "ñ", "oacute": "ó", "ocirc": "ô", "ograve": "ò", "ordf": "ª", "ordm": "º", "oslash": "ø", "otilde": "õ", "ouml": "ö", "para": "¶", "plusmn": "±", "pound": "£", "quot": "\"", "raquo": "»", "reg": "®", "sect": "§", "shy": "­", "sup1": "¹", "sup2": "²", "sup3": "³", "szlig": "ß", "thorn": "þ", "times": "×", "uacute": "ú", "ucirc": "û", "ugrave": "ù", "uml": "¨", "uuml": "ü", "yacute": "ý", "yen": "¥", "yuml": "ÿ", "apos": "'"};
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g,(full,name: string) => {
    if (name[0] !== '#') return names[name] ?? full;
    const code = name[1] === 'x' ? Number.parseInt(name.slice(2),16) : Number(name.slice(1));
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) throw new Error('GML: invalid character entity');
    return String.fromCodePoint(code);
  });
}

function getPrivateData(value: unknown): any {
  const parsed = Array.isArray(value) ? value.map(getParsedJSON).find((entry) => entry?.format === 'stately' && entry.version === 1) : getParsedJSON(value);
  return parsed?.format === 'stately' && parsed.version === 1 ? parsed : undefined;
}

function getNativeEntries(block: any, known: Set<string>): Array<[string,any]> {
  const entries: Array<[string,any]> = [];
  const pending = [{ source:blockEntries.get(block) ?? [], output:entries, filter:known }];
  while (pending.length) {
    const current = pending.pop()!;
    for (const [key,value] of current.source) {
      if (current.filter.has(key) && !(key === 'stately' && !getPrivateData(value))) continue;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const list: Array<[string,any]> = [];
        current.output.push([key,{list}]);
        pending.push({source:blockEntries.get(value) ?? [],output:list,filter:new Set()});
      } else current.output.push([key,value]);
    }
  }
  return entries;
}

function getNativeLines(lines: string[], entries: Array<[string,any]>, indent: string, standard = false): void {
  const tasks: Array<{ entry?: [string,any]; indent:string; close?: boolean }> = [...entries].reverse().map((entry) => ({entry,indent}));
  while (tasks.length) {
    const task = tasks.pop()!;
    if (task.close) { lines.push(`${task.indent}]`); continue; }
    const [key,value] = task.entry!;
    if (value && typeof value === 'object' && Array.isArray(value.list)) {
      lines.push(`${task.indent}${key} [`);
      tasks.push({indent:task.indent,close:true});
      for (const entry of [...value.list].reverse()) tasks.push({entry,indent:task.indent+'  '});
    } else lines.push(`${task.indent}${key} ${typeof value === 'number' ? value : (standard ? getValidatedGMLString : getGMLString)(String(value))}`);
  }
}

// --- GML parser ---

/**
 * Parses a GML (Graph Modelling Language) string into a graph.
 *
 * @example
 * ```ts
 * import { fromGML } from '@statelyai/graph/gml';
 *
 * const graph = fromGML(`
 *   graph [
 *     directed 1
 *     node [ id "a" ]
 *     node [ id "b" ]
 *     edge [ source "a" target "b" ]
 *   ]
 * `);
 * ```
 */
export function fromGML(gml: string, options: GMLImportOptions = {}): Graph {
  if (typeof gml !== 'string') {
    throw new Error('GML: expected a string');
  }
  if (!gml.trim()) {
    throw new Error('GML: input is empty');
  }
  const tokens = getTokens(gml, !options.standard);
  if (tokens.length === 0) {
    throw new Error('GML: no tokens found');
  }
  const obj = getParsedBlock(tokens, 0);
  const graphBlock = obj.value['graph'];
  if (!graphBlock) throw new Error('GML: missing top-level "graph" block');

  const directed = graphBlock['directed'] === 1;
  const graphId = getPrivateData(graphBlock['stately'])?.originalId ?? String(graphBlock['id'] ?? '');
  const nativeNodeIds = new Map<string,string>();
  const nodeOrder = new Map<string,number>();

  const nodes: Graph['nodes'] = [];
  const edges: Graph['edges'] = [];

  // Parse nodes (with recursive hierarchy)
  function addNodes(block: any, parentId: string | null) {
    const nodeEntries = getArray(block['node']);
    for (const n of nodeEntries) {
      const nativeId = String(n['id'] ?? '');
      const privateData = getPrivateData(n['stately']);
      const id = privateData?.originalId ?? nativeId;
      nativeNodeIds.set(nativeId,id);
      if (privateData?.index !== undefined) nodeOrder.set(id,privateData.index);
      const gfx = n['graphics'];
      nodes.push({
        type: 'node',
        id,
        parentId: privateData?.parentId ?? parentId,
        initialNodeId: n['initialNodeId'] ?? null,
        label: (n['label'] === undefined && privateData?.nullLabel) ? null : n['label'] ?? '',
        data: createFormatData(n['data'] !== undefined ? getParsedJSON(n['data']) : undefined,'gml',getNativeMetadata(n,'node')),
        ...(n['ports'] !== undefined && { ports: getParsedJSON(n['ports']) }),
        ...(n['shape'] !== undefined && { shape: n['shape'] }),
        ...(n['color'] !== undefined && { color: n['color'] }),
        ...(n['style'] !== undefined && { style: getParsedJSON(n['style']) }),
        ...(gfx?.x !== undefined && {
          x: getNumber(gfx.x, 'graphics x', 'node', id),
        }),
        ...(gfx?.y !== undefined && {
          y: getNumber(gfx.y, 'graphics y', 'node', id),
        }),
        ...(gfx?.w !== undefined && {
          width: getNumber(gfx.w, 'graphics w', 'node', id),
        }),
        ...(gfx?.h !== undefined && {
          height: getNumber(gfx.h, 'graphics h', 'node', id),
        }),
      });
      // Recurse into nested child nodes
      if (n['node'] !== undefined) {
        addNodes(n, id);
      }
    }
  }
  addNodes(graphBlock, null);

  if (nodeOrder.size === nodes.length) nodes.sort((left,right) => nodeOrder.get(left.id)! - nodeOrder.get(right.id)!);
  const edgeEntries = getArray(graphBlock['edge']);
  for (const e of edgeEntries) {
    const gfx = e['graphics'];
    const privateData = getPrivateData(e['stately']);
    const id = privateData?.originalId ?? String(e['id'] ?? `e${edges.length}`);
    edges.push({
      type: 'edge',
      id,
      sourceId: nativeNodeIds.get(String(e['source'] ?? '')) ?? String(e['source'] ?? ''),
      targetId: nativeNodeIds.get(String(e['target'] ?? '')) ?? String(e['target'] ?? ''),
      label: (e['label'] === undefined && privateData?.nullLabel) ? null : e['label'] ?? '',
      ...(e['mode'] && { mode: String(e['mode']) as Graph['mode'] }),
      data: createFormatData(e['data'] !== undefined ? getParsedJSON(e['data']) : undefined,'gml',getNativeMetadata(e,'edge')),
      ...(e['weight'] !== undefined && {
        weight: getNumber(e['weight'], 'weight', 'edge', id),
      }),
      ...(e['points'] !== undefined && { points: getParsedJSON(e['points']) }),
      ...(e['routing'] !== undefined && {
        routing: String(e['routing']) as Graph['edges'][number]['routing'],
      }),
      ...(e['sourcePort'] !== undefined && {
        sourcePort: String(e['sourcePort']),
      }),
      ...(e['targetPort'] !== undefined && {
        targetPort: String(e['targetPort']),
      }),
      ...(e['color'] !== undefined && { color: e['color'] }),
      ...(e['style'] !== undefined && { style: getParsedJSON(e['style']) }),
      ...(gfx?.x !== undefined && {
        x: getNumber(gfx.x, 'graphics x', 'edge', id),
      }),
      ...(gfx?.y !== undefined && {
        y: getNumber(gfx.y, 'graphics y', 'edge', id),
      }),
      ...(gfx?.w !== undefined && {
        width: getNumber(gfx.w, 'graphics w', 'edge', id),
      }),
      ...(gfx?.h !== undefined && {
        height: getNumber(gfx.h, 'graphics h', 'edge', id),
      }),
    });
  }

  return {
    id: graphId,
    mode: graphBlock['mode']
      ? (String(graphBlock['mode']) as Graph['mode'])
      : directed
        ? 'directed'
        : 'undirected',
    initialNodeId: graphBlock['initialNodeId'] ?? null,
    nodes,
    edges,
    data: createFormatData(graphBlock['data'] !== undefined ? getParsedJSON(graphBlock['data']) : undefined,'gml', { ...(getNativeEntries(graphBlock,new Set(['id','directed','mode','initialNodeId','data','direction','style','node','edge','stately'])).length && {entries:getNativeEntries(graphBlock,new Set(['id','directed','mode','initialNodeId','data','direction','style','node','edge','stately']))}), ...(getNativeEntries(obj.value,new Set(['graph'])).length && {topLevel:getNativeEntries(obj.value,new Set(['graph']))}) }),
    ...(graphBlock['direction'] && {
      direction: String(graphBlock['direction']) as Graph['direction'],
    }),
    ...(graphBlock['style'] !== undefined && {
      style: getParsedJSON(graphBlock['style']),
    }),
  };
}

// --- Tokenizer ---

interface Token {
  type: 'word' | 'string' | 'number' | 'open' | 'close';
  value: any;
}

function getTokens(input: string, legacyEscapes: boolean): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Comments (# to end of line)
    if (ch === '#') {
      while (i < input.length && input[i] !== '\n') i++;
      continue;
    }
    // Brackets
    if (ch === '[') {
      tokens.push({ type: 'open', value: '[' });
      i++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ type: 'close', value: ']' });
      i++;
      continue;
    }
    // Quoted string
    if (ch === '"') {
      i++;
      let s = '';
      while (i < input.length && input[i] !== '"') {
        if (legacyEscapes && input[i] === '\\' && i + 1 < input.length && ['\\','"'].includes(input[i + 1])) {
          i++;
          s += input[i];
        } else {
          s += input[i];
        }
        i++;
      }
      if (i >= input.length) throw new Error('GML: unterminated string');
      i++; // skip closing quote
      tokens.push({ type: 'string', value: getDecodedString(s) });
      continue;
    }
    // Number or word
    if (/[-+0-9.]/.test(ch)) {
      let num = '';
      while (i < input.length && /[-+0-9.eE]/.test(input[i])) {
        num += input[i];
        i++;
      }
      const parsed = Number(num);
      if (!isNaN(parsed)) {
        tokens.push({ type: 'number', value: parsed });
      } else {
        tokens.push({ type: 'word', value: num });
      }
      continue;
    }
    // Word/keyword
    if (/[a-zA-Z_]/.test(ch)) {
      let word = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        word += input[i];
        i++;
      }
      tokens.push({ type: 'word', value: word });
      continue;
    }
    throw new Error(`GML: unexpected character ${ch} at ${i}`);
  }
  return tokens;
}

// --- Parser ---

function getParsedBlock(tokens: Token[], start: number): { value: Record<string, any>; pos: number } {
  const root: Record<string,any> = Object.create(null);
  blockEntries.set(root,[]);
  const frames = [root];
  let pos = start;
  while (pos < tokens.length) {
    const token = tokens[pos++];
    if (token.type === 'close') {
      if (frames.length === 1) throw new Error('GML: unexpected closing bracket');
      frames.pop();
      continue;
    }
    if (token.type !== 'word') throw new Error('GML: expected attribute key');
    const next = tokens[pos++];
    if (!next || next.type === 'close') throw new Error(`GML: missing value for ${token.value}`);
    const current = frames[frames.length - 1];
    const value: any = next.type === 'open' ? Object.create(null) : next.value;
    blockEntries.get(current)!.push([token.value,value]);
    if (current[token.value] !== undefined) {
      if (!Array.isArray(current[token.value])) current[token.value] = [current[token.value]];
      current[token.value].push(value);
    } else current[token.value] = value;
    if (next.type === 'open') { blockEntries.set(value,[]); frames.push(value); }
  }
  if (frames.length !== 1) throw new Error('GML: unclosed block');
  return {value:root,pos};
}

function getArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

function getParsedJSON(str: any): any {
  if (typeof str !== 'string') return str;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function getNumber(
  value: any,
  field: string,
  kind: 'node' | 'edge',
  ownerId: string,
): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `GML: ${field} value "${value}" on ${kind} "${ownerId}" is not a number. Fix the value or remove the attribute.`,
    );
  }
  return parsed;
}

/**
 * Bidirectional converter for GML (Graph Modelling Language) format.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { gmlConverter } from '@statelyai/graph/gml';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const gml = gmlConverter.to(graph);
 * const roundTripped = gmlConverter.from(gml);
 * ```
 */
export const gmlConverter: GraphFormatConverter<string> =
  createFormatConverter(toGML, fromGML);

function getNativeMetadata(block: any, kind: 'node' | 'edge'): Record<string,any> {
  const known = kind === 'node' ? ['id','label','initialNodeId','data','ports','shape','color','style','graphics','node','stately']
    : ['id','source','target','label','mode','data','weight','points','routing','sourcePort','targetPort','color','style','graphics','stately'];
  const entries = getNativeEntries(block,new Set(known));
  const graphics = getNativeEntries(block.graphics,new Set(['x','y','w','h']));
  return {...(entries.length && {entries}),...(graphics.length && {graphics}),
    ...(block.label === undefined && !getPrivateData(block.stately)?.nullLabel && { implicitLabel: true })};
}

/** Native missing labels have no literal value; provenance is reconstructed from this source. */
function getGMLDocumentGraph(source: string): Graph {
  const graph = fromGML(source);
  for (const entity of [...graph.nodes, ...graph.edges]) {
    const metadata = getFormatMetadata(entity.data, 'gml');
    if (!metadata?.implicitLabel) continue;
    const { format: _format, version: _version, wrapped: _wrapped, userData: _userData, absent: _absent, implicitLabel: _implicit, ...native } = metadata;
    entity.data = createFormatData(getUserData(entity.data, 'gml'), 'gml', native);
    entity.label = null;
  }
  return graph;
}

/** Exact GML source with a partial Graph projection and quoted-label patches. */
export const gmlDocumentConverter = createGraphDocumentConverter({
  format: 'gml', codec: { from: fromGML, to: toGML },
  project: (source) => getGMLDocumentProjection(source, getGMLDocumentGraph, getDecodedString),
  patch: (context) => getGMLDocumentPatch(context, getDecodedString, getValidatedGMLString),
});
