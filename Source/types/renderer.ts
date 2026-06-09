import { THEME } from '../constants/renderer/shared';
import {
  ENTITY_COLORS_DARK,
  NODE_RANK_DIR,
  GRAPH_LAYOUT_NAMES,
  EDGE_COLORS_DARK,
  PROCESSING_STATUS
} from '../constants/renderer/project';

type EntityColorKey = keyof typeof ENTITY_COLORS_DARK; // Read keys from graph color maps into a type

type NodeRankDir = (typeof NODE_RANK_DIR)[keyof typeof NODE_RANK_DIR];

type EdgeColorKeys = keyof typeof EDGE_COLORS_DARK; // Read keys from edge color maps into a type

export type EdgeColorMap = Record<EdgeColorKeys, string>; // Define a type for the edge color map using the keys from the edge color maps

export type EntityColorMap = Record<EntityColorKey, string>; // Define a type for the color map using the keys from the graph color maps

export type LoginTab = 'signin' | 'signup';

export type Theme = (typeof THEME)[keyof typeof THEME];

export type EdgeData = { id: string; source: string; target: string; label: string };

export type NodeData = { id: string; label: string; type: string; docCount: number };

export type GraphLayoutName = (typeof GRAPH_LAYOUT_NAMES)[keyof typeof GRAPH_LAYOUT_NAMES];

export type GraphLayoutOptions = {
  name: GraphLayoutName;
  animate: boolean;
  padding: number;
  directed?: boolean;
  circle?: boolean;
  avoidOverlap?: boolean;
  nodeRepulsion?: number | (() => number);
  idealEdgeLength?: number | (() => number);
  gravity?: number;
  gravityRange?: number;
  randomize?: boolean;
  concentric?: (n: { connectedEdges(): { length: number } }) => number;
  levelWidth?: () => number;
  spacingFactor?: number;
  minNodeSpacing?: number;
  rankDir?: NodeRankDir;
  nodeSep?: number;
  rankSep?: number;
};

export type ProcessingStatus = (typeof PROCESSING_STATUS)[keyof typeof PROCESSING_STATUS];
