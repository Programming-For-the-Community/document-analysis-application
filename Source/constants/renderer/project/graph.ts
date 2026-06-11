export const DEFAULT_GRAPH_LAYOUT = 'Classic';

export const NODE_RANK_DIR = {
  TOP_TO_BOTTOM: 'TB',
  LEFT_TO_RIGHT: 'LR',
  BOTTOM_TO_TOP: 'BT',
  RIGHT_TO_LEFT: 'RL',
} as const;

export const GRAPH_LAYOUT_NAMES = {
  COSE: 'cose',
  FCOSE: 'fcose',
  BREADTHFIRST: 'breadthfirst',
  DAGRE: 'dagre',
  CONCENTRIC: 'concentric',
  CIRCLE: 'circle',
  GRID: 'grid',
} as const;

export const EDGE_COLORS_DARK = {
    LINE: '#52525b',
    LABEL: '#a1a1aa',
    LABEL_BG: '#27272a'
} as const;

export const EDGE_COLORS_PARCHMENT = {
    LINE: '#c4a97d',
    LABEL: '#78716c',
    LABEL_BG: '#fffdf7'
} as const;

export const ENTITY_COLORS_DARK = {
  Person: '#60a5fa',
  Organization: '#34d399',
  Date: '#fbbf24',
  Amount: '#a78bfa',
  Location: '#f87171',
  Product: '#22d3ee',
  Role: '#fb923c',
  Account: '#f472b6',
  Event: '#2dd4bf',
  Technology: '#818cf8',
  Concept: '#a3e635',
  Regulation: '#fb7185',
  Agreement: '#c084fc',
  Asset: '#38bdf8',
  Task: '#4ade80',
  Other: '#a1a1aa',
} as const;

export const ENTITY_COLORS_PARCHMENT = {
  Person: '#1d4ed8',
  Organization: '#047857',
  Date: '#b45309',
  Amount: '#6d28d9',
  Location: '#b91c1c',
  Product: '#0e7490',
  Role: '#c2410c',
  Account: '#be185d',
  Event: '#0f766e',
  Technology: '#4338ca',
  Concept: '#4d7c0f',
  Regulation: '#be123c',
  Agreement: '#7e22ce',
  Asset: '#0369a1',
  Task: '#15803d',
  Other: '#78716c',
} as const;

export const GRAPH_LAYOUTS = new Map([
    ['Hierarchical', {
        name: GRAPH_LAYOUT_NAMES.DAGRE,
        description: 'Layered rank-based layout (dagre).',
        animate: false,
        rankDir: NODE_RANK_DIR.TOP_TO_BOTTOM,
        nodeSep: 60,
        rankSep: 80,
        padding: 24
    }],
    ['Concentric', {
        name: GRAPH_LAYOUT_NAMES.CONCENTRIC,
        description: 'Most-connected nodes at center.',
        animate: false,
        concentric: (n: { connectedEdges(): { length: number } }) => n.connectedEdges().length,
        levelWidth: () => 2,
        minNodeSpacing: 40,
        padding: 24
    }],
    ['Radial', {
        name: GRAPH_LAYOUT_NAMES.BREADTHFIRST,
        description: 'Root node at center with rings radiating outward.',
        animate: false,
        directed: false,
        circle: true,
        spacingFactor: 1.75,
        padding: 24
    }],
    ['Tree', {
        name: GRAPH_LAYOUT_NAMES.BREADTHFIRST,
        description: 'Top-down breadth-first tree.',
        animate: false,
        directed: false,
        circle: false,
        spacingFactor: 1.5,
        padding: 24
    }],
    ['Circle', {
        name: GRAPH_LAYOUT_NAMES.CIRCLE,
        description: 'Nodes evenly spaced on a single circle.',
        animate: false,
        padding: 24
    }],
    ['Grid', {
        name: GRAPH_LAYOUT_NAMES.GRID,
        description: 'Nodes arranged in a uniform rectangular grid.',
        animate: false,
        padding: 24,
        avoidOverlap: true
    }],
    ['Classic', {
        name: GRAPH_LAYOUT_NAMES.COSE,
        description: 'Balanced force-directed layout.',
        animate: false,
        nodeRepulsion: () => 4096,
        idealEdgeLength: () => 100,
        padding: 24
    }],
    ['Force', {
        name: GRAPH_LAYOUT_NAMES.FCOSE,
        description: 'Faster force-directed (fcose). Better for large graphs.',
        animate: false,
        nodeRepulsion: 4500,
        idealEdgeLength: 100,
        gravity: 0.25,
        gravityRange: 3.8,
        padding: 24,
        randomize: false
    }]
]);
