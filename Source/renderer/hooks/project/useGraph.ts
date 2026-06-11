import { useState, useCallback, useRef, useEffect } from 'react';

import { GraphNode, GraphEdge } from '../../../interfaces/renderer/project/graph';
import { DEFAULT_GRAPH_LAYOUT } from '../../../constants/renderer/project/graph';
import { syncAndLoadGraph, loadGraphWithFilter } from '../../handlers/project/graph';

export function useGraph(projectId: string, initialMinDocs: number) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSyncedData, setHasSyncedData] = useState(false);
  const [layout, setLayout] = useState(DEFAULT_GRAPH_LAYOUT);
  const [minDocs, setMinDocs] = useState(initialMinDocs);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const minDocsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadGraph = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const result = await syncAndLoadGraph(projectId, minDocs);
    setHasSyncedData(result.hasSyncedData);
    setNodes(result.nodes ?? []);
    setEdges(result.edges ?? []);
    setLoading(false);
  }, [projectId, minDocs]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const reloadWithFilter = useCallback(
    async (newMinDocs: number) => {
      if (!projectId || !hasSyncedData) return;
      setLoading(true);
      const result = await loadGraphWithFilter(projectId, newMinDocs);
      setNodes(result.nodes ?? []);
      setEdges(result.edges ?? []);
      setLoading(false);
    },
    [projectId, hasSyncedData]
  );

  const handleMinDocsChange = useCallback(
    (value: number) => {
      const clamped = isNaN(value) || value < 2 ? 2 : value;
      setMinDocs(clamped);
      if (minDocsTimerRef.current) clearTimeout(minDocsTimerRef.current);
      minDocsTimerRef.current = setTimeout(() => {
        void reloadWithFilter(clamped);
        void window.electron.projects.setMinDocFilter(projectId, clamped);
      }, 400);
    },
    [projectId, reloadWithFilter]
  );

  const toggleHiddenType = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  return {
    nodes,
    edges,
    loading,
    hasSyncedData,
    layout,
    setLayout,
    minDocs,
    handleMinDocsChange,
    hiddenTypes,
    toggleHiddenType,
    isExpanded,
    setIsExpanded,
    loadGraph,
  };
}
