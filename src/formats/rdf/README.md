# RDF 1.1 datasets and syntax

<!-- dependency-free exported RDF DTO/core API from src/formats/rdf/index.ts -->

```ts
import {
  fromRDFDataset, toRDFDataset, getRDFTermId, getRDFQuadId,
} from '@statelyai/graph/rdf';

const dataset = {
  version: '1.1' as const,
  quads: [{
    subject: { termType: 'NamedNode' as const, value: 'urn:alice' },
    predicate: { termType: 'NamedNode' as const, value: 'urn:name' },
    object: {
      termType: 'Literal' as const, value: 'Alice', language: 'EN',
      datatype: {
        termType: 'NamedNode' as const,
        value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString',
      },
    },
    graph: { termType: 'DefaultGraph' as const, value: '' as const },
  }],
  namedGraphs: [{ termType: 'NamedNode' as const, value: 'urn:empty' }],
};
const graph = fromRDFDataset(dataset);
const original = toRDFDataset(graph);
```

`rdfDatasetConverter` provides `.from`/`.to`; `rdfDatasetDocumentConverter` retains
original JSON values and reports set semantics. `getRDFTerm` validates/clones one
term. Public types: `RDFNamedNode`, `RDFBlankNode`, `RDFLiteral`, `RDFDefaultGraph`,
`RDFSubject`, `RDFObject`, `RDFGraphName`, `RDFGraphTerm`, `RDFTerm`, `RDFQuad`,
`RDFDataset`, `RDFExportOptions`. This DTO subpath has no runtime peer dependency.

<!-- RDF projection, equality, strict export domain and validation from RDF core -->

Subjects/objects become identity-keyed nodes. Directed statement edges carry exact
`data.rdf.predicate` and `data.rdf.graph` terms. Predicates and graph names do not
become separate nodes unless also used as subjects/objects. Named graphs are not
hierarchy; root `data.rdf.namedGraphs` preserves declared empty graphs too.

Named IRIs, scoped blank nodes, literals and the default graph have disjoint
identities. Blank DTOs require both `value` and `scope`; matching labels in different
scopes remain distinct, while one scoped blank can be shared across named graphs.
Literal lexical strings, datatype IRIs and language tags are never converted to
JavaScript numbers or interpreted through entailment. Ill-typed literals such as
`"abc"^^xsd:integer` are valid terms and remain intact. **RDF 1.1** literal identity
compares language tags character by character: `EN` and `en` remain distinct here.
No RDF 1.2 casefold identity rule is silently substituted. Arbitrary datatype IRIs,
including `rdf:dirLangString` without direction/language fields, remain ordinary
RDF 1.1 unknown datatypes.

RDF statements are a set. Duplicate term-identical quads project to one edge;
unchanged imported dataset JSON preserves original duplicate occurrences, order
and unknown root metadata through a versioned carrier. Explicit fresh regeneration
emits the set and its named-graph declarations. All DTO contents must be plain JSON;
cycles/classes/functions/BigInt/undefined/nonfinite values reject rather than normalize.

Fresh Graph export requires explicit node `data.rdf.term`, edge
`data.rdf.predicate`/`data.rdf.graph`, and root `data.rdf.version`/`namedGraphs`.
Use public `getRDFTermId`/`getRDFQuadId` to construct the required derived IDs.
Node labels equal term values and edge labels equal predicate IRIs. Null/absent
hierarchy and inherited directed mode resolve equivalent factory defaults; custom
IDs, display-label changes, hierarchy, styles, arbitrary user data and other
Graph-only fields reject instead of disappearing. This is a scoped RDF term Graph,
not unrestricted lossless export of arbitrary application Graphs.

Validation enforces RDF 1.1 term roles, scalar Unicode, absolute IRI schemes,
forbidden lexical characters/malformed percent escapes, authority-only IP brackets,
and language/datatype consistency with BCP47 syntax. It does not claim a complete
RFC3987 authority/IRI or registered-language validator. Datatype lexical validity
is deliberately not required. Unknown term/quad fields, variables, triple terms
and directional literals reject; unknown JSON dataset root metadata is retained.

<!-- optional concrete syntax API and dependency from src/formats/rdf/syntax.ts and package peer integration -->

```ts
import {
  fromRDF, toRDF, createRDFDocumentConverter,
} from '@statelyai/graph/rdf/syntax';

const graph = fromRDF(turtle, {
  format: 'Turtle', version: '1.1', blankScope: 'source-one',
  baseIRI: 'https://example.org/',
});
const text = toRDF(graph, { format: 'Turtle' });
const fresh = toRDF(graph, { format: 'Turtle', nativeCarrier: false });
```

