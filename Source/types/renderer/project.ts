import { GRAPH_LAYOUT_NAMES, NODE_RANK_DIR } from '../../constants/renderer/project/graph';

export type GraphLayoutName = (typeof GRAPH_LAYOUT_NAMES)[keyof typeof GRAPH_LAYOUT_NAMES];

export type NodeRankDir = (typeof NODE_RANK_DIR)[keyof typeof NODE_RANK_DIR];
