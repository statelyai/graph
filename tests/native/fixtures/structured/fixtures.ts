import type { SerializedGraph } from 'graphology-types';

/** Authored native fixture; deliberately independent of every converter. */
export function createGraphologyNativeFixture(): SerializedGraph {
  return {
    options: { type: 'mixed', multi: true, allowSelfLoops: true },
    attributes: { title: '混合 graph', data: ['root', null], __statelyai: { foreign: true } },
    nodes: [
      { key: 'a', attributes: { label: '', data: null } },
      { key: 'b', attributes: { label: '雪 🙂', data: ['array', 2] } },
      { key: '', attributes: { label: 'empty ID', data: 42 } },
      { key: 'isolated', attributes: { label: null, x: 3 } },
    ],
    edges: [
      { key: 'parallel 1', source: 'a', target: 'b', attributes: { weight: 1, label: '' } },
      { key: 'parallel 2', source: 'a', target: 'b', attributes: { weight: 2, data: null } },
      { key: 'undirected', source: 'b', target: '', undirected: true, attributes: { data: [1, 2] } },
      { key: 'loop', source: '', target: '', attributes: { label: 'loop' } },
    ],
  };
}

/** Graphlib has a global orientation; mixedness is not inferred from labels. */
export function createGraphlibNativeFixture(directed = true) {
  return {
    options: { directed, multigraph: true, compound: true },
    value: { label: 'Graphlib', data: null, __statelyai: { foreign: true } },
    nodes: [
      { v: 'parent', value: { label: '' } },
      { v: 'a', parent: 'parent', value: { data: ['array', null] } },
      { v: '', value: 42 },
      { v: 'isolated', value: null },
    ],
    edges: [
      { v: 'a', w: '', name: 'first', value: { weight: 1, label: '' } },
      { v: 'a', w: '', name: 'second', value: ['edge', null] },
      { v: '', w: '', name: 'loop', value: null },
    ],
  };
}
