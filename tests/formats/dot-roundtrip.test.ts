import { describe, it, expect } from 'vitest';
import { toDOT, fromDOT } from '../../src/formats/dot';

/**
 * Round-trip fidelity for DOT constructs the library does not model natively.
 * These are preserved under a namespaced `dot` key inside the entity's `data`
 * (graph, node, and edge). The invariant checked here is stability:
 * `fromDOT(toDOT(fromDOT(x)))` re-emits the same DOT and the key constructs
 * survive.
 */

/** Assert the emitted DOT is stable under a further round trip. */
function expectStable(src: string): string {
  const first = toDOT(fromDOT(src));
  const second = toDOT(fromDOT(first));
  expect(second).toBe(first);
  return first;
}

describe('DOT round-trip: graph attributes', () => {
  it('preserves graph-level attributes (bgcolor, fontname, …)', () => {
    const g = fromDOT(`digraph G {
      bgcolor="lightgray";
      fontname="Arial";
      a -> b;
    }`);
    expect((g.data as any).dot.attrs).toEqual({
      bgcolor: 'lightgray',
      fontname: 'Arial',
    });

    const out = expectStable(`digraph G {
      bgcolor="lightgray";
      fontname="Arial";
      a -> b;
    }`);
    expect(out).toContain('bgcolor="lightgray"');
    expect(out).toContain('fontname="Arial"');
  });

  it('does not fold rankdir into the preserved attribute bag', () => {
    const g = fromDOT(`digraph G { rankdir=LR; bgcolor="white"; a; }`);
    expect(g.direction).toBe('right');
    expect((g.data as any).dot.attrs).toEqual({ bgcolor: 'white' });
    // rankdir round-trips via direction, not the attr bag.
    const out = toDOT(g);
    expect(out).toContain('rankdir=LR');
    expect(out.match(/rankdir/g)).toHaveLength(1);
  });

  it('preserves node/edge default attribute bags', () => {
    const src = `digraph G {
      node [shape=box, fontsize="12"];
      edge [arrowhead="vee"];
      a -> b;
    }`;
    const g = fromDOT(src);
    expect((g.data as any).dot.nodeDefaults).toEqual({
      shape: 'box',
      fontsize: '12',
    });
    expect((g.data as any).dot.edgeDefaults).toEqual({ arrowhead: 'vee' });

    const out = expectStable(src);
    expect(out).toContain('node [shape="box", fontsize="12"]');
    expect(out).toContain('edge [arrowhead="vee"]');
  });
});

describe('DOT round-trip: rank groups', () => {
  it('preserves rank=same groups without creating a spurious node', () => {
    const src = `digraph G {
      a; b; c;
      { rank=same; a; b; }
    }`;
    const g = fromDOT(src);
    // No compound node materialized for the anonymous rank subgraph.
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    expect((g.data as any).dot.ranks).toEqual([
      { rank: 'same', nodes: ['a', 'b'] },
    ]);

    const out = expectStable(src);
    expect(out).toContain('{ rank=same;');
    expect(out).toContain('a;');
    expect(out).toContain('b;');
  });

  it('preserves other rank values (min/max)', () => {
    const src = `digraph G { start; end; { rank=min; start; } { rank=max; end; } }`;
    const g = fromDOT(src);
    expect((g.data as any).dot.ranks).toEqual([
      { rank: 'min', nodes: ['start'] },
      { rank: 'max', nodes: ['end'] },
    ]);
    const out = expectStable(src);
    expect(out).toContain('rank=min');
    expect(out).toContain('rank=max');
  });
});

describe('DOT round-trip: compass points', () => {
  it('preserves compass points in port syntax (node:port:compass)', () => {
    const src = `digraph G { a:p1:n -> b:p2:se; }`;
    const g = fromDOT(src);
    const e = g.edges[0];
    expect(e.sourcePort).toBe('p1');
    expect(e.targetPort).toBe('p2');
    expect((e.data as any).dot.sourceCompass).toBe('n');
    expect((e.data as any).dot.targetCompass).toBe('se');

    const out = expectStable(src);
    expect(out).toContain('a:p1:n -> b:p2:se');
  });
});

