import { describe, expect, it } from 'vitest';
import { d2DocumentConverter } from '../../src/formats/d2';
import { mermaidFlowchartDocumentConverter, mermaidSequenceDocumentConverter, mermaidStateDocumentConverter, mermaidClassDocumentConverter, mermaidERDocumentConverter, mermaidBlockDocumentConverter, mermaidMindmapDocumentConverter, mermaidIshikawaDocumentConverter } from '../../src/formats/mermaid';
import type { GraphDocumentConverter } from '../../src/formats/document';

const cases: Array<[GraphDocumentConverter<string>, string]> = [
  [d2DocumentConverter, '# original\r\na: "Before"\r\na -> b\r\n'],
  [mermaidFlowchartDocumentConverter, '---\ntitle: Original\n---\n%% comment\nflowchart TD\nA[Before]\nA --> B\n'],
  [mermaidSequenceDocumentConverter, '%%{init: {"theme":"dark"}}%%\nsequenceDiagram\nparticipant A as Before\nA->>B: Message\n%% comment\n'],
  [mermaidStateDocumentConverter, 'stateDiagram-v2\nstate "Before" as A\n%% comment\nA --> B\n'],
  [mermaidClassDocumentConverter, 'classDiagram\n%% comment\nclass A\nA --> B\n'],
  [mermaidERDocumentConverter, 'erDiagram\n%% comment\nA\n'],
  [mermaidBlockDocumentConverter, 'block-beta\n%% comment\nA["Before"]\n'],
  [mermaidMindmapDocumentConverter, 'mindmap\n%% comment\n  root((Before))\n    After\n'],
  [mermaidIshikawaDocumentConverter, 'ishikawa-beta\n%% comment\n  Cause\n    Effect\n'],
];

describe('diagram native documents', () => {
  it.each(cases.map(([converter, source]) => [converter.format, converter, source] as const))('%s preserves every no-op byte through JSON persistence and refuses unsupported edits', (_format, converter, source) => {
    const document = converter.from(source);
    expect(document.graph).not.toBeNull();
    expect(converter.to(JSON.parse(JSON.stringify(document)))).toBe(source);
    document.graph!.nodes.push({ type: 'node', id: 'new-node', data: {} });
    expect(() => converter.to(document)).toThrow('unsupported-edit');
  });

  it.each([
    [d2DocumentConverter, '# untouched\r\na: "Before" # trailing\r\na -> b\r\n', '# untouched\r\na: "After" # trailing\r\na -> b\r\n'],
    [mermaidFlowchartDocumentConverter, 'flowchart TD\r\n  A["Before"] %% trailing\r\n  A --> B\r\n', 'flowchart TD\r\n  A["After"] %% trailing\r\n  A --> B\r\n'],
    [mermaidStateDocumentConverter, 'stateDiagram-v2\n  state "Before" as A %% trailing\n  A --> B\n', 'stateDiagram-v2\n  state "After" as A %% trailing\n  A --> B\n'],
    [mermaidSequenceDocumentConverter, 'sequenceDiagram\n  participant A as Before %% trailing\n  A->>B: Message\n', 'sequenceDiagram\n  participant A as After %% trailing\n  A->>B: Message\n'],
  ] as Array<[GraphDocumentConverter<string>, string, string]>)('%s patches a verified label span preserving comments and whitespace', (converter, source, expected) => {
    const document = converter.from(source);
    document.graph!.nodes[0].label = 'After';
    expect(converter.to(JSON.parse(JSON.stringify(document)))).toBe(expected);
    expect(converter.from(expected).graph!.nodes[0].label).toBe('After');
  });

  it('patches a sequence message while retaining note placement and inline comments', () => {
    const source = 'sequenceDiagram\nA->>B: Before %% trailing\nnote over A,B: Keep note\nB-->>A: Response\n';
    const document = mermaidSequenceDocumentConverter.from(source);
    document.graph!.edges[0].label = 'After';
    const result = mermaidSequenceDocumentConverter.to(document);
    expect(result).toBe(source.replace('Before', 'After'));
    expect(mermaidSequenceDocumentConverter.from(result).graph!.data.events).toEqual(document.graph!.data.events);
  });

  it('merges a native comment edit with an independent Graph label edit', () => {
    const document = mermaidFlowchartDocumentConverter.from('%% Original\nflowchart TD\nA[Before]\n');
    document.source = document.source.replace('Original', 'Native edit');
    document.graph!.nodes[0].label = 'After';
    expect(mermaidFlowchartDocumentConverter.to(document)).toBe('%% Native edit\nflowchart TD\nA["After"]\n');
  });

  it('rejects duplicate declaration spans and unsupported expanded syntax safely', () => {
    for (const source of ['flowchart TD\nA[Before]\nA[Before]\n', 'flowchart TD\nA@{ label: "Before", shape: rect }\n']) {
      const document = mermaidFlowchartDocumentConverter.from(source);
      document.graph!.nodes[0].label = 'After';
      expect(() => mermaidFlowchartDocumentConverter.to(document)).toThrow('unsupported-edit');
    }
  });

  it('round-trips escaped label edits symmetrically and retains adjacent comments', () => {
    const document = mermaidFlowchartDocumentConverter.from('flowchart TD\nA[Before] %% keep\n');
    document.graph!.nodes[0].label = 'quoted "value" # | \\ newline\n';
    const source = mermaidFlowchartDocumentConverter.to(document);
    expect(source).toContain('%% keep');
    expect(mermaidFlowchartDocumentConverter.from(source).graph!.nodes[0].label).toBe(document.graph!.nodes[0].label);
  });
});
