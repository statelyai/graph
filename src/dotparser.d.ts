declare module 'dotparser' {
  interface DotAttr {
    type: 'attr';
    id: string;
    eq: string | number;
  }

  interface DotNodeId {
    type: 'node_id';
    id: string;
  }

  interface DotNodeStmt {
    type: 'node_stmt';
    node_id: DotNodeId;
    attr_list: DotAttr[];
  }

  interface DotEdgeStmt {
    type: 'edge_stmt';
    edge_list: (DotNodeId | DotSubgraph)[];
    attr_list: DotAttr[];
  }

  interface DotAttrStmt {
    type: 'attr_stmt';
    target: 'graph' | 'node' | 'edge';
    attr_list: DotAttr[];
  }

  interface DotSubgraph {
    type: 'subgraph';
    id?: string;
    children: DotStmt[];
  }

  type DotStmt = DotNodeStmt | DotEdgeStmt | DotAttrStmt | DotSubgraph;

  interface DotGraph {
    type: 'graph' | 'digraph';
    id?: string;
    children: DotStmt[];
  }

  function parse(input: string): DotGraph[];
  export = parse;
}
