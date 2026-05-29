import { parseJwt } from "../../utils/renderer/parseJwt";

// Cytoscape is loaded via <script> tag; declare ambient globals with the subset we use.
interface CyEvent {
  target: CyElement;
  renderedPosition?: { x: number; y: number };
}
interface CyElement {
  data(key: string): string | number;
  connectedEdges(): CyCollection;
  neighborhood(): CyCollection;
  addClass(classes: string): CyElement;
  removeClass(classes: string): CyElement;
  hidden(): boolean;
  hide(): CyElement;
  show(): CyElement;
  source(): CyElement;
  target(): CyElement;
}
interface CyCollection {
  not(selector: string | CyElement | CyCollection): CyCollection;
  filter(fn: (el: CyElement, i: number) => boolean): CyCollection;
  forEach(fn: (el: CyElement, i: number) => void): void;
  has(el: CyElement): boolean;
  union(other: CyCollection | CyElement): CyCollection;
  components(): CyCollection[];
  edges(): CyCollection;
  connectedEdges(): CyCollection;
  addClass(classes: string): CyCollection;
  removeClass(classes: string): CyCollection;
  hide(): CyCollection;
  show(): CyCollection;
  length: number;
}
interface CyInstance {
  destroy(): void;
  layout(opts: Record<string, unknown>): { run(): void };
  on(event: string, selector: string, handler: (e: CyEvent) => void): void;
  on(event: string, handler: (e: CyEvent) => void): void;
  fit(padding?: number): void;
  resize(): void;
  pan(): { x: number; y: number };
  pan(position: { x: number; y: number }): void;
  zoom(): number;
  elements(): CyCollection;
  nodes(selector?: string): CyCollection;
  edges(): CyCollection;
}
declare function cytoscape(options: Record<string, unknown>): CyInstance;


let currentProjectId   = '';
let currentProjectRole: ProjectRole = 'VIEW';
let cytoscapeInstance:  CyInstance | null = null;
let expandedCyInstance: CyInstance | null = null;
let graphData: { nodes: GraphNode[]; edges: GraphEdge[] } | null = null;
let currentMinDocs     = 2;
let currentLayout      = 'cose';
let graphHasSyncedData = false;
let minDocsChangeTimer: ReturnType<typeof setTimeout> | null = null;
const hiddenTypes      = new Set<string>();
let graphResizeObserver: ResizeObserver | null = null;

// Attaches a ResizeObserver that keeps the same graph center visible as the
// container resizes. cy.resize() alone preserves pan in screen pixels, so the
// content drifts to a corner; we compensate by shifting pan by half the delta.
function createCenteringResizeObserver(cy: CyInstance, container: HTMLElement): ResizeObserver {
  let prevW = container.clientWidth;
  let prevH = container.clientHeight;

  const observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (!rect || rect.width === 0 || rect.height === 0) return;

    const newW = rect.width;
    const newH = rect.height;
    const pan  = cy.pan();

    cy.resize();
    cy.pan({ x: pan.x + (newW - prevW) / 2, y: pan.y + (newH - prevH) / 2 });

    prevW = newW;
    prevH = newH;
  });

  observer.observe(container);
  return observer;
}

function formatProjectFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatProjectUploadDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Document panel state helpers ─────────────────────────────────────────────

function showProjectDocumentsLoading(): void {
  document.getElementById('docs-loading')?.classList.remove('hidden');
  document.getElementById('docs-upload-zone')?.classList.add('hidden');
  document.getElementById('docs-list-container')?.classList.add('hidden');
  document.getElementById('doc-header-actions')?.classList.add('hidden');
}

function showProjectDocumentsEmpty(): void {
  document.getElementById('docs-loading')?.classList.add('hidden');
  document.getElementById('docs-list-container')?.classList.add('hidden');

  if (currentProjectRole === 'VIEW') {
    document.getElementById('docs-upload-zone')?.classList.add('hidden');
    document.getElementById('doc-header-actions')?.classList.add('hidden');
  } else {
    document.getElementById('docs-upload-zone')?.classList.remove('hidden');
    document.getElementById('doc-header-actions')?.classList.remove('hidden');
  }
}

function showProjectDocumentsList(): void {
  document.getElementById('docs-loading')?.classList.add('hidden');
  document.getElementById('docs-upload-zone')?.classList.add('hidden');
  document.getElementById('docs-list-container')?.classList.remove('hidden');

  if (currentProjectRole !== 'VIEW') {
    document.getElementById('doc-header-actions')?.classList.remove('hidden');
  }
}

function showProjectUploadStatus(message: string): void {
  const statusEl = document.getElementById('docs-upload-status');
  const textEl = document.getElementById('docs-upload-status-text');
  if (textEl) textEl.textContent = message;
  statusEl?.classList.remove('hidden');
}

function hideProjectUploadStatus(): void {
  document.getElementById('docs-upload-status')?.classList.add('hidden');
}

function showProjectUploadError(message: string): void {
  const el = document.getElementById('docs-upload-error');
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
  setTimeout(() => el?.classList.add('hidden'), 5000);
}

// ── Graph panel state helpers ─────────────────────────────────────────────────

function showGraphLoading(): void {
  document.getElementById('graph-loading')?.classList.remove('hidden');
  document.getElementById('graph-empty')?.classList.add('hidden');
  document.getElementById('graph-canvas')?.classList.add('hidden');
  document.getElementById('graph-legend')?.classList.add('hidden');
  document.getElementById('graph-controls')?.classList.add('hidden');
  document.getElementById('graph-filter')?.classList.add('hidden');
}

function showGraphEmpty(): void {
  document.getElementById('graph-loading')?.classList.add('hidden');
  document.getElementById('graph-empty')?.classList.remove('hidden');
  document.getElementById('graph-canvas')?.classList.add('hidden');
  document.getElementById('graph-legend')?.classList.add('hidden');
  document.getElementById('graph-controls')?.classList.add('hidden');
  if (graphHasSyncedData) document.getElementById('graph-filter')?.classList.remove('hidden');
}

function showGraphCanvas(): void {
  document.getElementById('graph-loading')?.classList.add('hidden');
  document.getElementById('graph-empty')?.classList.add('hidden');
  document.getElementById('graph-canvas')?.classList.remove('hidden');
  document.getElementById('graph-controls')?.classList.remove('hidden');
  document.getElementById('graph-filter')?.classList.remove('hidden');
  // graph-legend shown by buildGraphLegend() once populated
}

const ENTITY_COLORS_DARK: Record<string, string> = {
  Person:       '#60a5fa',
  Organization: '#34d399',
  Date:         '#fbbf24',
  Amount:       '#a78bfa',
  Location:     '#f87171',
  Product:      '#22d3ee',
  Role:         '#fb923c',
  Account:      '#f472b6',
  Event:        '#2dd4bf',
  Technology:   '#818cf8',
  Concept:      '#a3e635',
  Regulation:   '#fb7185',
  Agreement:    '#c084fc',
  Asset:        '#38bdf8',
  Task:         '#fb923c',
  Other:        '#a1a1aa',
};

