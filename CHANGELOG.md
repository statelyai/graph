# @statelyai/graph

## 0.2.0

### Minor Changes

- [`4f02507`](https://github.com/statelyai/graph/commit/4f025074bc4318f8c265388e8529eb0677e1eb8c) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Remove `toGraphML`, `fromGraphML`, `GraphSchema`, `NodeSchema`, and `EdgeSchema` from the main barrel export to avoid pulling in optional peer deps (`fast-xml-parser`, `zod`) during SSR.

  Use subpath imports instead:

  - `@statelyai/graph/formats/graphml`
  - `@statelyai/graph/schemas`
