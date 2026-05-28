import type { Graph } from '../src/types';

export function getFullyFeaturedGraphFixture(): Graph {
  return {
    id: 'full-graph',
    mode: 'directed',
    initialNodeId: 'root',
    direction: 'right',
    style: {
      theme: 'dark',
      zoom: 1.5,
    },
    nodes: [
      {
        type: 'node',
        id: 'root',
        parentId: null,
        initialNodeId: 'child-a',
        label: 'Root',
        data: {
          role: 'root',
        },
        x: 10,
        y: 20,
        width: 120,
        height: 80,
        shape: 'rectangle',
        color: '#111111',
        style: {
          fontSize: 14,
          variant: 'primary',
        },
      },
      {
        type: 'node',
        id: 'child-a',
        parentId: 'root',
        initialNodeId: null,
        label: 'Child A',
        data: {
          index: 1,
        },
        x: 40,
        y: 60,
        width: 90,
        height: 50,
        shape: 'ellipse',
        color: '#222222',
        style: {
          collapsed: 0,
          accent: 'blue',
        },
        ports: [
          {
            name: 'out',
            direction: 'out',
            label: 'Output',
            data: {
              kind: 'event',
            },
            x: 130,
            y: 85,
            width: 8,
            height: 8,
            style: {
              side: 'right',
            },
          },
        ],
      },
      {
        type: 'node',
        id: 'child-b',
        parentId: 'root',
        initialNodeId: null,
        label: 'Child B',
        data: {
          index: 2,
        },
        x: 160,
        y: 60,
        width: 90,
        height: 50,
        shape: 'diamond',
        color: '#333333',
        style: {
          collapsed: 1,
          accent: 'green',
        },
        ports: [
          {
            name: 'in',
            direction: 'in',
            label: 'Input',
            data: {
              kind: 'event',
            },
            x: 152,
            y: 85,
            width: 8,
            height: 8,
            style: {
              side: 'left',
            },
          },
        ],
      },
    ],
    edges: [
      {
        type: 'edge',
        id: 'e1',
        sourceId: 'child-a',
        targetId: 'child-b',
        sourcePort: 'out',
        targetPort: 'in',
        label: 'A to B',
        weight: 2.5,
        data: {
          kind: 'transition',
        },
        x: 100,
        y: 65,
        width: 40,
        height: 10,
        color: '#444444',
        style: {
          dash: 2,
          arrow: 'closed',
        },
      },
      {
        type: 'edge',
        id: 'e2',
        sourceId: 'child-b',
        targetId: 'child-a',
        label: 'B to A',
        weight: 0,
        data: {
          kind: 'return',
        },
        x: 100,
        y: 95,
        width: 40,
        height: 10,
        color: '#555555',
        style: {
          dash: 0,
          arrow: 'open',
        },
      },
    ],
    data: {
      version: 1,
      tags: ['fixture'],
    },
  };
}
