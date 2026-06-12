---
'@statelyai/graph': patch
---

`getDegree` is now O(1) per call: `|out| + |in|` corrected by a cached per-node count of non-directed self-loops (revalidated by index version + graph mode, like the CSR snapshot). A full degree sweep over a 100k-node/300k-edge graph drops from ~148 ms to ~10 ms — at parity with ngraph and graphology, which was the one benchmark cell this library lost across the board.