const ENTITY_COLORS_PARCHMENT: Record<string, string> = {
  Person:       '#1d4ed8',
  Organization: '#047857',
  Date:         '#b45309',
  Amount:       '#6d28d9',
  Location:     '#b91c1c',
  Product:      '#0e7490',
  Role:         '#c2410c',
  Account:      '#be185d',
  Event:        '#0f766e',
  Technology:   '#4338ca',
  Concept:      '#4d7c0f',
  Regulation:   '#be123c',
  Agreement:    '#7e22ce',
  Asset:        '#0369a1',
  Task:         '#c2410c',
  Other:        '#78716c',
};

function getEntityColors(): Record<string, string> {
  return localStorage.getItem('doc-analysis-theme') === 'parchment'
    ? ENTITY_COLORS_PARCHMENT
    : ENTITY_COLORS_DARK;
}

function getGraphStyle(): unknown[] {
  const isParchment = localStorage.getItem('doc-analysis-theme') === 'parchment';
  const edgeColor      = isParchment ? '#c4a97d' : '#52525b';
  const edgeLabelColor = isParchment ? '#78716c' : '#a1a1aa';
  const edgeLabelBg    = isParchment ? '#fffdf7' : '#27272a';
  return [
    {
      selector: 'node',
      style: {
        'background-color':  'data(color)',
        'label':             'data(label)',
        'color':             '#ffffff',
        'font-size':         'data(fontSize)',
        'text-valign':       'center',
        'text-halign':       'center',
        'width':             'data(size)',
        'height':            'data(size)',
        'text-wrap':         'wrap',
        'text-max-width':    'data(textMaxWidth)',
      },
    },
    { selector: 'node.faded',       style: { opacity: 0.12 } },
    { selector: 'node.highlighted', style: { 'border-width': 3, 'border-color': '#ffffff', 'border-opacity': 0.7 } },
    {
      selector: 'edge',
      style: {
        'width':                    1.5,
        'line-color':               edgeColor,
        'target-arrow-color':       edgeColor,
        'target-arrow-shape':       'triangle',
        'curve-style':              'bezier',
        'label':                    '',
        'font-size':                '9px',
        'color':                    edgeLabelColor,
        'text-rotation':            'autorotate',
        'text-margin-y':            -8,
        'text-background-color':    edgeLabelBg,
        'text-background-opacity':  0.75,
        'text-background-padding':  '2px',
      },
    },
    { selector: 'edge.faded',    style: { opacity: 0.05 } },
    { selector: 'edge.labelled', style: { 'label': 'data(label)' } },
  ];
}

function getLayoutConfig(name: string): Record<string, unknown> {
  switch (name) {
    case 'dagre':
      return { name: 'dagre', animate: false, rankDir: 'TB', nodeSep: 60, rankSep: 80, padding: 24 };
    case 'concentric':
      return {
        name: 'concentric', animate: false,
        concentric: (node: CyElement) => node.connectedEdges().length,
        levelWidth: () => 2, minNodeSpacing: 40, padding: 24,
      };
    case 'radial':
      return { name: 'breadthfirst', animate: false, directed: false, circle: true, spacingFactor: 1.75, padding: 24 };
    case 'tree':
      return { name: 'breadthfirst', animate: false, directed: false, circle: false, spacingFactor: 1.5, padding: 24 };
    case 'circle':
      return { name: 'circle', animate: false, padding: 24 };
    case 'grid':
      return { name: 'grid', animate: false, padding: 24, avoidOverlap: true };
    case 'cose':
      return { name: 'cose', animate: false, nodeRepulsion: () => 4096, idealEdgeLength: () => 100, padding: 24 };
    default: // fcose
      return {
        name: 'fcose', animate: false,
        nodeRepulsion: 4500, idealEdgeLength: 100,
        gravity: 0.25, gravityRange: 3.8, padding: 24, randomize: false,
      };
  }
}

function applyTypeFilters(cy: CyInstance): void {
  for (const type of hiddenTypes) {
    const ns = cy.nodes(`[type="${type}"]`);
    ns.hide();
    ns.connectedEdges().hide();
  }
}

function updateLegendStates(): void {
  for (const id of ['graph-legend', 'graph-expand-legend']) {
    document.getElementById(id)
      ?.querySelectorAll<HTMLElement>('[data-type]')
      .forEach((item) => {
        item.classList.toggle('muted', hiddenTypes.has(item.dataset['type'] ?? ''));
      });
  }
}

function buildGraphElements(
  nodes: GraphNode[],
  edges: GraphEdge[],
  degreeMap: Map<string, number>,
  maxDeg: number
): unknown[] {
  return [
    ...nodes.map((n) => {
      const deg      = degreeMap.get(n.data.id) ?? 0;
      const ratio    = maxDeg > 0 ? deg / maxDeg : 0;
      const size     = 36 + Math.round(ratio * 44);  // 36–80 px
      const fontSize = 9  + Math.round(ratio * 8);   // 9–17 px
      return {
        data: {
          id:          n.data.id,
          label:       n.data.label,
          type:        n.data.type,
          docCount:    n.data.docCount,
          color:       getEntityColors()[n.data.type] ?? getEntityColors()['Other'],
          size,
          fontSize:    `${fontSize}px`,
          textMaxWidth: `${size - 6}px`,
        },
      };
    }),
    ...edges.map((e) => ({
      data: { id: e.data.id, source: e.data.source, target: e.data.target, label: e.data.label },
    })),
  ];
}

function buildGraphLegend(nodes: GraphNode[], legendElId: string): void {
  const legendEl = document.getElementById(legendElId);
  if (!legendEl) return;
  const typesPresent = [...new Set(nodes.map((n) => n.data.type))].sort();
  if (typesPresent.length === 0) { legendEl.classList.add('hidden'); return; }
  legendEl.innerHTML = typesPresent
    .map((type) => {
      const color = getEntityColors()[type] ?? getEntityColors()['Other'];
      return `<div class="graph-legend-item" data-type="${type}" title="Click to show/hide ${type} nodes">
        <span class="graph-legend-swatch" style="background:${color}"></span>
        <span class="graph-legend-label">${type}</span>
      </div>`;
    })
    .join('');

  legendEl.querySelectorAll<HTMLElement>('[data-type]').forEach((item) => {
    item.addEventListener('click', () => {
      const type = item.dataset['type'] ?? '';
      if (hiddenTypes.has(type)) {
        hiddenTypes.delete(type);
        [cytoscapeInstance, expandedCyInstance].forEach((cy) => {
          if (!cy) return;
          const ns = cy.nodes(`[type="${type}"]`);
          ns.show();
          ns.connectedEdges().filter((e) => !e.source().hidden() && !e.target().hidden()).show();
        });
      } else {
        hiddenTypes.add(type);
        [cytoscapeInstance, expandedCyInstance].forEach((cy) => {
          if (!cy) return;
          const ns = cy.nodes(`[type="${type}"]`);
          ns.hide();
          ns.connectedEdges().hide();
        });
      }
      updateLegendStates();
    });
  });

  legendEl.classList.remove('hidden');
  updateLegendStates();
}

