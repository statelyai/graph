import type { Graph, GraphEdge } from '../types';
import type { BipartiteMatch } from './bipartite';

export interface MaximumMatchingOptions<E = any> {
  /** Finite edge weight accessor. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<E>) => number;
  /**
   * Only consider matchings of maximum cardinality, then maximize weight
   * among them. Default `false`: maximize weight alone (so edges with
   * non-positive weight are never matched).
   */
  maxCardinality?: boolean;
}

/** A matched edge (same shape as {@link BipartiteMatch}). */
export type GraphMatch = BipartiteMatch;

/**
 * Maximum-weight matching on a general graph (Edmonds' blossom algorithm
 * with dual variables, after Galil and the classic `mwmatching` reference
 * implementation). O(n³).
 *
 * `edges` are `[u, v, weight]` over vertices `0..n-1` with `u !== v` and at
 * most one edge per pair. Returns `mate[v]`: the matched vertex or -1, and
 * `mateEdge[v]`: the index of the matched edge or -1.
 */
function solveMaxWeightMatching(
  n: number,
  edges: Array<[number, number, number]>,
  maxCardinality: boolean,
): Int32Array {
  const mateEdge = new Int32Array(n).fill(-1);
  const nedge = edges.length;
  if (nedge === 0) return mateEdge;

  let maxWeight = 0;
  for (const [, , w] of edges) if (w > maxWeight) maxWeight = w;

  // endpoint[p]: vertex at endpoint p; edge k has endpoints 2k and 2k+1
  const endpoint = new Int32Array(2 * nedge);
  for (let k = 0; k < nedge; k++) {
    endpoint[2 * k] = edges[k][0];
    endpoint[2 * k + 1] = edges[k][1];
  }
  // neighbend[v]: remote endpoints of edges attached to v
  const neighbend: number[][] = Array.from({ length: n }, () => []);
  for (let k = 0; k < nedge; k++) {
    const [i, j] = edges[k];
    neighbend[i].push(2 * k + 1);
    neighbend[j].push(2 * k);
  }

  // mate[v]: remote endpoint of v's matched edge, or -1
  const mate = new Int32Array(n).fill(-1);
  // label: 0 free, 1 S-vertex/blossom, 2 T-vertex/blossom (top level)
  const label = new Int32Array(2 * n);
  const labelend = new Int32Array(2 * n).fill(-1);
  const inblossom = Int32Array.from({ length: n }, (_, i) => i);
  const blossomparent = new Int32Array(2 * n).fill(-1);
  const blossomchilds: Array<number[] | null> = new Array(2 * n).fill(null);
  const blossombase = new Int32Array(2 * n).fill(-1);
  for (let i = 0; i < n; i++) blossombase[i] = i;
  const blossomendps: Array<number[] | null> = new Array(2 * n).fill(null);
  const bestedge = new Int32Array(2 * n).fill(-1);
  const blossombestedges: Array<number[] | null> = new Array(2 * n).fill(null);
  const unusedblossoms: number[] = [];
  for (let b = n; b < 2 * n; b++) unusedblossoms.push(b);
  const dualvar = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) dualvar[i] = maxWeight;
  const allowedge = new Uint8Array(nedge);
  let queue: number[] = [];

  const slack = (k: number) =>
    dualvar[edges[k][0]] + dualvar[edges[k][1]] - 2 * edges[k][2];

  const leaves = (b: number): number[] => {
    if (b < n) return [b];
    const result: number[] = [];
    const stack = [b];
    while (stack.length > 0) {
      const t = stack.pop()!;
      if (t < n) {
        result.push(t);
        continue;
      }
      const childs = blossomchilds[t]!;
      for (let i = childs.length - 1; i >= 0; i--) stack.push(childs[i]);
    }
    return result;
  };
  const at = (list: number[], j: number) =>
    list[j < 0 ? j + list.length : j];

  // Label the top-level blossom containing w (t = 1 S, 2 T) via endpoint p
  const assignLabel = (w0: number, t0: number, p0: number): void => {
    let w = w0;
    let t = t0;
    let p = p0;
    for (;;) {
      const b = inblossom[w];
      label[w] = label[b] = t;
      labelend[w] = labelend[b] = p;
      bestedge[w] = bestedge[b] = -1;
      if (t === 1) {
        queue.push(...leaves(b));
        return;
      }
      // t === 2: label the mate of the base S
      const base = blossombase[b];
      w = endpoint[mate[base]];
      t = 1;
      p = mate[base] ^ 1;
    }
  };

  // Trace back from v and w to find a new blossom's base, or -1 for an
  // augmenting path
  const scanBlossom = (v0: number, w0: number): number => {
    let v = v0;
    let w = w0;
    const path: number[] = [];
    let base = -1;
    while (v !== -1 || w !== -1) {
      let b = inblossom[v];
      if (label[b] & 4) {
        base = blossombase[b];
        break;
      }
      path.push(b);
      label[b] = 5;
      if (labelend[b] === -1) {
        v = -1;
      } else {
        v = endpoint[labelend[b]];
        b = inblossom[v];
        v = endpoint[labelend[b]];
      }
      if (w !== -1) [v, w] = [w, v];
    }
    for (const b of path) label[b] = 1;
    return base;
  };

  const addBlossom = (base: number, k: number): void => {
    let v = edges[k][0];
    let w = edges[k][1];
    const bb = inblossom[base];
    let bv = inblossom[v];
    let bw = inblossom[w];
    const b = unusedblossoms.pop()!;
    blossombase[b] = base;
    blossomparent[b] = -1;
    blossomparent[bb] = b;
    const path: number[] = [];
    const endps: number[] = [];
    blossomchilds[b] = path;
    blossomendps[b] = endps;
    while (bv !== bb) {
      blossomparent[bv] = b;
      path.push(bv);
      endps.push(labelend[bv]);
      v = endpoint[labelend[bv]];
      bv = inblossom[v];
    }
    path.push(bb);
    path.reverse();
    endps.reverse();
    endps.push(2 * k);
    while (bw !== bb) {
      blossomparent[bw] = b;
      path.push(bw);
      endps.push(labelend[bw] ^ 1);
      w = endpoint[labelend[bw]];
      bw = inblossom[w];
    }
    label[b] = 1;
    labelend[b] = labelend[bb];
    dualvar[b] = 0;
    for (const leaf of leaves(b)) {
      if (label[inblossom[leaf]] === 2) queue.push(leaf);
      inblossom[leaf] = b;
    }
    const bestedgeto = new Int32Array(2 * n).fill(-1);
    for (const child of path) {
      const nblists: number[][] =
        blossombestedges[child] === null
          ? leaves(child).map((leaf) => neighbend[leaf].map((p) => p >> 1))
          : [blossombestedges[child]!];
      for (const nblist of nblists) {
        for (const e of nblist) {
          let i = edges[e][0];
          let j = edges[e][1];
          if (inblossom[j] === b) [i, j] = [j, i];
          const bj = inblossom[j];
          if (
            bj !== b &&
            label[bj] === 1 &&
            (bestedgeto[bj] === -1 || slack(e) < slack(bestedgeto[bj]))
          ) {
            bestedgeto[bj] = e;
          }
        }
      }
      blossombestedges[child] = null;
      bestedge[child] = -1;
    }
    const bestList: number[] = [];
    for (const e of bestedgeto) if (e !== -1) bestList.push(e);
    blossombestedges[b] = bestList;
    bestedge[b] = -1;
    for (const e of bestList) {
      if (bestedge[b] === -1 || slack(e) < slack(bestedge[b])) bestedge[b] = e;
    }
  };

  const expandBlossom = (b: number, endstage: boolean): void => {
    for (const s of blossomchilds[b]!) {
      blossomparent[s] = -1;
      if (s < n) inblossom[s] = s;
      else if (endstage && dualvar[s] === 0) expandBlossom(s, endstage);
      else for (const leaf of leaves(s)) inblossom[leaf] = s;
    }
    if (!endstage && label[b] === 2) {
      const childs = blossomchilds[b]!;
      const endps = blossomendps[b]!;
      const entrychild = inblossom[endpoint[labelend[b] ^ 1]];
      let j = childs.indexOf(entrychild);
      let jstep: number;
      let endptrick: number;
      if (j & 1) {
        j -= childs.length;
        jstep = 1;
        endptrick = 0;
      } else {
        jstep = -1;
        endptrick = 1;
      }
      let p = labelend[b];
      while (j !== 0) {
        label[endpoint[p ^ 1]] = 0;
        label[endpoint[at(endps, j - endptrick) ^ endptrick ^ 1]] = 0;
        assignLabel(endpoint[p ^ 1], 2, p);
        allowedge[at(endps, j - endptrick) >> 1] = 1;
        j += jstep;
        p = at(endps, j - endptrick) ^ endptrick;
        allowedge[p >> 1] = 1;
        j += jstep;
      }
      let bv = at(childs, j);
      label[endpoint[p ^ 1]] = label[bv] = 2;
      labelend[endpoint[p ^ 1]] = labelend[bv] = p;
      bestedge[bv] = -1;
      j += jstep;
      while (at(childs, j) !== entrychild) {
        bv = at(childs, j);
        if (label[bv] === 1) {
          j += jstep;
          continue;
        }
        let found = -1;
        for (const leaf of leaves(bv)) {
          if (label[leaf] !== 0) {
            found = leaf;
            break;
          }
        }
        if (found !== -1) {
          label[found] = 0;
          label[endpoint[mate[blossombase[bv]]]] = 0;
          assignLabel(found, 2, labelend[found]);
        }
        j += jstep;
      }
    }
    label[b] = labelend[b] = -1;
    blossomchilds[b] = blossomendps[b] = null;
    blossombase[b] = -1;
    blossombestedges[b] = null;
    bestedge[b] = -1;
    unusedblossoms.push(b);
  };

  // Swap matched/unmatched edges along the alternating path through
  // blossom b from vertex v to the base
  const augmentBlossom = (b: number, v: number): void => {
    let t = v;
    while (blossomparent[t] !== b) t = blossomparent[t];
    if (t >= n) augmentBlossom(t, v);
    const childs = blossomchilds[b]!;
    const endps = blossomendps[b]!;
    const i = childs.indexOf(t);
    let j = i;
    let jstep: number;
    let endptrick: number;
    if (i & 1) {
      j -= childs.length;
      jstep = 1;
      endptrick = 0;
    } else {
      jstep = -1;
      endptrick = 1;
    }
    while (j !== 0) {
      j += jstep;
      t = at(childs, j);
      const p = at(endps, j - endptrick) ^ endptrick;
      if (t >= n) augmentBlossom(t, endpoint[p]);
      j += jstep;
      t = at(childs, j);
      if (t >= n) augmentBlossom(t, endpoint[p ^ 1]);
      mate[endpoint[p]] = p ^ 1;
      mate[endpoint[p ^ 1]] = p;
    }
    blossomchilds[b] = [...childs.slice(i), ...childs.slice(0, i)];
    blossomendps[b] = [...endps.slice(i), ...endps.slice(0, i)];
    blossombase[b] = blossombase[blossomchilds[b]![0]];
  };

  const augmentMatching = (k: number): void => {
    const [v, w] = edges[k];
    for (const [s0, p0] of [
      [v, 2 * k + 1],
      [w, 2 * k],
    ]) {
      let s = s0;
      let p = p0;
      for (;;) {
        const bs = inblossom[s];
        if (bs >= n) augmentBlossom(bs, s);
        mate[s] = p;
        if (labelend[bs] === -1) break;
        const t = endpoint[labelend[bs]];
        const bt = inblossom[t];
        s = endpoint[labelend[bt]];
        const j = endpoint[labelend[bt] ^ 1];
        if (bt >= n) augmentBlossom(bt, j);
        mate[j] = labelend[bt];
        p = labelend[bt] ^ 1;
      }
    }
  };

  for (let stage = 0; stage < n; stage++) {
    label.fill(0);
    bestedge.fill(-1);
    for (let b = n; b < 2 * n; b++) blossombestedges[b] = null;
    allowedge.fill(0);
    queue = [];
    for (let v = 0; v < n; v++) {
      if (mate[v] === -1 && label[inblossom[v]] === 0) assignLabel(v, 1, -1);
    }

    let augmented = false;
    for (;;) {
      while (queue.length > 0 && !augmented) {
        const v = queue.pop()!;
        for (const p of neighbend[v]) {
          const k = p >> 1;
          const w = endpoint[p];
          if (inblossom[v] === inblossom[w]) continue;
          let kslack = 0;
          if (!allowedge[k]) {
            kslack = slack(k);
            if (kslack <= 0) allowedge[k] = 1;
          }
          if (allowedge[k]) {
            if (label[inblossom[w]] === 0) {
              assignLabel(w, 2, p ^ 1);
            } else if (label[inblossom[w]] === 1) {
              const base = scanBlossom(v, w);
              if (base >= 0) {
                addBlossom(base, k);
              } else {
                augmentMatching(k);
                augmented = true;
                break;
              }
            } else if (label[w] === 0) {
              label[w] = 2;
              labelend[w] = p ^ 1;
            }
          } else if (label[inblossom[w]] === 1) {
            const b = inblossom[v];
            if (bestedge[b] === -1 || kslack < slack(bestedge[b])) bestedge[b] = k;
          } else if (label[w] === 0) {
            if (bestedge[w] === -1 || kslack < slack(bestedge[w])) bestedge[w] = k;
          }
        }
      }
      if (augmented) break;

      // No augmenting path with tight edges: adjust the dual variables
      let deltatype = -1;
      let delta = 0;
      let deltaedge = -1;
      let deltablossom = -1;
      if (!maxCardinality) {
        deltatype = 1;
        delta = Infinity;
        for (let v = 0; v < n; v++) if (dualvar[v] < delta) delta = dualvar[v];
      }
      for (let v = 0; v < n; v++) {
        if (label[inblossom[v]] === 0 && bestedge[v] !== -1) {
          const d = slack(bestedge[v]);
          if (deltatype === -1 || d < delta) {
            delta = d;
            deltatype = 2;
            deltaedge = bestedge[v];
          }
        }
      }
      for (let b = 0; b < 2 * n; b++) {
        if (blossomparent[b] === -1 && label[b] === 1 && bestedge[b] !== -1) {
          const d = slack(bestedge[b]) / 2;
          if (deltatype === -1 || d < delta) {
            delta = d;
            deltatype = 3;
            deltaedge = bestedge[b];
          }
        }
      }
      for (let b = n; b < 2 * n; b++) {
        if (
          blossombase[b] >= 0 &&
          blossomparent[b] === -1 &&
          label[b] === 2 &&
          (deltatype === -1 || dualvar[b] < delta)
        ) {
          delta = dualvar[b];
          deltatype = 4;
          deltablossom = b;
        }
      }
      if (deltatype === -1) {
        // Max-cardinality mode with nothing left to grow: final adjustment
        deltatype = 1;
        delta = Infinity;
        for (let v = 0; v < n; v++) if (dualvar[v] < delta) delta = dualvar[v];
        delta = Math.max(0, delta);
      }

      for (let v = 0; v < n; v++) {
        if (label[inblossom[v]] === 1) dualvar[v] -= delta;
        else if (label[inblossom[v]] === 2) dualvar[v] += delta;
      }
      for (let b = n; b < 2 * n; b++) {
        if (blossombase[b] >= 0 && blossomparent[b] === -1) {
          if (label[b] === 1) dualvar[b] += delta;
          else if (label[b] === 2) dualvar[b] -= delta;
        }
      }

      if (deltatype === 1) break;
      if (deltatype === 2) {
        allowedge[deltaedge] = 1;
        let i = edges[deltaedge][0];
        const j = edges[deltaedge][1];
        if (label[inblossom[i]] === 0) i = j;
        queue.push(i);
      } else if (deltatype === 3) {
        allowedge[deltaedge] = 1;
        queue.push(edges[deltaedge][0]);
      } else {
        expandBlossom(deltablossom, false);
      }
    }
    if (!augmented) break;

    for (let b = n; b < 2 * n; b++) {
      if (
        blossomparent[b] === -1 &&
        blossombase[b] >= 0 &&
        label[b] === 1 &&
        dualvar[b] === 0
      ) {
        expandBlossom(b, true);
      }
    }
  }

  for (let v = 0; v < n; v++) if (mate[v] !== -1) mateEdge[v] = mate[v] >> 1;
  return mateEdge;
}

