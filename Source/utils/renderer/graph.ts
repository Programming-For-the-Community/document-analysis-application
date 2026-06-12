import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import dagre from 'cytoscape-dagre';

import { THEME } from '../../constants/renderer/shared';
import { GraphEdge, GraphNode, GraphLayoutOptions } from '../../interfaces/renderer/project/graph';
import { Theme, EntityColorMap, EdgeColorMap } from '../../types/renderer/shared';
import { ENTITY_COLORS_DARK, ENTITY_COLORS_PARCHMENT, GRAPH_LAYOUTS, EDGE_COLORS_DARK, EDGE_COLORS_PARCHMENT, DEFAULT_GRAPH_LAYOUT } from '../../constants/renderer/project/graph';

export type CyInstance = cytoscape.Core;

cytoscape.use(fcose);
cytoscape.use(dagre);

export function getEntityColors(theme: Theme): EntityColorMap {
  return theme === THEME.LIGHT ? ENTITY_COLORS_PARCHMENT : ENTITY_COLORS_DARK;
}

export function getGraphStyle(theme: Theme): cytoscape.StylesheetJsonBlock[] {
  const edgeColors: EdgeColorMap = theme === THEME.LIGHT ? EDGE_COLORS_PARCHMENT : EDGE_COLORS_DARK;
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        label: 'data(label)',
        color: '#ffffff',
        'font-size': 'data(fontSize)',
        'text-valign': 'center',
        'text-halign': 'center',
        width: 'data(size)',
        height: 'data(size)',
        'text-wrap': 'wrap',
        'text-max-width': 'data(textMaxWidth)',
      },
    },
    { selector: 'node.faded', style: { opacity: 0.12 } },
    {
      selector: 'node.highlighted',
      style: { 'border-width': 3, 'border-color': '#ffffff', 'border-opacity': 0.7 },
    },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': edgeColors.LINE,
        'target-arrow-color': edgeColors.LINE,
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        label: '',
        'font-size': '9px',
        color: edgeColors.LABEL,
        'text-rotation': 'autorotate',
        'text-margin-y': -8,
        'text-background-color': edgeColors.LABEL_BG,
        'text-background-opacity': 0.75,
        'text-background-padding': '2px',
      },
    },
    { selector: 'edge.faded', style: { opacity: 0.05 } },
    { selector: 'edge.labelled', style: { label: 'data(label)' } },
  ];
}