function wireGraphEvents(cy: CyInstance, container: HTMLElement): void {
  const tooltip = document.getElementById('graph-tooltip');

  cy.on('mouseover', 'node', (e) => {
    const node         = e.target;
    const rendPos      = e.renderedPosition!;
    const rect         = container.getBoundingClientRect();
    const hoveredLabel = String(node.data('label'));

    if (tooltip) {
      const docCount = Number(node.data('docCount'));
      tooltip.innerHTML = `
        <div class="graph-tooltip-type">${node.data('type')}</div>
        <div class="graph-tooltip-value">${node.data('label')}</div>
        <div class="graph-tooltip-docs">${docCount} doc${docCount !== 1 ? 's' : ''}</div>`;
      tooltip.style.left = `${rect.left + rendPos.x}px`;
      tooltip.style.top  = `${rect.top  + rendPos.y}px`;
      tooltip.classList.remove('hidden');
    }

    const sameEntityNodes = cy.nodes().filter(
      (n) => String(n.data('label')) === hoveredLabel
    );

    const highlightedIds = new Set<string>();
    sameEntityNodes.forEach((n) => highlightedIds.add(String(n.data('id'))));

    for (const comp of cy.elements().components()) {
      let matchFound = false;
      sameEntityNodes.forEach((n) => { if (comp.has(n)) matchFound = true; });
      if (matchFound) {
        cy.nodes().filter((n) => comp.has(n))
          .forEach((n) => highlightedIds.add(String(n.data('id'))));
      }
    }

    const highlightNodes = cy.nodes().filter((n) => highlightedIds.has(String(n.data('id'))));
    const highlightEdges = cy.edges().filter((e) =>
      highlightedIds.has(String(e.data('source'))) &&
      highlightedIds.has(String(e.data('target')))
    );
    const highlightEles = highlightNodes.union(highlightEdges);

    cy.elements().not(highlightEles).addClass('faded');
    highlightEles.edges().addClass('labelled');
  });

  cy.on('mouseout', 'node', () => {
    tooltip?.classList.add('hidden');
    cy.elements().removeClass('faded labelled');
  });

  cy.on('mouseover', 'edge', (e) => { e.target.addClass('labelled'); });
  cy.on('mouseout',  'edge', (e) => { e.target.removeClass('labelled'); });

  cy.on('tap', 'node', (e) => {
    tooltip?.classList.add('hidden');
    cy.elements().removeClass('faded labelled');
    openNodeDetailModal(
      String(e.target.data('label')),
      String(e.target.data('type'))
    );
  });
}

function degreeMap(edges: GraphEdge[]): { map: Map<string, number>; max: number } {
  const map = new Map<string, number>();
  edges.forEach((e) => {
    map.set(e.data.source, (map.get(e.data.source) ?? 0) + 1);
    map.set(e.data.target, (map.get(e.data.target) ?? 0) + 1);
  });
  return { map, max: Math.max(1, ...map.values()) };
}

function renderGraphData(nodes: GraphNode[], edges: GraphEdge[]): void {
  const container = document.getElementById('graph-canvas');
  if (!container) { showGraphEmpty(); return; }

  if (cytoscapeInstance) { cytoscapeInstance.destroy(); cytoscapeInstance = null; }
  graphResizeObserver?.disconnect();
  graphResizeObserver = null;

  graphData = { nodes, edges };
  const { map, max } = degreeMap(edges);

  showGraphCanvas();

  cytoscapeInstance = cytoscape({
    container,
    elements: buildGraphElements(nodes, edges, map, max),
    style:    getGraphStyle(),
    layout:   getLayoutConfig(currentLayout),
  });

  wireGraphEvents(cytoscapeInstance, container);
  buildGraphLegend(nodes, 'graph-legend');
  applyTypeFilters(cytoscapeInstance);

  graphResizeObserver = createCenteringResizeObserver(cytoscapeInstance, container);
}

async function loadProjectGraph(): Promise<void> {
  if (!currentProjectId) return;
  showGraphLoading();

  try {
    await window.electron.graph.syncProject(currentProjectId);
    graphHasSyncedData = true;

    const result = await window.electron.graph.getProjectGraph(currentProjectId, currentMinDocs);
    if (!result.success || !result.nodes || !result.edges || result.nodes.length === 0) {
      showGraphEmpty();
      return;
    }

    renderGraphData(result.nodes, result.edges);
  } catch {
    showGraphEmpty();
  }
}

async function reloadGraphWithFilter(): Promise<void> {
  if (!currentProjectId || !graphHasSyncedData) return;
  showGraphLoading();

  try {
    const result = await window.electron.graph.getProjectGraph(currentProjectId, currentMinDocs);
    if (!result.success || !result.nodes || !result.edges || result.nodes.length === 0) {
      showGraphEmpty();
      return;
    }

    renderGraphData(result.nodes, result.edges);
    if (expandedCyInstance) openGraphExpand();
  } catch {
    showGraphEmpty();
  }
}

function openGraphExpand(): void {
  if (!graphData) return;
  const overlay      = document.getElementById('graph-expand-overlay');
  const expandCanvas = document.getElementById('graph-expand-canvas');
  if (!overlay || !expandCanvas) return;

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Sync expand controls to current state
  syncMinDocsInputs(currentMinDocs);
  const expandLabel = document.getElementById('layout-picker-expand-label');
  if (expandLabel) {
    const matchingItem = document.querySelector<HTMLElement>(`#layout-picker-expand-menu [data-value="${currentLayout}"]`);
    expandLabel.textContent = matchingItem?.textContent?.trim() ?? currentLayout;
    document.querySelectorAll('#layout-picker-expand-menu .layout-picker-item').forEach((i) => {
      const el = i as HTMLElement;
      const match = el.dataset['value'] === currentLayout;
      el.classList.toggle('active', match);
      match ? el.setAttribute('aria-selected', 'true') : el.removeAttribute('aria-selected');
    });
  }

  if (expandedCyInstance) { expandedCyInstance.destroy(); expandedCyInstance = null; }

  const { nodes, edges } = graphData;
  const { map, max } = degreeMap(edges);

  expandedCyInstance = cytoscape({
    container: expandCanvas,
    elements:  buildGraphElements(nodes, edges, map, max),
    style:     getGraphStyle(),
    layout:    getLayoutConfig(currentLayout),
  });

  wireGraphEvents(expandedCyInstance, expandCanvas);
  buildGraphLegend(nodes, 'graph-expand-legend');
  applyTypeFilters(expandedCyInstance);

  const expandObserver = createCenteringResizeObserver(expandedCyInstance, expandCanvas);
  (expandCanvas as HTMLElement & { _cyResizeObserver?: ResizeObserver })._cyResizeObserver = expandObserver;
}

function closeGraphExpand(): void {
  document.getElementById('graph-expand-overlay')?.classList.add('hidden');
  document.getElementById('graph-expand-legend')?.classList.add('hidden');
  document.body.style.overflow = '';
  const expandCanvas = document.getElementById('graph-expand-canvas') as (HTMLElement & { _cyResizeObserver?: ResizeObserver }) | null;
  expandCanvas?._cyResizeObserver?.disconnect();
  if (expandedCyInstance) { expandedCyInstance.destroy(); expandedCyInstance = null; }
}

// ── Document deletion ─────────────────────────────────────────────────────────

