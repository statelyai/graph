# Plan: Add `fromDOT` parser using `dotparser`

## Overview

Add `fromDOT(dot: string): Graph` and a `dotConverter` to `src/formats/dot.ts`, using `dotparser` (PEG.js-based, zero runtime deps) as an optional peer dependency.

## Changes

### 1. Install & configure `dotparser`

- Add `dotparser` as optional peer dep in `package.json` (same pattern as `fast-xml-parser`)
- Add to `devDependencies` for tests
- Since `dotparser` is CJS with no types, add a local type declaration

### 2. Update `src/formats/dot.ts`

- `import parse from 'dotparser'` (dynamic or top-level)
- Add inverse maps: `RANKDIR_TO_DIRECTION`, `DOT_TO_SHAPE`
- Walk the AST to build a `Graph`:
  - Root `type: 'graph'` → undirected, `type: 'digraph'` → directed
  - `node_stmt` → `GraphNode` with attrs (label, shape, color/fillcolor, pos, width, height)
  - `edge_stmt` with `edge_list` → one edge per consecutive pair (chains: a→b→c = 2 edges)
  - `subgraph` with `id` starting with `cluster` → compound node with `parentId`
  - `attr_stmt` with `target: 'graph'` → `rankdir` → `direction`
  - `attr_stmt` with `target: 'node'`/`'edge'` → default attrs applied to subsequent nodes/edges
  - Auto-create nodes referenced in edges but not explicitly declared
- Add `dotConverter = createFormatConverter(toDOT, fromDOT)`

### 3. Add tests in `tests/formats/dot.test.ts`

Expand existing test file with `fromDOT` tests:
- Empty graph
- Directed/undirected
- Node attrs (label, shape, color)
- Edge chains (a → b → c)
- Edge attrs (label, color)
- Subgraphs → parentId
- `rankdir` → direction
- Node/edge default attrs
- Round-trip: `fromDOT(toDOT(graph))` ≈ graph
- Invalid input errors

### 4. Update README

Update `src/formats/dot.README.md`: add `fromDOT` docs, remove the "suggestion" note, add peer dep note.

## What won't be mapped (TODO comments in code)

- HTML labels (`<...>`) — stored as raw string in label
- Port syntax (`:port:compass`) — ignored
- String concatenation with `+` — handled by dotparser already
- `rank=same` and layout hints — ignored
- `style` attribute (beyond `filled`) — ignored
