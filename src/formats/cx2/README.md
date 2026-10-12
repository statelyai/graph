# CX2

<!-- public API and scoped mappings from src/formats/cx2/index.ts -->

`fromCX2`, `toCX2`, `cx2Converter`, `cx2DocumentConverter` operate on plain CX2
JSON aspect arrays. No runtime dependency. The profile follows [Cytoscape's CX2
2.0 specification](https://cytoscape.org/cx/cx2/specification/cytoscape-exchange-format-specification-%28version-2%29/)
(updated July 22, 2025).

Safe integer node/edge IDs map to canonical decimal Graph IDs. Duplicate IDs,
unsafe numeric identities and dangling endpoints reject. Edges are directed;
parallel edges/self-loops remain distinct. Native declarations determine scalar
and list attribute types, default values and aliases. Names declared with aliases
must use their alias in records. Node/edge `name` string attributes map labels;
other resolved attributes stay in data. Node x/y coordinates map geometry with
CX2's all-node completeness rule; z remains opaque native state.

Visual properties, bypasses, editor properties and custom aspects remain opaque,
not Graph styles. Fresh export requires canonical numeric Graph IDs and this
explicit typed-attribute profile; hierarchy/ports/incompatible modes and other
unrepresentable Graph fields reject. Attribute declarations preserve types;
edits never silently coerce a value to a different declared type. Null typed
attributes, including null numeric placeholders, are outside this interpreted
profile and retainable through unavailable document projections. Fragmented
entity aspects concatenate in source order; all declarations must precede all
entity/network attribute data. Late declarations/defaults reject projection.

<!-- native state and document editing from src/formats/cx2/index.ts -->

Native carriers retain original aspects and attribute presence. Documents retain
exact original JSON values after JSON persistence, including unsupported source
with a null projection. Bounded label/typed-attribute edits retain unknown aspects
and reparse to the requested Graph; structural or ambiguous edits reject.
`metadata: 'native'` and `nativeCarrier: false` expose explicit native handling.

<!-- independent reader evidence from tests/native/cx2.test.ts -->

Independent native tests use the maintained NDEx Python `ndex2` CX2Network reader
with a pinned version. Reader assertions establish selected topology/attribute
profiles, not unrestricted visual rendering or whole-language losslessness.

<!-- maintained reader limits and explicit edit policies from tests/native/cx2.test.ts and src/formats/cx2/index.ts -->

NDEx3.12.0 omits false/zero defaults and null typed values in the inspected
reader. Tests record those behaviors as upstream-negative controls; the adapter
applies falsy defaults according to the specification, and rejects null typed
values from its interpreted profile. This does not weaken declaration validation.
`nativeCarrier: false` requires a clean explicit native data profile (for example
`cx2DocumentConverter.from(source).graph`); private headers are not erased from
caller-authored data. Native source edits win over unchanged captured Graph fields;
conflicting mapped edits reject. Document editing currently supports entity
labels/typed attributes, with string name declarations already present; root
attributes, schema changes, coordinates and structural edits reject.