async function handleDeleteDocument(
  documentId: string,
  documentName: string,
  itemEl: HTMLElement
): Promise<void> {
  if (!confirm(`Delete "${documentName}"? This cannot be undone.`)) return;

  itemEl.style.opacity = '0.4';
  itemEl.style.pointerEvents = 'none';

  try {
    const result = await window.electron.documents.delete(currentProjectId, documentId);
    if (!result.success) {
      itemEl.style.opacity = '';
      itemEl.style.pointerEvents = '';
      showProjectUploadError(result.error ?? 'Failed to delete document.');
      return;
    }

    itemEl.remove();

    const listEl = document.getElementById('docs-list');
    if (listEl && listEl.children.length === 0) showProjectDocumentsEmpty();

    void loadProjectGraph();
  } catch {
    itemEl.style.opacity = '';
    itemEl.style.pointerEvents = '';
    showProjectUploadError('An unexpected error occurred.');
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<ProcessingStatus, { label: string; cls: string }> = {
  UNPROCESSED:  { label: 'not processed', cls: 'doc-status-badge doc-status-unprocessed' },
  QUEUED:       { label: 'queued',         cls: 'doc-status-badge doc-status-queued' },
  PROCESSING:   { label: 'processing',     cls: 'doc-status-badge doc-status-processing' },
  COMPLETE:     { label: 'analyzed',       cls: 'doc-status-badge doc-status-complete' },
  FAILED:       { label: 'failed',         cls: 'doc-status-badge doc-status-failed' },
  GRAPH_FAILED: { label: 'graph failed',   cls: 'doc-status-badge doc-status-graph-failed' },
};

async function handleRetryGraph(documentId: string, item: HTMLElement): Promise<void> {
  const badge   = item.querySelector<HTMLElement>('[class*="doc-status-"]');
  const retryBtn = item.querySelector<HTMLButtonElement>('.btn-retry-graph');

  if (badge) { badge.className = STATUS_BADGE['PROCESSING'].cls; badge.textContent = STATUS_BADGE['PROCESSING'].label; }
  if (retryBtn) { retryBtn.disabled = true; retryBtn.style.display = 'none'; }

  try {
    const result = await window.electron.documents.retryGraph(currentProjectId, documentId);
    if (!result.success) {
      if (badge) { badge.className = STATUS_BADGE['GRAPH_FAILED'].cls; badge.textContent = STATUS_BADGE['GRAPH_FAILED'].label; }
      if (retryBtn) { retryBtn.disabled = false; retryBtn.style.display = ''; }
      showProjectUploadError(result.error ?? 'Graph retry failed.');
    }
    // On success the onStatusUpdate listener will update the badge to COMPLETE
  } catch {
    if (badge) { badge.className = STATUS_BADGE['GRAPH_FAILED'].cls; badge.textContent = STATUS_BADGE['GRAPH_FAILED'].label; }
    if (retryBtn) { retryBtn.disabled = false; retryBtn.style.display = ''; }
    showProjectUploadError('An unexpected error occurred during graph retry.');
  }
}

function createDocumentItem(doc: DocumentRecord, isDuplicate: boolean): HTMLElement {
  const canDelete = currentProjectRole === 'OWNER' || currentProjectRole === 'EDIT';
  const item = document.createElement('div');
  item.className = 'doc-item';
  item.dataset['docId'] = doc.documentId;
  const duplicateBadge = isDuplicate
    ? `<span class="doc-duplicate-badge" title="Another document with this name exists in this project">duplicate</span>`
    : '';
  const { label, cls } = STATUS_BADGE[doc.processingStatus];
  const statusBadge = `<span class="${cls}">${label}</span>`;
  const retryGraphBtn = doc.processingStatus === 'GRAPH_FAILED'
    ? `<button class="btn-retry-graph" title="Retry graph extraction" aria-label="Retry graph extraction for ${doc.documentName}">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 7a5 5 0 1 0 1.5-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 3.5V7h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>`
    : '';
  const deleteBtn = canDelete
    ? `<div class="doc-item-actions">
        ${retryGraphBtn}
        <button class="btn-icon-danger btn-delete-doc" title="Delete document" aria-label="Delete ${doc.documentName}">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M11.5 3.5l-.75 8a1 1 0 01-1 .9H4.25a1 1 0 01-1-.9L2.5 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>`
    : '';

  item.innerHTML = `
    <div class="doc-item-icon">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="1" width="11" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/>
        <path d="M6 6h5M6 9h4M6 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </div>
    <div class="doc-item-info">
      <div class="doc-item-name-row">
        <span class="doc-item-name">${doc.documentName}</span>
        ${duplicateBadge}
        ${statusBadge}
      </div>
      <span class="doc-item-meta">${formatProjectFileSize(doc.fileSize)} · Uploaded ${formatProjectUploadDate(doc.uploadedAt)}</span>
    </div>
    ${deleteBtn}
  `;

  if (canDelete) {
    item.querySelector('.btn-retry-graph')?.addEventListener('click', (e) => {
      e.stopPropagation();
      void handleRetryGraph(doc.documentId, item);
    });

    item.querySelector('.btn-delete-doc')?.addEventListener('click', (e) => {
      e.stopPropagation();
      void handleDeleteDocument(doc.documentId, doc.documentName, item);
    });
  }

  return item;
}

function renderProjectDocumentList(docs: DocumentRecord[]): void {
  const listEl = document.getElementById('docs-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const nameCounts = new Map<string, number>();
  docs.forEach((d) => nameCounts.set(d.documentName, (nameCounts.get(d.documentName) ?? 0) + 1));

  docs.forEach((doc) => {
    const isDuplicate = (nameCounts.get(doc.documentName) ?? 0) > 1;
    listEl.appendChild(createDocumentItem(doc, isDuplicate));
  });
  showProjectDocumentsList();
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadProjectDocuments(): Promise<void> {
  if (!currentProjectId) return;
  showProjectDocumentsLoading();

  try {
    const result = await window.electron.documents.list(currentProjectId);
    if (!result.success || !result.documents) {
      showProjectDocumentsEmpty();
      return;
    }
    if (result.documents.length === 0) {
      showProjectDocumentsEmpty();
    } else {
      renderProjectDocumentList(result.documents);
    }
  } catch {
    showProjectDocumentsEmpty();
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────

async function uploadFiles(files: Array<{ name: string; path: string; size: number }>): Promise<void> {
  if (!currentProjectId || files.length === 0) return;

  showProjectUploadStatus(`Uploading ${files.length} file${files.length !== 1 ? 's' : ''}…`);

  try {
    const result = await window.electron.documents.upload(currentProjectId, files);
    hideProjectUploadStatus();

    if (!result.success) {
      showProjectUploadError(result.error ?? 'Upload failed.');
    } else if (result.failed && result.failed.length > 0) {
      const uploadedCount = result.uploaded?.length ?? 0;
      const lines: string[] = [];

      if (uploadedCount > 0) {
        lines.push(`${uploadedCount} file${uploadedCount !== 1 ? 's' : ''} uploaded successfully.`);
      }

      const byError = new Map<string, string[]>();
      for (const f of result.failed) {
        const group = byError.get(f.error) ?? [];
        group.push(f.name);
        byError.set(f.error, group);
      }
      for (const [error, names] of byError) {
        const nameList =
          names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
        lines.push(`Could not upload ${nameList}: ${error}`);
      }

      showProjectUploadError(lines.join('\n'));
    }
  } catch {
    hideProjectUploadStatus();
    showProjectUploadError('An unexpected error occurred during upload.');
  }

  await loadProjectDocuments();
}

async function handleDocumentSelect(): Promise<void> {
  const result = await window.electron.documents.selectFiles();
  if (!result.success || result.files.length === 0) return;
  await uploadFiles(result.files);
}

async function handleFolderSelect(): Promise<void> {
  const result = await window.electron.documents.selectFolder();
  if (!result.success || result.files.length === 0) return;
  await uploadFiles(result.files);
}

function toggleAddDocsMenu(): void {
  document.getElementById('add-docs-menu')?.classList.toggle('hidden');
}

function closeAddDocsMenu(): void {
  document.getElementById('add-docs-menu')?.classList.add('hidden');
}

function handleDropUpload(fileList: FileList): void {
  if (currentProjectRole === 'VIEW') return;
  const files = Array.from(fileList).map((f) => ({
    name: f.name,
    path: window.electron.utils.getFilePath(f),
    size: f.size,
  }));
  void uploadFiles(files);
}

// ── Drag-and-drop ─────────────────────────────────────────────────────────────

const docsPanel = document.getElementById('documents-panel');

docsPanel?.addEventListener('dragover', (e) => {
  if (currentProjectRole === 'VIEW') return;
  e.preventDefault();
  document.getElementById('docs-upload-zone')?.classList.add('drag-over');
});

docsPanel?.addEventListener('dragleave', (e) => {
  if (!docsPanel.contains(e.relatedTarget as Node)) {
    document.getElementById('docs-upload-zone')?.classList.remove('drag-over');
  }
});

docsPanel?.addEventListener('drop', (e) => {
  e.preventDefault();
  document.getElementById('docs-upload-zone')?.classList.remove('drag-over');
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) handleDropUpload(files);
});

// ── Button wiring ─────────────────────────────────────────────────────────────

document.getElementById('add-docs-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleAddDocsMenu();
});

document.getElementById('add-files-option')?.addEventListener('click', () => {
  closeAddDocsMenu();
  void handleDocumentSelect();
});

document.getElementById('add-folder-option')?.addEventListener('click', () => {
  closeAddDocsMenu();
  void handleFolderSelect();
});

document.addEventListener('click', closeAddDocsMenu);

document.getElementById('docs-upload-zone')?.addEventListener('click', () => void handleDocumentSelect());
document.getElementById('docs-upload-zone')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') void handleDocumentSelect();
});

// ── Document text modal ───────────────────────────────────────────────────────

function openDocTextModal(documentId: string, documentName: string): void {
  const overlay  = document.getElementById('doc-text-modal-overlay');
  const title    = document.getElementById('doc-text-modal-title');
  const loading  = document.getElementById('doc-text-modal-loading');
  const content  = document.getElementById('doc-text-modal-content');
  const errorEl  = document.getElementById('doc-text-modal-error');

  if (!overlay || !title || !loading || !content || !errorEl) return;

  title.textContent    = documentName;
  content.textContent  = '';
  errorEl.textContent  = '';
  loading.classList.remove('hidden');
  content.classList.add('hidden');
  errorEl.classList.add('hidden');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  void window.electron.documents.getText(currentProjectId, documentId).then((result) => {
    loading.classList.add('hidden');
    if (result.success && result.text) {
      content.textContent = result.text;
      content.classList.remove('hidden');
    } else {
      errorEl.textContent = result.error ?? 'Full text not available.';
      errorEl.classList.remove('hidden');
    }
  });
}

function closeDocTextModal(): void {
  document.getElementById('doc-text-modal-overlay')?.classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('doc-text-modal-close')?.addEventListener('click', closeDocTextModal);

// ── Node detail modal ─────────────────────────────────────────────────────────

function openNodeDetailModal(entityName: string, entityType: string): void {
  const overlay     = document.getElementById('node-detail-overlay');
  const titleEl     = document.getElementById('node-detail-title');
  const typeEl      = document.getElementById('node-detail-type');
  const swatchEl    = document.getElementById('node-detail-swatch');
  const loadingEl   = document.getElementById('node-detail-loading');
  const contentEl   = document.getElementById('node-detail-content');
  const errorEl     = document.getElementById('node-detail-error');

  if (!overlay || !titleEl || !typeEl || !swatchEl || !loadingEl || !contentEl || !errorEl) return;

  titleEl.textContent    = entityName;
  typeEl.textContent     = entityType;
  swatchEl.style.background = getEntityColors()[entityType] ?? getEntityColors()['Other'];
  contentEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  loadingEl.classList.remove('hidden');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  void window.electron.graph.getNodeDetail(currentProjectId, entityName, entityType).then((result) => {
    loadingEl.classList.add('hidden');
    if (!result.success) {
      errorEl.textContent = result.error ?? 'Failed to load details.';
      errorEl.classList.remove('hidden');
      return;
    }

    const connectionsEl = document.getElementById('node-detail-connections');
    if (connectionsEl) {
      const conns = result.connections ?? [];
      if (conns.length === 0) {
        connectionsEl.innerHTML = '<p class="node-detail-empty">No connections found.</p>';
      } else {
        connectionsEl.innerHTML = conns.map((c) => {
          const arrow      = c.direction === 'out' ? '→' : '←';
          const otherColor = getEntityColors()[c.otherType] ?? getEntityColors()['Other'];
          return `<div class="node-detail-connection">
            <span class="node-detail-rel-type">${c.relType}</span>
            <span class="node-detail-arrow">${arrow}</span>
            <span class="node-detail-swatch-sm" style="background:${otherColor}"></span>
            <span class="node-detail-other-name">${c.otherName}</span>
            <span class="node-detail-other-type">${c.otherType}</span>
          </div>`;
        }).join('');
      }
    }

    const documentsEl = document.getElementById('node-detail-documents');
    if (documentsEl) {
      const docs = result.documents ?? [];
      if (docs.length === 0) {
        documentsEl.innerHTML = '<p class="node-detail-empty">No documents found.</p>';
      } else {
        documentsEl.innerHTML = '';
        docs.forEach((doc) => {
          const item = document.createElement('div');
          item.className  = 'node-detail-doc';
          item.setAttribute('role', 'button');
          item.tabIndex   = 0;
          item.innerHTML  = `
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="1" width="8" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M4 4h4M4 6.5h3M4 9h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <span>${doc.documentName}</span>`;
          const open = (): void => {
            closeNodeDetailModal();
            openDocTextModal(doc.documentId, doc.documentName);
          };
          item.addEventListener('click', open);
          item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(); });
          documentsEl.appendChild(item);
        });
      }
    }

    contentEl.classList.remove('hidden');
  });
}

function closeNodeDetailModal(): void {
  document.getElementById('node-detail-overlay')?.classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('node-detail-close')?.addEventListener('click', closeNodeDetailModal);

document.getElementById('node-detail-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeNodeDetailModal();
});

document.getElementById('doc-text-modal-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeDocTextModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDocTextModal();
    closeNodeDetailModal();
    closeGraphExpand();
    closeShareModal();
  }
});