/**
 * Returns a maximum-weight matching of a general (not necessarily
 * bipartite) graph: a set of edges, no two sharing a node, with the largest
 * total weight. With the default weight of 1 per edge this is a maximum
 * cardinality matching. Pass `maxCardinality: true` to first maximize the
 * number of matched edges, then the weight. Use it to pair up nodes, e.g.
 * matching reviewers or merging states two at a time.
 *
 * Edges are treated as undirected. Self-loops and dangling edges are
 * ignored; of several parallel edges only the heaviest (first on ties) can
 * be matched. Matches come in `graph.edges` order. Edmonds' blossom
 * algorithm with dual variables: O(n³).
 *
 * @example
 * ```ts
 * // a–b–c–d path: the outer edges beat the middle one
 * getMaximumMatching(graph).map((match) => match.edgeId); // ['ab', 'cd']
 * ```
 */
export function getMaximumMatching<N, E>(
  graph: Graph<N, E>,
  options?: MaximumMatchingOptions<E>,
): GraphMatch[] {
  const getWeight =
    options?.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const indexOf = new Map(graph.nodes.map((node, i) => [node.id, i]));
  // Heaviest edge per unordered pair
  const bestByPair = new Map<number, { edgeIndex: number; weight: number }>();
  const n = graph.nodes.length;
  graph.edges.forEach((edge, e) => {
    const u = indexOf.get(edge.sourceId);
    const v = indexOf.get(edge.targetId);
    if (u === undefined || v === undefined || u === v) return;
    const weight = getWeight(edge as GraphEdge<E>);
    if (!Number.isFinite(weight)) {
      throw new Error(
        `getMaximumMatching: edge "${edge.id}" has non-finite weight ${weight}`,
      );
    }
    const key = Math.min(u, v) * n + Math.max(u, v);
    const current = bestByPair.get(key);
    if (!current || weight > current.weight) bestByPair.set(key, { edgeIndex: e, weight });
  });
  const candidates = [...bestByPair.values()].sort((a, b) => a.edgeIndex - b.edgeIndex);
  const edges = candidates.map(({ edgeIndex, weight }): [number, number, number] => [
    indexOf.get(graph.edges[edgeIndex].sourceId)!,
    indexOf.get(graph.edges[edgeIndex].targetId)!,
    weight,
  ]);
  const mateEdge = solveMaxWeightMatching(n, edges, options?.maxCardinality ?? false);
  const matched = new Set<number>();
  for (let v = 0; v < n; v++) if (mateEdge[v] !== -1) matched.add(candidates[mateEdge[v]].edgeIndex);
  return [...matched]
    .sort((a, b) => a - b)
    .map((e) => ({
      sourceId: graph.edges[e].sourceId,
      targetId: graph.edges[e].targetId,
      edgeId: graph.edges[e].id,
    }));
}
