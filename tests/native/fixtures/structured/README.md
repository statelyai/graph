# Structured native controls

<!-- native profiles from tests/native/structured-oracles.test.ts and tests/native/fixtures/structured/fixtures.ts; versions from pnpm-lock.yaml -->

Authored fixtures and independent reader checks; no converter creates these controls.
Pinned installed versions: Graphology 0.26.0, Graphlib 4.0.1,
Cytoscape.js 3.34.0, d3-force 3.0.0, elkjs 0.11.1.

Official references:

- [Graphology serialization](https://graphology.github.io/serialization.html): native mixed directed/undirected edges, multigraph options, attribute dictionaries.
- [Graphlib concepts and serialization](https://github.com/dagrejs/graphlib/wiki/API-Reference): global directedness, named parallel edges, compound nodes, arbitrary labels.
- [Cytoscape element JSON](https://js.cytoscape.org/#notation/elements-json): global element IDs, data, parents, positions.
- [D3 link force](https://d3js.org/d3-force/link): numeric indices use the default accessor; string IDs use an ID accessor. Live node objects are runtime references.
- [ELK JSON](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html): unique IDs, ports, extended/primitive edges and sections.

Graphlib controls intentionally use separate directed/undirected fixtures: an edge
label cannot establish native mixed direction. D3/ELK/Cytoscape preserve application
mode metadata but do not independently interpret every Graph direction kind.
D3 document values preserve JSON topology; runtime alias identity is outside that
contract. Native readers may normalize fields absent from the source. These tests
prove their named profiles, not universal semantic conformance.

Observed upstream boundaries at these pinned versions: Graphology adjacency queries
for a `constructor` neighbor throw, and Graphlib compound `__proto__` children throw
during JSON import. Explicit negative controls retain those reproductions; supported
control fixtures use ordinary IDs. Future adapters must reject or explicitly encode
such native keys, rather than treating parser acceptance as semantic proof.