// ── Info popup ────────────────────────────────────────────────────────────────

function wireInfoPopup(btnId: string, popupId: string, closeId: string): void {
  const btn   = document.getElementById(btnId);
  const popup = document.getElementById(popupId);
  if (!btn || !popup) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.classList.toggle('hidden');
  });

  document.getElementById(closeId)?.addEventListener('click', () => popup.classList.add('hidden'));

  document.addEventListener('click', (e) => {
    if (!popup.classList.contains('hidden') &&
        !popup.contains(e.target as Node) &&
        e.target !== btn) {
      popup.classList.add('hidden');
    }
  });
}

wireInfoPopup('graph-layout-info-btn',        'layout-info-popup',        'layout-info-close');
wireInfoPopup('graph-expand-layout-info-btn', 'layout-info-popup-expand', 'layout-info-expand-close');

// ── Layout picker ─────────────────────────────────────────────────────────────

function wireLayoutPicker(
  btnId: string, menuId: string, labelId: string,
  onSelect: (value: string, label: string) => void
): void {
  const btn   = document.getElementById(btnId);
  const menu  = document.getElementById(menuId);
  const label = document.getElementById(labelId);
  if (!btn || !menu || !label) return;

  const open  = (): void => { menu.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); };
  const close = (): void => { menu.classList.add('hidden');    btn.setAttribute('aria-expanded', 'false'); };

  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.contains('hidden') ? open() : close(); });
  document.addEventListener('click', close);

  menu.querySelectorAll<HTMLElement>('.layout-picker-item').forEach((item) => {
    item.addEventListener('click', () => {
      const value = item.dataset['value'];
      if (!value) return;
      label.textContent = item.textContent?.trim() ?? value;
      menu.querySelectorAll('.layout-picker-item').forEach((i) => { i.classList.remove('active'); i.removeAttribute('aria-selected'); });
      item.classList.add('active');
      item.setAttribute('aria-selected', 'true');
      close();
      onSelect(value, item.textContent?.trim() ?? value);
    });
  });
}