describe('DOT round-trip: HTML-like labels', () => {
  it('preserves HTML node labels verbatim with <> delimiters', () => {
    const src = `digraph G { a [label=<<b>Bold</b>>]; }`;
    const g = fromDOT(src);
    expect(g.nodes[0].label).toBe('<b>Bold</b>');
    expect((g.nodes[0].data as any).dot.labelHtml).toBe(true);

    const out = expectStable(src);
    expect(out).toContain('label=<<b>Bold</b>>');
    // Not emitted as a quoted string.
    expect(out).not.toContain('label="<b>');
  });

  it('preserves HTML edge labels verbatim', () => {
    const src = `digraph G { a -> b [label=<<i>x</i>>]; }`;
    const g = fromDOT(src);
    expect(g.edges[0].label).toBe('<i>x</i>');
    expect((g.edges[0].data as any).dot.labelHtml).toBe(true);

    const out = expectStable(src);
    expect(out).toContain('label=<<i>x</i>>');
  });

  it('keeps plain string labels quoted (not HTML)', () => {
    const src = `digraph G { a [label="plain"]; }`;
    const g = fromDOT(src);
    expect((g.nodes[0].data as any)?.dot?.labelHtml).toBeUndefined();
    const out = expectStable(src);
    expect(out).toContain('label="plain"');
  });
});

describe('DOT round-trip: leftover entity attributes', () => {
  it('preserves unmodeled node and edge attributes', () => {
    const src = `digraph G {
      a [label="A", fontcolor="red", tooltip="hi"];
      a -> b [penwidth="2", style="dashed"];
    }`;
    const g = fromDOT(src);
    const a = g.nodes.find((n) => n.id === 'a')!;
    expect((a.data as any).dot.attrs).toEqual({
      fontcolor: 'red',
      tooltip: 'hi',
    });
    expect((g.edges[0].data as any).dot.attrs).toEqual({
      penwidth: '2',
      style: 'dashed',
    });

    const out = expectStable(src);
    expect(out).toContain('fontcolor="red"');
    expect(out).toContain('tooltip="hi"');
    expect(out).toContain('penwidth="2"');
    expect(out).toContain('style="dashed"');
  });
});

describe('DOT round-trip: realistic multi-feature fixture', () => {
  const fixture = `digraph pipeline {
  rankdir=LR;
  bgcolor="#fafafa";
  fontname="Helvetica";
  node [shape=box, style="rounded,filled", fontsize="11"];
  edge [color="#888888", arrowhead="vee"];

  extract [label="Extract", fillcolor="#2196f3", tooltip="pull raw"];
  transform [label="Transform", shape=diamond];
  load [label="Load", fillcolor="#4caf50"];
  report [label=<<b>Report</b>>];

  extract:out:e -> transform:in:w [label="raw", penwidth="2"];
  transform -> load [label="clean"];
  load -> report [label=<<i>done</i>>];

  { rank=same; extract; transform; }
}`;

  it('survives a full round trip and is stable', () => {
    const out = expectStable(fixture);

    // Graph-level
    expect(out).toContain('rankdir=LR');
    expect(out).toContain('bgcolor="#fafafa"');
    expect(out).toContain('fontname="Helvetica"');
    expect(out).toContain('node [shape="box"');
    expect(out).toContain('edge [color="#888888"');

    // Nodes: modeled + preserved
    expect(out).toContain('label="Extract"');
    expect(out).toContain('tooltip="pull raw"');
    expect(out).toContain('label=<<b>Report</b>>');

    // Edges: compass points, labels, leftover attrs, HTML edge label
    expect(out).toContain('extract:out:e -> transform:in:w');
    expect(out).toContain('penwidth="2"');
    expect(out).toContain('label=<<i>done</i>>');

    // Rank group
    expect(out).toContain('rank=same');
  });

  it('preserves key constructs on the parsed graph', () => {
    const g = fromDOT(fixture);
    expect(g.direction).toBe('right');

    const extract = g.nodes.find((n) => n.id === 'extract')!;
    expect(extract.label).toBe('Extract');
    expect(extract.color).toBe('#2196f3');
    expect((extract.data as any).dot.attrs).toEqual({ tooltip: 'pull raw' });

    const report = g.nodes.find((n) => n.id === 'report')!;
    expect(report.label).toBe('<b>Report</b>');
    expect((report.data as any).dot.labelHtml).toBe(true);

    const e0 = g.edges.find(
      (e) => e.sourceId === 'extract' && e.targetId === 'transform',
    )!;
    expect(e0.sourcePort).toBe('out');
    expect(e0.targetPort).toBe('in');
    expect((e0.data as any).dot.sourceCompass).toBe('e');
    expect((e0.data as any).dot.targetCompass).toBe('w');

    expect((g.data as any).dot.ranks).toEqual([
      { rank: 'same', nodes: ['extract', 'transform'] },
    ]);
  });
});
