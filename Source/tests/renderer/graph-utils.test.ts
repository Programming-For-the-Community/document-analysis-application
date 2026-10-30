// @vitest-environment happy-dom
import cytoscape from 'cytoscape';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyTypeFilters,
  buildGraphElements,
  calcDegreeMap,
  createCenteringResizeObserver,
  createCytoscape,
  getEntityColors,
  getGraphStyle,
  getLayoutConfig,
  wireGraphHover,
} from '../../utils/renderer/graph';
import {
  DEFAULT_GRAPH_LAYOUT,
  EDGE_COLORS_DARK,
  EDGE_COLORS_PARCHMENT,
  ENTITY_COLORS_DARK,
  ENTITY_COLORS_PARCHMENT,
  GRAPH_LAYOUTS,
} from '../../constants/renderer/project/graph';
import { GraphEdge, GraphNode } from '../../interfaces/renderer/project/graph';
import { parseJwt } from '../../utils/renderer/parseJwt';
import { getUser } from '../../utils/renderer/getUser';
import { makeIdToken } from '../helpers';
import { installElectronApi } from './electron-api';

const byText = (a: string, b: string) => a.localeCompare(b);

const nodes: GraphNode[] = [
  { data: { id: 'Jane:Person', label: 'Jane', type: 'Person', docCount: 3 } },
  { data: { id: 'Jane:Organization', label: 'Jane', type: 'Organization', docCount: 1 } },
  { data: { id: 'Acme:Organization', label: 'Acme', type: 'Organization', docCount: 2 } },
  { data: { id: 'Bob:Person', label: 'Bob', type: 'Person', docCount: 2 } },
  { data: { id: 'Zed:Mystery', label: 'Zed', type: 'Mystery', docCount: 2 } },
];
const edges: GraphEdge[] = [
  { data: { id: 'e1', source: 'Jane:Person', target: 'Acme:Organization', label: 'EMPLOYED_BY' } },
  { data: { id: 'e2', source: 'Bob:Person', target: 'Acme:Organization', label: 'EMPLOYED_BY' } },
];

describe('graph styling helpers', () => {
  it('picks entity and edge colours per theme', () => {
    expect(getEntityColors('parchment')).toBe(ENTITY_COLORS_PARCHMENT);
    expect(getEntityColors('slate')).toBe(ENTITY_COLORS_DARK);

    const edgeStyle = (theme: 'parchment' | 'slate') =>
      (
        getGraphStyle(theme).find((s) => s.selector === 'edge') as unknown as {
          style: Record<string, unknown>;
        }
      ).style;
    expect(edgeStyle('parchment')['line-color']).toBe(EDGE_COLORS_PARCHMENT.LINE);
    expect(edgeStyle('slate')['line-color']).toBe(EDGE_COLORS_DARK.LINE);
  });

  it('returns layout options without the description, defaulting unknown names', () => {
    const [name] = [...GRAPH_LAYOUTS.keys()].filter((n) => n !== DEFAULT_GRAPH_LAYOUT);
    expect(getLayoutConfig(name!)).toMatchObject({ name: GRAPH_LAYOUTS.get(name!)!.name });
    expect(getLayoutConfig(name!)).not.toHaveProperty('description');
    expect(getLayoutConfig('No Such Layout')).toEqual(getLayoutConfig(DEFAULT_GRAPH_LAYOUT));
  });

  it('counts node degrees', () => {
    const { map, max } = calcDegreeMap(edges);
    expect(Object.fromEntries(map)).toEqual({
      'Jane:Person': 1,
      'Acme:Organization': 2,
      'Bob:Person': 1,
    });
    expect(max).toBe(2);
    expect(calcDegreeMap([]).max).toBe(1);
  });

  it('sizes nodes by degree and colours them by type', () => {
    const { map, max } = calcDegreeMap(edges);
    const elements = buildGraphElements(nodes, edges, map, max, 'slate') as Array<{
      data: Record<string, unknown>;
    }>;

    const byId = Object.fromEntries(elements.map((e) => [e.data['id'], e.data]));
    expect(byId['Acme:Organization']).toMatchObject({
      size: 80,
      fontSize: '17px',
      textMaxWidth: '74px',
      color: ENTITY_COLORS_DARK.Organization,
    });
    expect(byId['Jane:Organization']).toMatchObject({ size: 36, fontSize: '9px' });
    expect(byId['Zed:Mystery']!['color']).toBe(ENTITY_COLORS_DARK.Other);
    expect(byId['e1']).toEqual({
      id: 'e1',
      source: 'Jane:Person',
      target: 'Acme:Organization',
      label: 'EMPLOYED_BY',
    });

    const flat = buildGraphElements(nodes, [], new Map(), 0, 'parchment') as Array<{
      data: Record<string, unknown>;
    }>;
    expect(flat[0]!.data['size']).toBe(36);
  });
});