wireLayoutPicker('layout-picker-btn', 'layout-picker-menu', 'layout-picker-label',
  (value) => {
    currentLayout = value;
    if (cytoscapeInstance) cytoscapeInstance.layout(getLayoutConfig(currentLayout)).run();
  }
);

wireLayoutPicker('layout-picker-expand-btn', 'layout-picker-expand-menu', 'layout-picker-expand-label',
  (value) => {
    currentLayout = value;
    // keep main picker label in sync
    const mainLabel = document.getElementById('layout-picker-label');
    if (mainLabel) mainLabel.textContent = value;
    document.querySelectorAll('#layout-picker-menu .layout-picker-item').forEach((i) => {
      const el = i as HTMLElement;
      const match = el.dataset['value'] === value;
      el.classList.toggle('active', match);
      match ? el.setAttribute('aria-selected', 'true') : el.removeAttribute('aria-selected');
    });
    if (expandedCyInstance) expandedCyInstance.layout(getLayoutConfig(currentLayout)).run();
  }
);

// ── Graph fit / expand ────────────────────────────────────────────────────────

document.getElementById('graph-fit-btn')?.addEventListener('click', () => {
  cytoscapeInstance?.fit(24);
});

document.getElementById('graph-expand-btn')?.addEventListener('click', openGraphExpand);

document.getElementById('graph-expand-close')?.addEventListener('click', closeGraphExpand);

document.getElementById('graph-expand-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeGraphExpand();
});

document.getElementById('graph-expand-fit-btn')?.addEventListener('click', () => {
  expandedCyInstance?.fit(24);
});

// ── Min-docs filter ───────────────────────────────────────────────────────────

function syncMinDocsInputs(value: number): void {
  const main   = document.getElementById('graph-min-docs-input')  as HTMLInputElement | null;
  const expand = document.getElementById('graph-expand-min-docs') as HTMLInputElement | null;
  if (main   && main.value   !== String(value)) main.value   = String(value);
  if (expand && expand.value !== String(value)) expand.value = String(value);
}

function handleMinDocsChange(rawValue: string): void {
  if (minDocsChangeTimer) clearTimeout(minDocsChangeTimer);
  minDocsChangeTimer = setTimeout(() => {
    const parsed = parseInt(rawValue, 10);
    currentMinDocs = isNaN(parsed) || parsed < 2 ? 2 : parsed;
    syncMinDocsInputs(currentMinDocs);
    void reloadGraphWithFilter();
    if (currentProjectId) void window.electron.projects.setMinDocFilter(currentProjectId, currentMinDocs);
  }, 400);
}

document.getElementById('graph-min-docs-input')?.addEventListener('input', (e) => {
  handleMinDocsChange((e.target as HTMLInputElement).value);
});

document.getElementById('graph-expand-min-docs')?.addEventListener('input', (e) => {
  handleMinDocsChange((e.target as HTMLInputElement).value);
});

document.querySelectorAll<HTMLElement>('.graph-filter-spin-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const delta = parseInt(btn.dataset['delta'] ?? '1', 10);
    const input = btn.closest('.graph-filter')?.querySelector<HTMLInputElement>('.graph-filter-input');
    if (!input) return;
    const next = Math.max(2, (parseInt(input.value, 10) || 2) + delta);
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
});

// ── Search panel ─────────────────────────────────────────────────────────────

function showSearchLoading(): void {
  document.getElementById('search-loading')?.classList.remove('hidden');
  document.getElementById('search-empty')?.classList.add('hidden');
  document.getElementById('search-results')?.classList.add('hidden');
  document.getElementById('search-error')?.classList.add('hidden');
}

function showSearchEmpty(): void {
  document.getElementById('search-loading')?.classList.add('hidden');
  document.getElementById('search-empty')?.classList.remove('hidden');
  document.getElementById('search-results')?.classList.add('hidden');
}

function showSearchError(message: string): void {
  document.getElementById('search-loading')?.classList.add('hidden');
  document.getElementById('search-empty')?.classList.remove('hidden');
  const el = document.getElementById('search-error');
  if (el) { el.textContent = message; el.classList.remove('hidden'); }
  setTimeout(() => el?.classList.add('hidden'), 6000);
}

function showSearchResults(answer: string, citations: SearchCitation[]): void {
  document.getElementById('search-loading')?.classList.add('hidden');
  document.getElementById('search-empty')?.classList.add('hidden');

  const answerEl = document.getElementById('search-answer');
  if (answerEl) answerEl.textContent = answer;

  const citationsEl    = document.getElementById('search-citations');
  const citationsLabel = document.getElementById('search-citations-label');

  if (citationsEl) {
    citationsEl.innerHTML = '';
    if (citations.length > 0) {
      citationsLabel?.classList.remove('hidden');
      citations.forEach((c) => {
        const item = document.createElement('div');
        item.className = 'search-source-card';
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        item.title = 'Click to view full document text';
        item.innerHTML = `
          <div class="search-source-name">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="1" width="8" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M4 4h4M4 6.5h3M4 9h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            ${c.documentName}
          </div>
          <div class="search-source-excerpt">${c.excerpt}</div>
        `;
        item.addEventListener('click', () => openDocTextModal(c.documentId, c.documentName));
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') openDocTextModal(c.documentId, c.documentName);
        });
        citationsEl.appendChild(item);
      });
    } else {
      citationsLabel?.classList.add('hidden');
    }
  }

  document.getElementById('search-results')?.classList.remove('hidden');
}

