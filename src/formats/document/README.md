# Graph documents

Exact native source retention with a separate, possibly partial Graph projection. Existing format converters still return Graph.

<!-- exported functions and types from src/formats/document/index.ts -->

```ts
import { createGraphDocumentConverter, getGraphDocumentUpdate } from '@statelyai/graph/document';
import { graphMLDocumentConverter } from '@statelyai/graph/graphml';

const document = graphMLDocumentConverter.from(xml);
const persisted = JSON.parse(JSON.stringify(document));
const original = graphMLDocumentConverter.to(persisted); // exact original text

if (document.graph) document.graph.nodes[0].label = 'Updated';
const update = getGraphDocumentUpdate(document, graphMLDocumentConverter);
if (update.ok) console.log(update.source);
else console.log(update.diagnostics);
```

`GraphDocument<TSource, TGraph>` contains `kind`, `version`, `format`, `source`, `graph`, `baseline`, `diagnostics` and optional adapter `state`. `graph` can be null when projection is unavailable. The envelope, source and state remain JSON-serializable. Graph and VisualGraph codec types are inferred without weakening their fields.

<!-- source validation and update policy from src/formats/document/index.ts -->

Source must be text or JSON values: finite numbers, strings, booleans, null, dense arrays and plain objects. Invalid values are rejected before anything is silently dropped. Runtime object aliases/prototypes are outside the source contract. Graph optional undefined object fields compare using their JSON view.

Unchanged documents reproduce exact text or native JSON values after persistence, including comments and unknown constructs. Exact retention does not prove complete semantic projection. Each import reports projection limitations; unavailable projections retain source and diagnostics. `.from(source, { strict: true })` throws for unavailable/error projections.

Source edits win when Graph is unchanged. Independent Graph/native edits merge by stable entity ID; edits to the same mapped field conflict. Object-valued fields currently conflict as whole fields. Restoring an unchanged Graph snapshot never overwrites a newer native source edit.

`.to(document)` throws an ordinary Error with `.diagnostics` when an edit is unsupported, ambiguous, conflicting, or fails reparse proof. Edit `document.source` to change syntax outside the adapter's verified patch scope. Adapter state/projection provenance are not editable user fields.

Explicit regeneration is available through `getGraphDocumentUpdate(document, converter, { mode: 'regenerate' })`. Successful regeneration returns a `lossy-regeneration` warning because source details and requested Graph fields may be lost. Regenerated source is reparsed; `graph-regeneration-loss` warnings identify differing Graph field paths, and `graph-regeneration-unavailable` reports an unavailable comparison/projection. A successful result in this explicit mode does not promise semantic fidelity. `.to` always stays strict.

<!-- registration hooks from src/formats/document/index.ts#GraphDocumentConverterConfig -->

Custom registrations pass `{ format, codec: { from, to }, project?, patch?, getComparisonGraph?, getComparisonState? }` to `createGraphDocumentConverter`. The factory loads no codecs or optional peers. `project` can provide diagnostics/state and a null projection. Patch context contains cloned current/baseline source, normalized baseline/current Graphs, requested changes and a merged Graph. Changes use JSON pointers with stable escaped entity IDs, for example `/nodes/a~1b/label`.

A successful patch is reparsed and compared with the merged requested Graph. Comparison hooks can remove only verified private provenance, retaining all editable user fields. If normalization changes an editable field's representation, `getComparisonState` must extract only private state to detect hidden state edits; otherwise the core rejects edits in that field conservatively. See [architecture decision](../../../docs/adr/003-serializable-native-documents.md).
