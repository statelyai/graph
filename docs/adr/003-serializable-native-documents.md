# Serializable native documents

Status: accepted, additive API.

Graph models editable graph semantics. It cannot represent every comment, XML extension, unsupported hyperedge, multiple native graph, or syntax spelling. Existing format converters continue returning Graph and keep their existing defaults.

`@statelyai/graph/document` adds a plain `GraphDocument<TSource, TGraph>` envelope. It stores native source, a possibly partial Graph projection, independent native/Graph baselines, diagnostic records and optional serializable adapter state. Explicit factory registrations avoid importing optional peers through the core module. VisualGraph codecs retain their stronger projected type.

Source belongs to the JSON value/string domain. Validation rejects nonfinite numbers, undefined source values, functions, symbols, BigInt, class instances, accessors, sparse arrays and cycles before cloning. Object alias identity and prototypes are outside this contract. Optional undefined Graph object fields compare using their JSON view. No-op output exactly preserves source strings or native JSON values, including unknown fields, key order and value presence, after JSON persistence. This guarantees source retention, not complete native semantic interpretation.

Native source edits are authoritative when Graph remains unchanged. Graph edits compare against the baseline projection, then merge with a fresh native projection by stable entity ID. Different mapped fields merge; conflicting changes to the same field return diagnostics. Object-valued Graph fields currently conflict conservatively as whole fields. Entity order changes count as structural changes. Unsupported edits never replay stale source.

`.to(document)` remains strict. A verified format-specific patch must reproduce the merged requested projection when reparsed. Without a patch, structural support, a unique lexical span, or a successful proof, export throws an ordinary Error carrying diagnostics. Explicit `getGraphDocumentUpdate(document, converter, { mode: 'regenerate' })` may regenerate source and always returns a loss warning covering source and Graph details. Regenerated source is reparsed; differing Graph field paths or an unavailable projection receive additional warning diagnostics. Projection failures retain source with `graph: null`; strict import throws.

Comparison hooks may normalize only verified adapter provenance. Editable user data and foreign reserved-key payloads remain observable. A comparator that removes private state needs a separate `getComparisonState` extractor to permit edits in normalization-altered fields; otherwise those field edits are conservatively rejected. Stored adapter state and baseline projection provenance must match the baseline native source. Import hooks may expose one editable label where a native format duplicates it in configuration, while retaining the complete native configuration in source.

Initial text editing supports bounded, verified label spans, preserving unedited source text. JSON adapters update supported stable entity fields while retaining native extensions. This is an extensible editing boundary, not a universal syntax tree or native validation API. Native parsers and independent semantic oracles remain separate work.