async function handleSearch(): Promise<void> {
  const queryEl = document.getElementById('search-query') as HTMLInputElement | null;
  const query = queryEl?.value.trim() ?? '';
  if (!query || !currentProjectId) return;

  showSearchLoading();

  try {
    const result = await window.electron.search.query(currentProjectId, query);
    if (!result.success || !result.answer) {
      showSearchError(result.error ?? 'Search failed.');
      return;
    }
    showSearchResults(result.answer, result.citations ?? []);
  } catch {
    showSearchError('An unexpected error occurred.');
  }
}

document.getElementById('search-submit-btn')?.addEventListener('click', () => void handleSearch());

document.getElementById('search-query')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    void handleSearch();
  }
});

// ── Navigation listeners ──────────────────────────────────────────────────────

document.getElementById('back-btn')?.addEventListener('click', async () => {
  await window.electron.nav.goHome();
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await window.electron.auth.logout();
});

// ── Share modal ───────────────────────────────────────────────────────────────

function setShareError(message: string): void {
  const el = document.getElementById('share-error');
  if (el) { el.textContent = message; el.classList.remove('hidden'); }
}

function clearShareError(): void {
  document.getElementById('share-error')?.classList.add('hidden');
}

function renderMembersList(members: ProjectMember[], callerRole: ProjectRole): void {
  const listEl = document.getElementById('share-members-list');
  if (!listEl) return;

  if (members.length === 0) {
    listEl.innerHTML = '<p class="members-empty">No one else has access yet.</p>';
    return;
  }

  listEl.innerHTML = '';
  for (const member of members) {
    const item = document.createElement('div');
    item.className = 'member-item';

    const isOwner     = callerRole === 'OWNER';
    const isSelf      = false; // self-remove handled separately if needed

    const roleOptions = isOwner
      ? `<select class="member-role-select" data-sub="${member.userSub}">
           <option value="VIEW" ${member.role === 'VIEW' ? 'selected' : ''}>View</option>
           <option value="EDIT" ${member.role === 'EDIT' ? 'selected' : ''}>Edit</option>
         </select>`
      : `<select class="member-role-select" disabled>
           <option>${member.role === 'EDIT' ? 'Edit' : 'View'}</option>
         </select>`;

    const removeBtn = (isOwner || isSelf)
      ? `<button class="btn-member-remove" data-sub="${member.userSub}" title="Remove access" aria-label="Remove ${member.username}">
           <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
             <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
           </svg>
         </button>`
      : '';

    item.innerHTML = `
      <span class="member-username">${member.username}</span>
      ${roleOptions}
      ${removeBtn}
    `;

    // Role change
    if (isOwner) {
      item.querySelector<HTMLSelectElement>('.member-role-select')?.addEventListener('change', async (e) => {
        const sel     = e.target as HTMLSelectElement;
        const newRole = sel.value as 'VIEW' | 'EDIT';
        const result  = await window.electron.projects.updateRole(currentProjectId, member.userSub, newRole);
        if (!result.success) {
          sel.value = member.role; // revert
          setShareError(result.error ?? 'Failed to update role.');
        } else {
          member.role = newRole;
          clearShareError();
        }
      });
    }

    // Remove access
    item.querySelector<HTMLButtonElement>('.btn-member-remove')?.addEventListener('click', async () => {
      const result = await window.electron.projects.unshare(currentProjectId, member.userSub);
      if (!result.success) {
        setShareError(result.error ?? 'Failed to remove access.');
      } else {
        item.remove();
        const remainingEl = listEl.querySelector('.member-item');
        if (!remainingEl) {
          listEl.innerHTML = '<p class="members-empty">No one else has access yet.</p>';
        }
        clearShareError();
      }
    });

    listEl.appendChild(item);
  }
}

async function loadShareMembers(): Promise<void> {
  const listEl = document.getElementById('share-members-list');
  if (listEl) listEl.innerHTML = '<p class="members-empty">Loading…</p>';

  const result = await window.electron.projects.listMembers(currentProjectId);
  if (result.success && result.members) {
    renderMembersList(result.members, currentProjectRole);
  } else {
    if (listEl) listEl.innerHTML = '<p class="members-empty">Failed to load members.</p>';
  }
}

// ── Username autocomplete ─────────────────────────────────────────────────────

let usernameSearchTimer: ReturnType<typeof setTimeout> | null = null;

function closeUsernameDropdown(): void {
  document.getElementById('share-username-dropdown')?.classList.add('hidden');
}

function renderUsernameDropdown(usernames: string[]): void {
  const dropdown = document.getElementById('share-username-dropdown');
  const input    = document.getElementById('share-username-input') as HTMLInputElement | null;
  if (!dropdown) return;

  if (usernames.length === 0) { dropdown.classList.add('hidden'); return; }

  dropdown.innerHTML = usernames
    .map((u) => `<div class="username-dropdown-item" data-username="${u}">${u}</div>`)
    .join('');
  dropdown.classList.remove('hidden');

  dropdown.querySelectorAll<HTMLElement>('.username-dropdown-item').forEach((item) => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep input focused
      if (input) input.value = item.dataset['username'] ?? '';
      closeUsernameDropdown();
    });
  });
}

document.getElementById('share-username-input')?.addEventListener('input', () => {
  if (usernameSearchTimer) clearTimeout(usernameSearchTimer);
  const input = document.getElementById('share-username-input') as HTMLInputElement | null;
  const prefix = input?.value.trim() ?? '';
  if (!prefix) { closeUsernameDropdown(); return; }

  usernameSearchTimer = setTimeout(async () => {
    const result = await window.electron.projects.searchUsers(prefix);
    if (result.success && result.usernames) {
      renderUsernameDropdown(result.usernames);
    }
  }, 250);
});

document.getElementById('share-username-input')?.addEventListener('blur', () => {
  // Small delay so mousedown on a dropdown item fires first
  setTimeout(closeUsernameDropdown, 150);
});

function openShareModal(): void {
  clearShareError();
  const input = document.getElementById('share-username-input') as HTMLInputElement | null;
  if (input) input.value = '';
  closeUsernameDropdown();

  // EDIT users can only grant VIEW — hide the EDIT option
  const roleSelect = document.getElementById('share-role-select') as HTMLSelectElement | null;
  if (roleSelect) {
    const editOption = roleSelect.querySelector<HTMLOptionElement>('option[value="EDIT"]');
    if (editOption) editOption.hidden = currentProjectRole !== 'OWNER';
    roleSelect.value = 'VIEW';
  }

  document.getElementById('share-modal')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  void loadShareMembers();
  input?.focus();
}

function closeShareModal(): void {
  document.getElementById('share-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
  closeUsernameDropdown();
}

document.getElementById('share-btn')?.addEventListener('click', openShareModal);
document.getElementById('share-modal-close')?.addEventListener('click', closeShareModal);
document.getElementById('share-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeShareModal();
});

