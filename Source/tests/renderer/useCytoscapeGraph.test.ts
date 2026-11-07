// @vitest-environment happy-dom
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphEdge, GraphNode } from '../../interfaces/renderer/project/graph';

const graph = vi.hoisted(() => ({
  createCytoscape: vi.fn(),
  wireGraphHover: vi.fn(),
  applyTypeFilters: vi.fn(),
  createCenteringResizeObserver: vi.fn(),
  getGraphStyle: vi.fn((theme: string) => `style:${theme}`),
}));
vi.mock('../../utils/renderer/graph', () => graph);

import { useCytoscapeGraph } from '../../renderer/hooks/project/useCytoscapeGraph';

const nodes: GraphNode[] = [
  { data: { id: 'Jane:Person', label: 'Jane', type: 'Person', docCount: 2 } },
];
const edges: GraphEdge[] = [];

type Props = Omit<Parameters<typeof useCytoscapeGraph>[0], 'onNodeClick'>;

function makeCy() {
  const handlers: Record<string, (e: unknown) => void> = {};
  return {
    handlers,
    on: vi.fn((event: string, _selector: string, fn: (e: unknown) => void) => {
      handlers[event] = fn;
    }),
    elements: vi.fn(() => ({ removeClass: vi.fn() })),
    style: vi.fn(),
    destroy: vi.fn(),
  };
}

let cy: ReturnType<typeof makeCy>;
let observer: { disconnect: ReturnType<typeof vi.fn> };
let result: ReturnType<typeof useCytoscapeGraph>;
const onNodeClick = vi.fn();

// Renders the hook into a real container + tooltip, as the graph views do
function Harness(props: Props) {
  result = useCytoscapeGraph({ ...props, onNodeClick });
  return createElement(
    'div',
    null,
    createElement('div', { ref: result.containerRef }),
    createElement('div', { ref: result.tooltipRef, className: 'graph-tooltip' })
  );
}

const base: Props = {
  enabled: true,
  nodes,
  edges,
  layout: 'Grid',
  theme: 'slate',
  hiddenTypes: new Set(),
};

beforeEach(() => {
  cy = makeCy();
  observer = { disconnect: vi.fn() };
  graph.createCytoscape.mockReturnValue(cy);
  graph.createCenteringResizeObserver.mockReturnValue(observer);
});

describe('useCytoscapeGraph', () => {
  it('creates and wires an instance, and tears it down on unmount', () => {
    const { unmount } = render(createElement(Harness, base));

    const container = result.containerRef.current;
    expect(graph.createCytoscape).toHaveBeenCalledWith(container, nodes, edges, 'Grid', 'slate');
    expect(graph.wireGraphHover).toHaveBeenCalledWith(cy, container, result.tooltipRef.current);
    expect(graph.applyTypeFilters).toHaveBeenCalledWith(cy, base.hiddenTypes);
    expect(result.cyRef.current).toBe(cy);

    unmount();
    expect(observer.disconnect).toHaveBeenCalled();
    expect(cy.destroy).toHaveBeenCalled();
  });

  it('hides the tooltip and reports the entity when a node is tapped', () => {
    render(createElement(Harness, base));
    const data = { label: 'Jane', type: 'Person' } as Record<string, string>;

    act(() => cy.handlers['tap']!({ target: { data: (k: string) => data[k] } }));

    expect(result.tooltipRef.current?.classList.contains('hidden')).toBe(true);
    expect(onNodeClick).toHaveBeenCalledWith('Jane', 'Person');
  });

  it('builds nothing while disabled or empty', () => {
    render(createElement(Harness, { ...base, enabled: false }));
    render(createElement(Harness, { ...base, nodes: [] }));

    expect(graph.createCytoscape).not.toHaveBeenCalled();
    expect(result.cyRef.current).toBeNull();
  });

  it('applies theme and type-filter changes to the live instance', () => {
    const { rerender } = render(createElement(Harness, base));
    const hidden = new Set(['Person']);

    rerender(createElement(Harness, { ...base, theme: 'parchment', hiddenTypes: hidden }));

    expect(cy.style).toHaveBeenCalledWith('style:parchment');
    expect(graph.applyTypeFilters).toHaveBeenLastCalledWith(cy, hidden);
    expect(graph.createCytoscape).toHaveBeenCalledTimes(1);
  });
});
