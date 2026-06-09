export const PROJECT_ERRORS = {
    FULL_TEXT_UNAVIALABLE: 'Full text not available.',
    MISSING_SHARE_USERNAME: 'Please enter a username.',
    DOC_LOAD_FAILURE: 'Failed to load documents.',
    DOC_UPLOAD_FAILURE: 'Upload failed .',
    DOC_DELETE_FAILURE: 'Failed to delete document.',
    GRAPH_RETRY_FAILURE: 'Graph retry failed.',
    GRAPH_LOAD_FAILURE: 'Failed to load graph.',
    GRAPH_RELOAD_FAILURE: 'Failed to reload graph.',
    FAILED_TO_LOAD_NODE_DETAIL: 'Failed to load node details.',
    SEARCH_FAILURE: 'Search failed.',
    UNEXPECTED_ERROR: 'An unexpected error occurred.',
    SHARE_MEMEBER_RETREIVAL_FAILURE: 'Failed to load members.',
    PROJECT_SHARE_FAILURE: 'Failed to share project.',
    PROJECT_UNSHARE_FAILURE: 'Failed to remove access.',
    MEMBER_ROLE_UPDATE_FAILURE: 'Failed to update role.',
} as const;

export const DEFAULT_GRAPH_LAYOUT = 'cose';

export const PROCESSING_STATUS = {
  UNPROCESSED: 'UNPROCESSED',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
  GRAPH_FAILED: 'GRAPH_FAILED'
} as const;

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
  Task: '#fb923c',
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
  Task: '#c2410c',
  Other: '#78716c',
} as const;

export const GRAPH_LAYOUTS = new Map([
    ['dagre', { 
        name: GRAPH_LAYOUT_NAMES.DAGRE, 
        animate: false, 
        rankDir: NODE_RANK_DIR.TOP_TO_BOTTOM, 
        nodeSep: 60, 
        rankSep: 80, 
        padding: 24 
    }],
    ['concentric', { 
        name: GRAPH_LAYOUT_NAMES.CONCENTRIC, 
        animate: false, 
        concentric: (n: { connectedEdges(): { length: number } }) => n.connectedEdges().length,
        levelWidth: () => 2, 
        minNodeSpacing: 40, 
        padding: 24 
    }],
    ['radial', {
        name: GRAPH_LAYOUT_NAMES.BREADTHFIRST,
        animate: false,
        directed: false,
        circle: true,
        spacingFactor: 1.75,
        padding: 24
    }],
    ['tree', {
        name: GRAPH_LAYOUT_NAMES.BREADTHFIRST,
        animate: false,
        directed: false,
        circle: false,
        spacingFactor: 1.5,
        padding: 24
    }],
    ['circle', { 
        name: GRAPH_LAYOUT_NAMES.CIRCLE, 
        animate: false, 
        padding: 24 
    }],
    ['grid', { 
        name: GRAPH_LAYOUT_NAMES.GRID, 
        animate: false, 
        padding: 24, 
        avoidOverlap: true 
    }],
    ['cose', {
        name: GRAPH_LAYOUT_NAMES.COSE,
        animate: false,
        nodeRepulsion: () => 4096,
        idealEdgeLength: () => 100,
        padding: 24
    }],
    ['fcose', {
        name: GRAPH_LAYOUT_NAMES.FCOSE,
        animate: false,
        nodeRepulsion: 4500,
        idealEdgeLength: 100,
        gravity: 0.25,
        gravityRange: 3.8,
        padding: 24,
        randomize: false
    }]
]);