document.getElementById('share-submit-btn')?.addEventListener('click', async () => {
  const input      = document.getElementById('share-username-input') as HTMLInputElement | null;
  const roleSelect = document.getElementById('share-role-select')    as HTMLSelectElement | null;
  const submitBtn  = document.getElementById('share-submit-btn')     as HTMLButtonElement | null;

  const username = input?.value.trim() ?? '';
  const role     = (roleSelect?.value ?? 'VIEW') as 'VIEW' | 'EDIT';

  if (!username) { setShareError('Please enter a username.'); return; }

  clearShareError();
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sharing…'; }

  const result = await window.electron.projects.share(currentProjectId, username, role);

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Share'; }

  if (!result.success) {
    setShareError(result.error ?? 'Failed to share project.');
  } else {
    if (input) input.value = '';
    void loadShareMembers();
  }
});

document.getElementById('share-username-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') (document.getElementById('share-submit-btn') as HTMLButtonElement | null)?.click();
});

// ── Theme ─────────────────────────────────────────────────────────────────────

function updateProjectThemeIcon(): void {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const isParchment = document.documentElement.dataset['theme'] === 'parchment';
  btn.innerHTML = isParchment
    ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 10.5A6 6 0 015.5 2.5a6.5 6.5 0 108 8z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  btn.title = isParchment ? 'Switch to dark theme' : 'Switch to light theme';
  btn.setAttribute('aria-label', isParchment ? 'Switch to dark theme' : 'Switch to light theme');
}

function initProjectTheme(): void {
  const saved = localStorage.getItem('doc-analysis-theme');
  if (saved === 'parchment') {
    document.documentElement.dataset['theme'] = 'parchment';
  } else {
    delete document.documentElement.dataset['theme'];
  }
  updateProjectThemeIcon();
}

async function syncProjectThemeFromServer(): Promise<void> {
  try {
    const result = await window.electron.preferences.getTheme();
    if (!result.success || result.value == null) return;
    const serverTheme = result.value === 'parchment' ? 'parchment' : 'slate';
    const localTheme  = localStorage.getItem('doc-analysis-theme') ?? 'slate';
    if (serverTheme === localTheme) return;
    localStorage.setItem('doc-analysis-theme', serverTheme);
    if (serverTheme === 'parchment') {
      document.documentElement.dataset['theme'] = 'parchment';
    } else {
      delete document.documentElement.dataset['theme'];
    }
    updateProjectThemeIcon();
    if (graphData) renderGraphData(graphData.nodes, graphData.edges);
  } catch { /* non-fatal */ }
}

function toggleProjectTheme(): void {
  const isParchment = document.documentElement.dataset['theme'] === 'parchment';
  const newTheme = isParchment ? 'slate' : 'parchment';
  if (isParchment) {
    delete document.documentElement.dataset['theme'];
  } else {
    document.documentElement.dataset['theme'] = 'parchment';
  }
  localStorage.setItem('doc-analysis-theme', newTheme);
  updateProjectThemeIcon();
  if (graphData) renderGraphData(graphData.nodes, graphData.edges);
  void window.electron.preferences.setTheme(newTheme);
}

document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleProjectTheme);

// ── Navigation listeners ──────────────────────────────────────────────────────

// ── Init ──────────────────────────────────────────────────────────────────────

async function initProjectPage(): Promise<void> {
  initProjectTheme();
  const tokens = await window.electron.auth.getTokens();

  if (!tokens) {
    await window.electron.auth.logout();
    return;
  }

  const payload = parseJwt(tokens.idToken);
  const emailEl = document.getElementById('user-email');
  if (emailEl) {
    emailEl.textContent = String(
      payload['email'] ?? payload['cognito:username'] ?? ''
    );
  }

  void syncProjectThemeFromServer();

  const params = new URLSearchParams(window.location.search);
  currentProjectId = params.get('id') ?? '';
  const projectName = params.get('name') ?? 'Project';

  const nameEl = document.getElementById('project-name');
  if (nameEl) nameEl.textContent = projectName;
  document.title = `${projectName} — Document Analysis`;

  // Fetch current user's role for this project
  const roleResult = await window.electron.projects.getRole(currentProjectId);
  currentProjectRole = (roleResult.role as ProjectRole | undefined) ?? 'VIEW';

  // Show view-only banner and hide upload controls for VIEW users
  if (currentProjectRole === 'VIEW') {
    document.getElementById('view-only-banner')?.classList.remove('hidden');
  }

  // Show Share button for OWNER and EDIT users
  if (currentProjectRole === 'OWNER' || currentProjectRole === 'EDIT') {
    document.getElementById('share-btn')?.classList.remove('hidden');
  }

  // Load saved min-doc filter for this project
  const settingsResult = await window.electron.projects.getSettings(currentProjectId);
  if (settingsResult.success && settingsResult.minDocFilter !== undefined) {
    currentMinDocs = settingsResult.minDocFilter;
    syncMinDocsInputs(currentMinDocs);
  }

  await loadProjectDocuments();
  void loadProjectGraph();

  window.electron.documents.onStatusUpdate((update) => {
    if (update.projectId !== currentProjectId) return;
    const item = document.querySelector<HTMLElement>(`.doc-item[data-doc-id="${update.documentId}"]`);
    if (!item) return;
    const badge = item.querySelector<HTMLElement>('[class*="doc-status-"]');
    if (!badge) return;
    const { label, cls } = STATUS_BADGE[update.status];
    badge.className = cls;
    badge.textContent = label;

    // Show retry button only when status is GRAPH_FAILED; hide it otherwise
    const actionsEl = item.querySelector<HTMLElement>('.doc-item-actions');
    if (actionsEl && (currentProjectRole === 'OWNER' || currentProjectRole === 'EDIT')) {
      let retryBtn = actionsEl.querySelector<HTMLButtonElement>('.btn-retry-graph');
      if (update.status === 'GRAPH_FAILED') {
        if (!retryBtn) {
          retryBtn = document.createElement('button');
          retryBtn.className = 'btn-retry-graph';
          retryBtn.title = 'Retry graph extraction';
          retryBtn.setAttribute('aria-label', 'Retry graph extraction');
          retryBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 7a5 5 0 1 0 1.5-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 3.5V7h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>`;
          retryBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            void handleRetryGraph(update.documentId, item);
          });
          actionsEl.insertBefore(retryBtn, actionsEl.firstChild);
        }
        retryBtn.style.display = '';
        retryBtn.disabled = false;
      } else if (retryBtn) {
        retryBtn.style.display = 'none';
      }
    }

    if (update.status === 'COMPLETE') void loadProjectGraph();
  });

  window.electron.documents.onDocumentAdded((doc) => {
    if (doc.projectId !== currentProjectId) return;
    void loadProjectDocuments();
    if (doc.processingStatus === 'COMPLETE') void loadProjectGraph();
  });

  window.electron.documents.onDocumentRemoved((data) => {
    if (data.projectId !== currentProjectId) return;
    const item = document.querySelector<HTMLElement>(`.doc-item[data-doc-id="${data.documentId}"]`);
    if (item) {
      item.remove();
      const listEl = document.getElementById('docs-list');
      if (listEl && listEl.children.length === 0) showProjectDocumentsEmpty();
    }
    void loadProjectGraph();
  });
}

void initProjectPage();