describe('graph interaction helpers', () => {
  let container: HTMLElement;
  let tooltip: HTMLElement;
  let cy: cytoscape.Core;

  beforeEach(() => {
    container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 100, top: 50 }) as DOMRect;
    tooltip = document.createElement('div');
    tooltip.classList.add('hidden');
    cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: buildGraphElements(nodes, edges, new Map(), 1, 'slate') as never,
    });
  });

  afterEach(() => {
    cy.destroy();
  });

  function hover(id: string, position = { x: 10, y: 20 }) {
    cy.getElementById(id).emit({ type: 'mouseover', renderedPosition: position } as never);
  }

  it('shows a tooltip and highlights every node sharing the label, with their neighbourhoods', () => {
    wireGraphHover(cy, container, tooltip);

    hover('Jane:Person');

    expect(tooltip.classList.contains('hidden')).toBe(false);
    expect(tooltip.innerHTML).toContain('Person');
    expect(tooltip.innerHTML).toContain('3 docs');
    expect(tooltip.style.left).toBe('110px');
    expect(tooltip.style.top).toBe('70px');

    const faded = cy
      .elements('.faded')
      .map((e) => e.id())
      .sort(byText);
    expect(faded).toEqual(['Zed:Mystery']);
    expect(
      cy
        .edges('.labelled')
        .map((e) => e.id())
        .sort(byText)
    ).toEqual(['e1', 'e2']);
  });

  it('pluralises the document count', () => {
    wireGraphHover(cy, container, tooltip);
    hover('Jane:Organization');
    expect(tooltip.innerHTML).toContain('1 doc<');
  });

  it('clears highlighting on mouse out, and labels hovered edges', () => {
    wireGraphHover(cy, container, tooltip);
    hover('Jane:Person');

    cy.getElementById('Jane:Person').emit('mouseout');
    expect(tooltip.classList.contains('hidden')).toBe(true);
    expect(cy.elements('.faded')).toHaveLength(0);

    cy.getElementById('e1').emit('mouseover');
    expect(cy.getElementById('e1').hasClass('labelled')).toBe(true);
    cy.getElementById('e1').emit('mouseout');
    expect(cy.getElementById('e1').hasClass('labelled')).toBe(false);
  });

  it('works without a tooltip element', () => {
    wireGraphHover(cy, container, null);
    expect(() => hover('Bob:Person')).not.toThrow();
    expect(() => cy.getElementById('Bob:Person').emit('mouseout')).not.toThrow();
  });

  it('hides nodes of filtered types and their edges', () => {
    // Read the display style directly (hide() sets display: none)
    const shown = (eles: Array<{ id(): string; style(name: string): unknown }>) =>
      eles
        .filter((e) => e.style('display') !== 'none')
        .map((e) => e.id())
        .sort(byText);

    applyTypeFilters(cy, new Set(['Organization']));
    expect(shown(cy.nodes().toArray())).toEqual(['Bob:Person', 'Jane:Person', 'Zed:Mystery']);
    expect(shown(cy.edges().toArray())).toEqual([]);

    applyTypeFilters(cy, new Set());
    expect(shown(cy.elements().toArray())).toHaveLength(nodes.length + edges.length);
  });

  it('keeps the graph centred when its container resizes', () => {
    let onResize!: ResizeObserverCallback;
    const observe = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          onResize = cb;
        }
        observe = observe;
        disconnect() {}
        unobserve() {}
      }
    );
    Object.defineProperties(container, {
      clientWidth: { value: 400 },
      clientHeight: { value: 300 },
    });
    cy.pan({ x: 10, y: 10 });

    createCenteringResizeObserver(cy, container);
    const resize = (width: number, height: number) =>
      onResize([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver);

    resize(600, 500);
    expect(cy.pan()).toEqual({ x: 110, y: 110 });
    resize(0, 500);
    onResize([], {} as ResizeObserver);
    expect(cy.pan()).toEqual({ x: 110, y: 110 });
    resize(400, 300);
    expect(cy.pan()).toEqual({ x: 10, y: 10 });
    expect(observe).toHaveBeenCalledWith(container);
    vi.unstubAllGlobals();
  });

  it('builds a styled instance for the chosen layout', () => {
    const instance = createCytoscape(
      undefined as unknown as HTMLElement,
      nodes,
      edges,
      'Grid',
      'slate'
    );
    expect(instance.nodes()).toHaveLength(nodes.length);
    expect(instance.getElementById('Acme:Organization').data('size')).toBe(80);
    instance.destroy();
  });
});

describe('renderer session helpers', () => {
  it('decodes base64url JWT payloads', () => {
    expect(parseJwt(makeIdToken({ sub: 's', note: '~~~???' }))).toEqual({
      sub: 's',
      note: '~~~???',
    });
  });

  it('reads the signed-in username', async () => {
    const api = installElectronApi();
    api.auth.getTokens
      .mockResolvedValueOnce({ idToken: makeIdToken({ 'cognito:username': 'alice' }) })
      .mockResolvedValueOnce({ idToken: makeIdToken({}) })
      .mockResolvedValueOnce(null);

    await expect(getUser()).resolves.toEqual({ username: 'alice' });
    await expect(getUser()).resolves.toEqual({ username: '' });
    await expect(getUser()).resolves.toBeNull();
  });
});