Install optional `n3` (tested with pinned **2.13.12**). `RDFSyntax` permits only
`N-Triples`, `N-Quads`, `Turtle`, `TriG`; `RDFSyntaxOptions` and
`RDFSyntaxExportOptions` declare the options. Parsing and emission are synchronous.
The maintained N3 parser selects each strict grammar; its permissive default/N3
reasoning grammar is never used. No handwritten Turtle parser is included.
Public parser token/version observers and a local RDFJS factory preserve resolved
empty graph declarations, tag casing and stable anonymous blank IDs. Current
`@types/n3` lacks these observer overloads; the adapter declares the local narrow
signature. Parser/factory objects never escape into the JSON Graph.

N3 2.13.12 itself rejects explicit `^^rdf:dirLangString` literals before invoking
the factory, although that IRI can be an ordinary unknown datatype in RDF 1.1.
The DTO/emitter preserve it; syntax import reports an unavailable projection and
retains exact source. This is a documented parser coverage gap.

Explicit RDF version declarations outside `1.1`, quoted/nested triple terms and
directional literals reject. JSON-LD processing, remote contexts, RDF/XML and RDF
1.2 support remain separate follow-ups; no asynchronous processing is hidden inside
the synchronous document API. Source strings are bounded to 16 × 1024² UTF-16 units.

Blank scope defaults to `document` for stable repeated parses. Supply different
`blankScope` values before combining unrelated sources. Fresh syntax assigns unique
blank labels across all original scopes, preserving dataset relationships up to
blank-node isomorphism. Unspecified export base/scope options inherit the matching captured syntax;
explicit changed options regenerate. Original blank spellings/scopes and derived Graph IDs can
change on regeneration. Turtle authoring emits its valid N-Triples subset; TriG
emits default triples and named graph blocks, including empty declarations.
N-Quads cannot encode empty named graphs and rejects them. N-Triples/Turtle reject
all named graphs rather than silently selecting only the default graph.

<!-- native source retention and regeneration from createRDFDocumentConverter and document core -->

```ts
const codec = createRDFDocumentConverter({ format: 'TriG' });
const document = codec.from(trig);
const persisted = JSON.parse(JSON.stringify(document));
const exact = codec.to(persisted);
const regenerated = codec.getUpdate(document, { mode: 'regenerate' });
```

No-op output retains exact source **text**, including comments, prefix/base
spellings, order and duplicate statements. File byte encodings lie outside the
string API. Source-only edits are authoritative and reparsed; unsupported/version
unavailable sources retain `graph: null` plus diagnostics. Initially all Graph
patches require explicit regeneration. Strict `.to` rejects instead of returning
stale text; same-field source/Graph conflicts reject. Regeneration emits loss
diagnostics for concrete spelling/comments/IDs and still rejects incoherent or
Graph-only state. The generic document boundary reports partial native projection;
source retention does not establish complete RDF interpretation or entailment.

<!-- independent native proof and observer/store limitations from tests/native/rdf.test.ts and fixtures/rdf/provenance.json -->

Independent tests use pinned **RDFLib 7.6.0** actual readers plus
`rdflib.compare.isomorphic`. Dataset roles, graph existence and shared blank
identity are encoded into one RDF graph for independent bijection checking;
lexical/datatype/language descriptors retain exact fields. Native
`RDFSink.newGraph` and public `Graph`/`ConjunctiveGraph.add` calls are observed while
unmodified parser grammar and store equality execute. Raw store controls show
that RDFLib Memory storage drops empty graphs and folds tag case; those store
results cannot certify these distinctions. Parser events independently verify
resolved declarations and pre-store statement terms. No oracle grammar/equality
is patched. Literal normalization is disabled; emitted quoted typed literals keep
numeric lexical forms. Upstream RDFLib numeric shorthand normalization is outside
that author-profile proof. Native malformed-source and wrong-dataset controls
prevent treating adapter self-roundtrips as validation.

Primary specifications:
[RDF 1.1 Concepts](https://www.w3.org/TR/rdf11-concepts/),
[N-Triples](https://www.w3.org/TR/n-triples/),
[N-Quads](https://www.w3.org/TR/n-quads/),
[Turtle](https://www.w3.org/TR/turtle/), [TriG](https://www.w3.org/TR/trig/).
