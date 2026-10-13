# DGML

<!-- public API and scoped mappings from src/formats/dgml/index.ts -->

`fromDGML`, `toDGML`, `dgmlConverter`, `dgmlDocumentConverter` operate on Microsoft
Directed Graph Markup Language XML in `http://schemas.microsoft.com/vs/2009/dgml`.
DGML requires the optional `fast-xml-parser` peer for XML validation.

Nodes map `Id` and visible `Label` (missing node Label defaults to Id). Directed
links map endpoints and labels. `Category="Contains"` links map parentId rather
than ordinary Graph edges; multiple parents and containment cycles reject.
Undeclared endpoints become inferred nodes, as Microsoft specifies. Declaration
provenance distinguishes inferred nodes; editing their labels rejects until the
source supplies an explicit declaration.

Node/edge data separates category memberships, raw string attributes and declared
property values. Supported CLR property types are String, Boolean, Int32, Int64
(unsafe magnitudes retained as exact lexical strings under their declaration) and Double (finite only). Missing or unsupported CLR types
remain exact lexical strings; invalid values for supported types reject projection. Category/property definitions remain in graph data;
category appearance inheritance, Styles and other XML extensions remain opaque.
Native links have no schema-defined stable ID; Graph edge IDs are their original
link positions (`dgml_link_N`, counting Contains links). Strict fresh output
requires those canonical IDs. `edgeIds: 'positional'` explicitly permits identity
normalization; arbitrary Graph edge IDs otherwise reject. Fresh output accepts
this explicit data profile, directed edges and hierarchy;
unrepresentable Graph fields reject rather than disappear.

<!-- source preservation and bounded edits from src/formats/dgml/index.ts -->

Native imports carry serializable source state. Unchanged export and documents
retain exact source strings, including comments/namespaces/unknown XML. Document
label/property edits use lexical attribute spans with reparse proof; structural,
implicit-node and unsupported edits reject. Edge patches additionally require the
native Link record sequence to match its original sequence exactly: insertions,
removals, reordering or independent Link-record edits make positional identity
ambiguous and reject. Source changes outside Link records and stable node-ID
patches remain independent. Unsupported source can be retained in
GraphDocument with a null projection. `metadata: 'native'` and `nativeCarrier:
false` disable native-state interpretation. Fresh regeneration requires a clean
explicit data profile, such as a document's Graph projection; private carrier
headers are not silently erased from caller-authored data.

<!-- independent evidence from tests/native/dgml.test.ts and fixtures/dgml -->

Native tests validate selected external/emitted fixtures against Microsoft's
published DGML XSD through libxml2. Schema acceptance does not prove Visual
Studio rendering, custom property interpretation, or complete DGML semantics.
The authoritative reference is [Microsoft's DGML reference](https://learn.microsoft.com/en-us/visualstudio/modeling/directed-graph-markup-language-dgml-reference?view=visualstudio).

<!-- native schema/reference and XML normalization evidence from tests/native/dgml.test.ts -->

The published XSD rejects dynamic property attributes such as Microsoft's
`DrivingAge` example. Tests record this schema/reference mismatch explicitly;
CLR property parsing follows the documented data type profile, with no independent
Visual Studio property-evaluation claim. XML attribute normalization follows the
native XML parser: literal CR/LF/tab becomes spaces, character references remain
distinct. Unknown qualified attributes survive source-preserving edits; fresh
output rejects unbound/qualified attribute names.
