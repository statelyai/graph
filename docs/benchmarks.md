# Benchmarks

Cross-library comparison of `@statelyai/graph` against [graphology](https://graphology.github.io/), [ngraph](https://github.com/anvaka/ngraph.graph), [@dagrejs/graphlib](https://github.com/dagrejs/graphlib), and [cytoscape](https://js.cytoscape.org/) (headless) on seven workloads: graph construction, BFS reachability, single-pair shortest path, PageRank, connected components, betweenness centrality, and a full degree sweep.

- **Measured:** 2026-06-11 on an Apple M1 Max (10 cores), Node v25.9.0 (darwin/arm64). Library versions: graphology 0.26, ngraph.graph 20.1 / ngraph.path 1.6, @dagrejs/graphlib 4.0, cytoscape 3.34.
- **Numbers are medians** (milliseconds) of ≥5 runs after warmup, within a 1.5 s sampling budget per cell.
- Machine specifics matter. Reproduce on your own hardware with:

  ```bash
  pnpm bench:compare           # 1k / 10k / 100k nodes
  pnpm bench:compare -- --quick  # 1k / 10k only
  ```

Cell legend: **bold** = fastest for that row; `(n.n×)` = multiple of the fastest; `—` = the library has no equivalent API; `>10s` = skipped after a prior run exceeded 10 s; `crash` = the library threw (the error is recorded in the JSON results).

> **Sub-millisecond caveat:** cells under ~0.1 ms (notably scaleFree traversals, which reach few nodes from the start node) are dominated by call overhead. Treat their ratios as noise, in either direction.

## Build

Construct the graph from an identical node/edge list.

| graph | @statelyai/graph | graphology | ngraph | @dagrejs/graphlib | cytoscape (headless) |
|---|---|---|---|---|---|
| random 1,000 | **1.7** | 5.3 (3.2×) | 2.3 (1.4×) | 15.3 (9.2×) | 36.7 (22.2×) |
| scaleFree 1,000 | **1.1** | 3.5 (3.3×) | 1.8 (1.7×) | 12.7 (12.0×) | 27.4 (25.8×) |
| grid 1,000 | **0.84** | 2.0 (2.3×) | 1.3 (1.5×) | 4.3 (5.1×) | 17.2 (20.5×) |
| layeredDag 1,000 | **0.95** | 3.1 (3.3×) | 1.5 (1.6×) | 12.2 (12.8×) | 23.4 (24.7×) |
| random 10,000 | **7.0** | 55.9 (8.0×) | 18.9 (2.7×) | 110 (15.7×) | 407 (58.2×) |
| scaleFree 10,000 | **8.1** | 39.3 (4.8×) | 35.3 (4.3×) | 103 (12.7×) | 411 (50.6×) |
| grid 10,000 | **5.1** | 25.8 (5.1×) | 9.0 (1.8×) | 53.3 (10.5×) | 256 (50.6×) |
| layeredDag 10,000 | **5.6** | 31.6 (5.6×) | 12.8 (2.3×) | 68.4 (12.2×) | 330 (58.9×) |
| random 100,000 | **56.0** | 660 (11.8×) | 291 (5.2×) | 1500 (26.8×) | 4477 (80.0×) |
| scaleFree 100,000 | **96.3** | 651 (6.8×) | 254 (2.6×) | 1525 (15.8×) | 3718 (38.6×) |
| grid 100,000 | **63.0** | 497 (7.9×) | 209 (3.3×) | 848 (13.5×) | 2442 (38.8×) |
| layeredDag 100,000 | **54.2** | 511 (9.4×) | 194 (3.6×) | 1014 (18.7×) | 3419 (63.1×) |

## BFS

Full directed reachability sweep from node 0. Libraries without a built-in traversal get a minimal queue loop over their neighbor API.

| graph | @statelyai/graph | graphology | ngraph | @dagrejs/graphlib | cytoscape (headless) |
|---|---|---|---|---|---|
| random 1,000 | **0.04** | 0.23 (6.4×) | 0.32 (8.9×) | 0.24 (6.7×) | 16.4 (457.5×) |
| scaleFree 1,000 | 0.00 (9.7×) | 0.00 (1.7×) | 0.01 (75.7×) | **0.00** | 1.1 (9097.0×) |
| grid 1,000 | **0.03** | 0.17 (6.5×) | 0.16 (6.2×) | 0.08 (3.1×) | 10.8 (415.7×) |
| layeredDag 1,000 | **0.02** | 0.16 (6.8×) | 0.22 (9.1×) | 0.08 (3.1×) | 12.1 (501.7×) |
| random 10,000 | **0.40** | 9.7 (23.9×) | 4.3 (10.6×) | 3.8 (9.5×) | 228 (565.6×) |
| scaleFree 10,000 | 0.01 (71.4×) | 0.00 (2.0×) | 0.05 (539.2×) | **0.00** | 19.6 (232978.2×) |
| grid 10,000 | **0.21** | 2.8 (12.9×) | 3.0 (13.9×) | 1.7 (7.8×) | 123 (579.1×) |
| layeredDag 10,000 | **0.32** | 3.5 (10.8×) | 2.6 (8.1×) | 1.4 (4.2×) | 171 (530.2×) |
| random 100,000 | **4.6** | 126 (27.6×) | 92.7 (20.3×) | 60.5 (13.3×) | 6555 (1438.5×) |
| scaleFree 100,000 | 0.04 (265.8×) | **0.00** | 0.05 (325.6×) | 0.00 (1.3×) | 309 (1863689.7×) |
| grid 100,000 | **2.3** | 86.2 (38.3×) | 41.4 (18.4×) | 58.4 (25.9×) | 1722 (764.7×) |
| layeredDag 100,000 | **3.4** | 81.9 (23.8×) | 33.1 (9.6×) | 46.4 (13.5×) | 2396 (696.8×) |

The scaleFree rows are sub-millisecond for everyone (few nodes are reachable from node 0); their ratios are noise.

## Single-pair shortest path (sssp)

Weighted shortest path from node 0 to node n−1. `@statelyai/graph` uses `getShortestPath` (bidirectional Dijkstra); graphology uses `dijkstra.bidirectional`; ngraph uses `ngraph.path` A\*. graphlib's only shortest-path API is full single-source Dijkstra, so its cell pays the all-targets cost — that is the cost a graphlib user pays for one query.

| graph | @statelyai/graph | graphology | ngraph | @dagrejs/graphlib | cytoscape (headless) |
|---|---|---|---|---|---|
| random 1,000 | **0.11** | 0.11 (1.0×) | 0.35 (3.3×) | 2.8 (25.9×) | 22.9 (212.2×) |
| scaleFree 1,000 | 0.01 (5.0×) | **0.00** | 0.01 (8.8×) | 1.5 (1296.7×) | 4.1 (3511.2×) |
| grid 1,000 | **0.22** | 0.96 (4.4×) | 0.30 (1.4×) | 0.95 (4.3×) | 14.8 (67.3×) |
| layeredDag 1,000 | **0.16** | 0.65 (4.1×) | 0.35 (2.2×) | 2.3 (14.8×) | 18.5 (117.0×) |
| random 10,000 | **0.14** | 0.33 (2.3×) | 5.9 (40.7×) | 28.0 (194.6×) | 360 (2496.0×) |
| scaleFree 10,000 | 0.04 (25.8×) | **0.00** | 0.01 (7.1×) | 6.0 (3488.9×) | 42.8 (25033.5×) |
| grid 10,000 | **1.7** | 16.2 (9.4×) | 3.4 (2.0×) | 18.9 (11.1×) | 193 (112.4×) |
| layeredDag 10,000 | **2.0** | 13.0 (6.4×) | 4.3 (2.1×) | 18.8 (9.2×) | 269 (131.9×) |
| random 100,000 | **0.60** | 1.3 (2.2×) | 125 (207.9×) | 431 (715.9×) | 5941 (9861.4×) |
| scaleFree 100,000 | 0.34 (199.2×) | **0.00** | 0.02 (14.2×) | 67.0 (39215.9×) | 637 (372866.4×) |
| grid 100,000 | **27.4** | 383 (14.0×) | 66.0 (2.4×) | 338 (12.3×) | 3710 (135.4×) |
| layeredDag 100,000 | **35.2** | 408 (11.6×) | 68.6 (2.0×) | 386 (11.0×) | 5268 (149.9×) |

graphology wins the scaleFree rows; on those graphs node n−1 is typically unreachable from node 0 and the search terminates almost immediately, so the cells are sub-millisecond for both bidirectional implementations.

## PageRank

| graph | @statelyai/graph | graphology | ngraph | @dagrejs/graphlib | cytoscape (headless) |
|---|---|---|---|---|---|
| random 1,000 | **0.62** | 1.1 (1.8×) | — | — | 20.2 (32.4×) |
| scaleFree 1,000 | **0.79** | 1.00 (1.3×) | — | — | 28.1 (35.7×) |
| grid 1,000 | 0.84 (1.6×) | **0.52** | — | — | 30.6 (59.2×) |
| layeredDag 1,000 | **0.54** | 0.93 (1.7×) | — | — | 36.6 (68.4×) |
| random 10,000 | **5.3** | 11.5 (2.2×) | — | — | 7703 (1454.0×) |
| scaleFree 10,000 | **5.1** | 6.4 (1.3×) | — | — | 11869 (2331.2×) |
| grid 10,000 | **5.7** | 6.5 (1.1×) | — | — | 6258 (1105.2×) |
| layeredDag 10,000 | **6.9** | 7.2 (1.0×) | — | — | 7486 (1085.3×) |
| random 100,000 | **54.6** | 190 (3.5×) | — | — | crash |
| scaleFree 100,000 | **95.9** | 157 (1.6×) | — | — | >10s |
| grid 100,000 | 127 (1.1×) | **120** | — | — | crash |
| layeredDag 100,000 | **92.4** | 197 (2.1×) | — | — | crash |

ngraph and graphlib have no PageRank. cytoscape's PageRank threw `Invalid array length` on three of the four 100k graphs.

## Connected components

| graph | @statelyai/graph | graphology | ngraph | @dagrejs/graphlib | cytoscape (headless) |
|---|---|---|---|---|---|
| random 1,000 | **0.02** | 0.42 (17.9×) | — | 1.1 (45.1×) | 37.1 (1577.3×) |
| scaleFree 1,000 | **0.02** | 0.48 (22.7×) | — | 0.69 (33.1×) | 36.0 (1722.1×) |
| grid 1,000 | **0.01** | 0.26 (23.1×) | — | 0.25 (22.9×) | 24.8 (2225.7×) |
| layeredDag 1,000 | **0.02** | 0.46 (30.1×) | — | 0.28 (18.7×) | 38.8 (2562.9×) |
| random 10,000 | **0.35** | 9.6 (27.1×) | — | crash | 526 (1490.3×) |
| scaleFree 10,000 | **0.22** | 12.1 (54.4×) | — | 7.6 (34.2×) | 510 (2293.0×) |
| grid 10,000 | **0.10** | 3.6 (35.0×) | — | crash | 302 (2980.0×) |
| layeredDag 10,000 | **0.30** | 5.9 (19.7×) | — | crash | 464 (1541.3×) |
| random 100,000 | **4.4** | 225 (51.0×) | — | >10s | 13448 (3047.4×) |
| scaleFree 100,000 | **3.3** | 248 (75.0×) | — | crash | 16249 (4906.7×) |
| grid 100,000 | **1.9** | 90.1 (48.3×) | — | >10s | 3921 (2100.9×) |
| layeredDag 100,000 | **3.9** | 196 (50.0×) | — | >10s | 8171 (2086.8×) |

graphlib's `alg.components` uses recursive DFS and overflowed the call stack (`Maximum call stack size exceeded`) at 10,000 nodes on the random, grid, and layeredDag graphs, and at 100,000 on scaleFree. Where it survived, it was 19–34× slower; the remaining 100k cells were skipped after exceeding 10 s.

## Betweenness centrality

Run only at n=1,000 — Brandes is O(V·E) for every library, so larger sizes are capped for everyone.

| graph | @statelyai/graph | graphology | ngraph | @dagrejs/graphlib | cytoscape (headless) |
|---|---|---|---|---|---|
| random 1,000 | **42.5** | 80.3 (1.9×) | — | — | 938 (22.1×) |
| scaleFree 1,000 | **2.7** | 4.1 (1.5×) | — | — | 153 (56.6×) |
| grid 1,000 | **3.8** | 18.6 (4.9×) | — | — | 304 (80.8×) |
| layeredDag 1,000 | **15.9** | 35.5 (2.2×) | — | — | 458 (28.8×) |

## Degree sweep

Sum the degree of every node via each library's degree API.

| graph | @statelyai/graph | graphology | ngraph | @dagrejs/graphlib | cytoscape (headless) |
|---|---|---|---|---|---|
| random 1,000 | 0.29 (9.3×) | 0.03 (1.1×) | **0.03** | 0.87 (27.9×) | 3.2 (103.1×) |
| scaleFree 1,000 | 0.20 (4.0×) | **0.05** | 0.10 (1.9×) | 1.1 (21.0×) | 3.2 (61.5×) |
| grid 1,000 | 0.17 (5.3×) | 0.05 (1.5×) | **0.03** | 0.24 (7.5×) | 2.0 (60.8×) |
| layeredDag 1,000 | 0.20 (4.8×) | **0.04** | 0.08 (2.0×) | 0.76 (18.3×) | 3.6 (84.9×) |
| random 10,000 | 4.6 (14.0×) | 0.42 (1.3×) | **0.33** | 22.0 (67.2×) | 54.9 (167.9×) |
| scaleFree 10,000 | 3.2 (9.3×) | 0.40 (1.2×) | **0.34** | 46.3 (135.2×) | 57.0 (166.2×) |
| grid 10,000 | 1.8 (5.1×) | 0.45 (1.3×) | **0.35** | 11.4 (33.0×) | 27.3 (78.6×) |
| layeredDag 10,000 | 2.7 (8.1×) | 0.44 (1.3×) | **0.33** | 16.3 (48.9×) | 39.7 (119.2×) |
| random 100,000 | 104 (21.9×) | 5.2 (1.1×) | **4.7** | 412 (87.1×) | 753 (159.2×) |
| scaleFree 100,000 | 94.2 (21.2×) | 6.2 (1.4×) | **4.4** | 617 (138.7×) | 831 (186.9×) |
| grid 100,000 | 107 (19.2×) | 11.9 (2.1×) | **5.6** | 200 (35.8×) | 335 (59.9×) |
| layeredDag 100,000 | 93.5 (22.9×) | 11.3 (2.8×) | **4.1** | 301 (73.7×) | 634 (155.4×) |

## Reading the numbers

Where `@statelyai/graph` is fastest:

- **Build** — fastest in every cell, 1.4–80× ahead. Plain-object graphs with lazy WeakMap indexing have very little construction overhead.
- **BFS** — fastest on every non-degenerate row, 4–28× ahead of the next library at 10k–100k.
- **Connected components** — fastest in every cell, 18–75× ahead of graphology (the next-fastest with the API).
- **Single-pair shortest path** — fastest on every row where the search does real work; bidirectional Dijkstra is why `random 100,000` completes in 0.6 ms while full single-source Dijkstra (graphlib) takes 431 ms.
- **PageRank and betweenness** — fastest in most cells, but only by 1.0–3.5× over graphology, and graphology wins `grid` PageRank at 1,000 (0.52 vs 0.84 ms) and 100,000 (120 vs 127 ms). These two are effectively at parity with graphology.

Where it is not fastest:

- **Degree sweep** — ngraph and graphology are consistently faster, by 4–23×. `getDegree` recomputes per call against the edge index, while ngraph/graphology maintain adjacency structures that make per-node degree nearly free. If your workload is dominated by per-node degree queries in a tight loop, this matters.
- **scaleFree traversal/sssp cells** — graphology and graphlib post faster sub-millisecond times. These cells terminate after touching a handful of nodes and are mostly call overhead, but the raw numbers are what they are.

Other findings worth knowing regardless of which library you pick:

- graphlib's recursive-DFS `components` overflows the Node call stack at 10,000 nodes on three of the four graph shapes.
- cytoscape's PageRank throws `Invalid array length` at 100,000 nodes on three of the four shapes; headless cytoscape is generally 2–4 orders of magnitude slower across the board, which is unsurprising — it is a visualization toolkit, not an algorithms library.
- ngraph has no built-in PageRank, components, or betweenness; graphlib has no PageRank or betweenness.

## Methodology

Source: [`bench/compare/run.ts`](../bench/compare/run.ts), [`bench/compare/generate.ts`](../bench/compare/generate.ts), [`bench/compare/adapters.ts`](../bench/compare/adapters.ts). Raw output: [`bench/compare/results/2026-06-11.md`](../bench/compare/results/2026-06-11.md) and [`2026-06-11.json`](../bench/compare/results/2026-06-11.json).

- **Identical inputs.** Seeded generators emit a neutral edge list (integer endpoints, weights); every library builds from the same list. Simple directed graphs only (no parallel edges or self-loops) — the lowest common denominator across libraries.
- **Four shapes × three sizes** (1,000 / 10,000 / 100,000 nodes):
  - `random` — uniform random, ~3 edges/node, with a spanning chain so traversals reach most of the graph
  - `scaleFree` — preferential attachment (k=3); hub-heavy, with most nodes unreachable from node 0
  - `grid` — square lattice with right/down directed edges
  - `layeredDag` — layered DAG with local fanout and occasional skip edges (statechart/workflow-like)
- **Idiomatic usage.** Each library runs through a thin adapter calling its public API the way a user would — no hand-tuned ports. Libraries lacking a built-in BFS get a minimal queue loop over their neighbor API. `—` means no equivalent API exists.
- **Timing.** One warmup run, then samples until ≥5 runs or a 1.5 s budget; the table reports the median.
- **`crash`** means the library threw during the workload (e.g. stack overflow, `Invalid array length`); the error message is recorded in the JSON. A crash is treated as a result, not a harness failure.
- **`>10s`** means a single run exceeded 10 s, so the workload was skipped for that library at that and larger sizes.
- **Fairness notes.** graphlib's only shortest-path API is full single-source Dijkstra, so its `sssp` cells pay the all-targets cost. Betweenness is capped at n=1,000 for every library because Brandes is O(V·E).
