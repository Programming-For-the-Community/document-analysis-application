import { PROJECT_ERRORS } from '../../../constants/renderer/project';
import { GraphNode, GraphEdge } from '../../../interfaces/renderer/project';

export async function syncAndLoadGraph(
  projectId: string,
  minDocCount: number
): Promise<{
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  error: string | null;
  hasSyncedData: boolean;
}> {
  try {
    await window.electron.graph.syncProject(projectId);
    const result = await window.electron.graph.getProjectGraph(projectId, minDocCount);
    if (!result.success || !result.nodes || !result.edges || result.nodes.length === 0) {
      return { error: null, hasSyncedData: true };
    }
    return { nodes: result.nodes, edges: result.edges, error: null, hasSyncedData: true };
  } catch {
    return { error: PROJECT_ERRORS.GRAPH_RELOAD_FAILURE, hasSyncedData: false };
  }
}

export async function loadGraphWithFilter(
  projectId: string,
  minDocCount: number
): Promise<{ nodes?: GraphNode[]; edges?: GraphEdge[]; error: string | null }> {
  try {
    const result = await window.electron.graph.getProjectGraph(projectId, minDocCount);
    if (!result.success || !result.nodes || !result.edges || result.nodes.length === 0) {
      return { error: null };
    }
    return { nodes: result.nodes, edges: result.edges, error: null };
  } catch {
    return { error: PROJECT_ERRORS.GRAPH_RELOAD_FAILURE };
  }
}

export async function fetchNodeDetail(
  projectId: string,
  entityName: string,
  entityType: string
): Promise<{
  connections?: Array<{
    relType: string;
    otherName: string;
    otherType: string;
    direction: 'out' | 'in';
  }>;
  documents?: Array<{ documentId: string; documentName: string }>;
  error: string | null;
}> {
  const result = await window.electron.graph.getNodeDetail(projectId, entityName, entityType);
  if (!result.success) return { error: result.error ?? PROJECT_ERRORS.FAILED_TO_LOAD_NODE_DETAIL };
  return { connections: result.connections, documents: result.documents, error: null };
}