export function getLayoutConfig(name: string): Omit<GraphLayoutOptions, 'description'> {
  let layoutOptions: GraphLayoutOptions = GRAPH_LAYOUTS.get(DEFAULT_GRAPH_LAYOUT)!;

  if (GRAPH_LAYOUTS.has(name)) {
    layoutOptions = GRAPH_LAYOUTS.get(name)!;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { description, ...config } = layoutOptions;
  return config;
}

export function calcDegreeMap(edges: GraphEdge[]): { map: Map<string, number>; max: number } {
  const map = new Map<string, number>();
  edges.forEach((e) => {
    map.set(e.data.source, (map.get(e.data.source) ?? 0) + 1);
    map.set(e.data.target, (map.get(e.data.target) ?? 0) + 1);
  });
  return { map, max: Math.max(1, ...map.values()) };
}

export function buildGraphElements(
  nodes: GraphNode[],
  edges: GraphEdge[],
  degMap: Map<string, number>,
  maxDeg: number,
  theme: Theme
): unknown[] {
  const colors: EntityColorMap = getEntityColors(theme);
  return [
    ...nodes.map((n) => {
      const deg = degMap.get(n.data.id) ?? 0;
      const ratio = maxDeg > 0 ? deg / maxDeg : 0;
      const size = 36 + Math.round(ratio * 44);
      const fontSize = 9 + Math.round(ratio * 8);
      // Cast so colors[type] type-checks; colors[type] ?? colors['Other'] below
      // handles entity types that aren't in the color map.
      const type = n.data.type as keyof EntityColorMap;
      return {
        data: {
          id: n.data.id,
          label: n.data.label,
          type: n.data.type,
          docCount: n.data.docCount,
          color: colors[type] ?? colors['Other'],
          size,
          fontSize: `${fontSize}px`,
          textMaxWidth: `${size - 6}px`,
        },
      };
    }),
    ...edges.map((e) => ({
      data: { id: e.data.id, source: e.data.source, target: e.data.target, label: e.data.label },
    })),
  ];
}

export function createCytoscape(
  container: HTMLElement,
  nodes: GraphNode[],
  edges: GraphEdge[],
  layout: string,
  theme: Theme
): CyInstance {
  const { map, max } = calcDegreeMap(edges);
  return cytoscape({
    container,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    elements: buildGraphElements(nodes, edges, map, max, theme) as any,
    style: getGraphStyle(theme),
    layout: getLayoutConfig(layout),
  });
}

export function wireGraphHover(
  cy: CyInstance,
  container: HTMLElement,
  tooltipEl: HTMLElement | null
): void {
  cy.on('mouseover', 'node', (e: cytoscape.EventObjectNode) => {
    const node = e.target;
    const rendPos = e.renderedPosition;
    const rect = container.getBoundingClientRect();
    const hoveredLabel = String(node.data('label'));
    if (tooltipEl) {
      const docCount = Number(node.data('docCount'));
      tooltipEl.innerHTML = `
        <div class="graph-tooltip-type">${node.data('type')}</div>
        <div class="graph-tooltip-value">${node.data('label')}</div>
        <div class="graph-tooltip-docs">${docCount} doc${docCount !== 1 ? 's' : ''}</div>`;
      tooltipEl.style.left = `${rect.left + rendPos.x}px`;
      tooltipEl.style.top = `${rect.top + rendPos.y}px`;
      tooltipEl.classList.remove('hidden');
    }
    // Node ids are "name:type", so the same name can appear as separate nodes
    // under different entity types. Highlight all of them plus each of their
    // connected components, so hovering shows all context for that name.
    const sameNodes = cy.nodes().filter((n) => String(n.data('label')) === hoveredLabel);
    const highlightedIds = new Set<string>();
    sameNodes.forEach((n) => {
      highlightedIds.add(String(n.data('id')));
    });
    for (const comp of cy.elements().components()) {
      let matchFound = false;
      sameNodes.forEach((n) => {
        if (comp.has(n)) matchFound = true;
      });
      if (matchFound)
        cy.nodes()
          .filter((n) => comp.has(n))
          .forEach((n) => {
            highlightedIds.add(String(n.data('id')));
          });
    }
    const highlightNodes = cy.nodes().filter((n) => highlightedIds.has(String(n.data('id'))));
    const highlightEdges = cy
      .edges()
      .filter(
        (e) =>
          highlightedIds.has(String(e.data('source'))) &&
          highlightedIds.has(String(e.data('target')))
      );
    cy.elements().not(highlightNodes.union(highlightEdges)).addClass('faded');
    highlightNodes.union(highlightEdges).edges().addClass('labelled');
  });
  cy.on('mouseout', 'node', () => {
    tooltipEl?.classList.add('hidden');
    cy.elements().removeClass('faded labelled');
  });
  cy.on('mouseover', 'edge', (e: cytoscape.EventObjectEdge) => {
    e.target.addClass('labelled');
  });
  cy.on('mouseout', 'edge', (e: cytoscape.EventObjectEdge) => {
    e.target.removeClass('labelled');
  });
}

// eles.hide()/eles.show() exist at runtime but are missing from the bundled cytoscape types.
type Toggleable = { hide(): void; show(): void };

export function applyTypeFilters(cy: CyInstance, hiddenTypes: Set<string>): void {
  (cy.nodes() as unknown as Toggleable).show();
  (cy.edges() as unknown as Toggleable).show();
  for (const type of hiddenTypes) {
    const ns = cy.nodes(`[type="${type}"]`);
    (ns as unknown as Toggleable).hide();
    (ns.connectedEdges() as unknown as Toggleable).hide();
  }
}

export function createCenteringResizeObserver(
  cy: CyInstance,
  container: HTMLElement
): ResizeObserver {
  let prevW = container.clientWidth;
  let prevH = container.clientHeight;
  const observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const pan = cy.pan();
    cy.resize();
    cy.pan({ x: pan.x + (rect.width - prevW) / 2, y: pan.y + (rect.height - prevH) / 2 });
    prevW = rect.width;
    prevH = rect.height;
  });
  observer.observe(container);
  return observer;
}
