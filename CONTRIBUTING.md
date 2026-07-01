# Contributing

Thanks for contributing to `@statelyai/graph`.

## Local Setup

```bash
pnpm install
pnpm verify
```

`pnpm verify` runs the same core checks we rely on before release:

<!-- verification command list derived from package.json#scripts.verify -->

- `pnpm typecheck`
- `pnpm typecheck:repo`
- `pnpm check:generated`
- `pnpm check:conventions`
- `pnpm test -- --run`
- `pnpm build`
- `pnpm validate:package`

## Project Layout

- `src/graph.ts` - graph factories, lookups, and mutations
- `src/queries.ts` - neighborhood, hierarchy, degree, and port queries
- `src/algorithms.ts` - traversal, paths, components, cycles, ordering, MST
- `src/transforms.ts` - flattening and graph transforms
- `src/formats/` - per-format converters and serializers
- `src/indexing.ts` - WeakMap-backed indexing
- `src/types.ts` - public type definitions
- `tests/` - Vitest coverage for library behavior and integrations
- `examples/` - runnable usage examples for common graph workflows

## Design Rules

This package is intentionally plain:

- Graphs are JSON-serializable objects
- No classes on graph/node/edge/port data structures
- `graph` is always the first parameter, except for `create*` factories
- Collection queries return `[]` when empty
- Mutations happen in place and should be documented with `/** **Mutable.** */`

### Function Naming

All functions use a prefix:

- `get*` - lookup/query returning a value, array, or `undefined`
- `gen*` - generator-based query
- `is*` / `has*` - boolean checks
- `create*` - factories
- `to*` / `from*` - format conversion
- `add*` / `delete*` / `update*` - in-place mutation

Avoid introducing unprefixed helpers to the public API.

### Types

Follow the established type naming:

- `Graph*` for resolved primary types
- `*Config` for lenient input types
- `*Options` for algorithm/configuration parameters
- `Visual*` for required position/size shapes
- `*Update` for batch mutation payloads

Generic order is `<TNodeData, TEdgeData, TGraphData, TPortData>`, shortened to `<N, E, G, P>` in function signatures.

## Tests

Tests use Vitest. Keep new tests close to the behavior they exercise:

- graph/mutation/query work -> `tests/*.test.ts`
- format converters -> `tests/formats/*.test.ts`
- Mermaid variants -> `tests/formats/mermaid/*.test.ts`

When changing runtime behavior, add or update tests before finalizing the implementation.

## Format Modules

Format adapters are published as subpath imports such as `@statelyai/graph/graphml` and `@statelyai/graph/mermaid`.

If you add a new format:

1. Add the source under `src/formats/<name>/`
2. Add tests under `tests/formats/`
3. Add the entry to `tsdown.config.ts`
4. Add the subpath to `package.json#exports`
5. Document it in the root README and the format README

## Release Notes

This repo uses Changesets. For user-visible changes:

```bash
pnpm changeset
```

Keep change summaries focused on public API, behavior, and migration impact.
