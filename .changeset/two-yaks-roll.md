---
"@statelyai/graph": minor
---

Remove `toGraphML`, `fromGraphML`, `GraphSchema`, `NodeSchema`, and `EdgeSchema` from the main barrel export to avoid pulling in optional peer deps (`fast-xml-parser`, `zod`) during SSR.

Use subpath imports instead:
- `@statelyai/graph/formats/graphml`
- `@statelyai/graph/schemas`
