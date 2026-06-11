import { Theme } from '../../../types/renderer/shared';
import { GraphLayoutName, NodeRankDir } from '../../../types/renderer/project';

export interface NodeData {
  id: string;
  label: string;
  type: string;
  docCount: number;
}

export interface EdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface GraphNode {
  data: NodeData;
}

export interface GraphEdge {
  data: EdgeData;
}

export interface GraphLayoutOptions {
  name: GraphLayoutName;
  description: string;
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
}

export interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: string;
  minDocs: number;
  hiddenTypes: Set<string>;
  theme: Theme;
  onLayoutChange: (layout: string) => void;
  onMinDocsChange: (value: number) => void;
  onToggleHiddenType: (type: string) => void;
  onNodeClick: (entityName: string, entityType: string) => void;
}

export interface GraphExpandModalProps extends GraphViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface GraphPanelProps extends GraphViewProps {
  loading: boolean;
  hasSyncedData: boolean;
  onExpand: () => void;
}
