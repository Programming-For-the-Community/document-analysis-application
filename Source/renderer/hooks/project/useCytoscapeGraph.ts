import { useEffect, useRef } from 'react';

import { GraphEdge, GraphNode } from '../../../interfaces/renderer/project/graph';
import { Theme } from '../../../types/renderer/shared';
import {
  CyInstance,
  applyTypeFilters,
  createCenteringResizeObserver,
  createCytoscape,
  getGraphStyle,
  wireGraphHover,
} from '../../../utils/renderer/graph';

interface CytoscapeGraphOptions {
  // false while the view isn't shown (e.g. the expand modal is closed)
  enabled: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: string;
  theme: Theme;
  hiddenTypes: Set<string>;
  onNodeClick: (entityName: string, entityType: string) => void;
}

// Owns the Cytoscape instance behind a graph view (GraphPanel, GraphExpandModal):
// creates it in containerRef when the data changes, wires hover tooltips (into
// tooltipRef) and node taps, and applies theme / type-filter changes in place.
export function useCytoscapeGraph({
  enabled,
  nodes,
  edges,
  layout,
  theme,
  hiddenTypes,
  onNodeClick,
}: CytoscapeGraphOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<CyInstance | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container || nodes.length === 0) return;

    const cy = createCytoscape(container, nodes, edges, layout, theme);
    cyRef.current = cy;
    wireGraphHover(cy, container, tooltipRef.current);
    cy.on('tap', 'node', (e) => {
      tooltipRef.current?.classList.add('hidden');
      cy.elements().removeClass('faded labelled');
      onNodeClick(String(e.target.data('label')), String(e.target.data('type')));
    });
    applyTypeFilters(cy, hiddenTypes);
    const observer = createCenteringResizeObserver(cy, container);

    return () => {
      observer.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
    // theme/hiddenTypes are applied to the live instance by the effects below
    // rather than recreating it. layout is only the initial layout — switching
    // later runs cy.layout() directly (LayoutControls).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nodes, edges]);

  useEffect(() => {
    cyRef.current?.style(getGraphStyle(theme));
  }, [theme]);

  useEffect(() => {
    if (cyRef.current) applyTypeFilters(cyRef.current, hiddenTypes);
  }, [hiddenTypes]);

  return { containerRef, tooltipRef, cyRef };
}
