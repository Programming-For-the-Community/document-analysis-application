// Cytoscape is loaded via <script> tag; declare it as an ambient global.
declare function cytoscape(options: Record<string, unknown>): {
  destroy(): void;
  layout(opts: Record<string, unknown>): { run(): void };
};

let currentProjectId = '';
let cytoscapeInstance: ReturnType<typeof cytoscape> | null = null;

function parseProjectJwt(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '';
  return JSON.parse(atob(base64)) as Record<string, unknown>;
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
  document.getElementById('docs-upload-zone')?.classList.remove('hidden');
  document.getElementById('docs-list-container')?.classList.add('hidden');
  document.getElementById('doc-header-actions')?.classList.remove('hidden');
}

function showProjectDocumentsList(): void {
  document.getElementById('docs-loading')?.classList.add('hidden');
  document.getElementById('docs-upload-zone')?.classList.add('hidden');
  document.getElementById('docs-list-container')?.classList.remove('hidden');
  document.getElementById('doc-header-actions')?.classList.remove('hidden');
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
}

function showGraphEmpty(): void {
  document.getElementById('graph-loading')?.classList.add('hidden');
  document.getElementById('graph-empty')?.classList.remove('hidden');
  document.getElementById('graph-canvas')?.classList.add('hidden');
}

function showGraphCanvas(): void {
  document.getElementById('graph-loading')?.classList.add('hidden');
  document.getElementById('graph-empty')?.classList.add('hidden');
  document.getElementById('graph-canvas')?.classList.remove('hidden');
}

// Map entity types to colours for visual distinction
const ENTITY_COLORS: Record<string, string> = {
  Person:       '#3b82f6',
  Organization: '#10b981',
  Date:         '#f59e0b',
  Amount:       '#8b5cf6',
  Location:     '#ef4444',
  Product:      '#06b6d4',
  Role:         '#f97316',
  Account:      '#ec4899',
  Other:        '#6b7280',
};

async function loadProjectGraph(): Promise<void> {
  if (!currentProjectId) return;
  showGraphLoading();

  try {
    // Sync any documents not yet in the local Neo4j before reading the graph.
    // findMissingDocuments makes this a no-op when everything is already loaded.
    await window.electron.graph.syncProject(currentProjectId);

    const result = await window.electron.graph.getProjectGraph(currentProjectId);
    if (!result.success || !result.nodes || !result.edges || result.nodes.length === 0) {
      showGraphEmpty();
      return;
    }

    const container = document.getElementById('graph-canvas');
    if (!container) { showGraphEmpty(); return; }

    // Destroy previous instance before mounting a new one
    if (cytoscapeInstance) {
      cytoscapeInstance.destroy();
      cytoscapeInstance = null;
    }

    showGraphCanvas();

    cytoscapeInstance = cytoscape({
      container,
      elements: [
        ...result.nodes.map((n) => ({
          data: {
            id:    n.data.id,
            label: n.data.label,
            type:  n.data.type,
            color: ENTITY_COLORS[n.data.type] ?? ENTITY_COLORS['Other'],
          },
        })),
        ...result.edges.map((e) => ({
          data: {
            id:     e.data.id,
            source: e.data.source,
            target: e.data.target,
            label:  e.data.label,
          },
        })),
      ],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'label':            'data(label)',
            'color':            '#ffffff',
            'font-size':        '10px',
            'text-valign':      'center',
            'text-halign':      'center',
            'width':            60,
            'height':           60,
            'text-wrap':        'wrap',
            'text-max-width':   '54px',
          },
        },
        {
          selector: 'edge',
          style: {
            'width':                    1.5,
            'line-color':               '#94a3b8',
            'target-arrow-color':       '#94a3b8',
            'target-arrow-shape':       'triangle',
            'curve-style':              'bezier',
            'label':                    'data(label)',
            'font-size':                '9px',
            'color':                    '#64748b',
            'text-rotation':            'autorotate',
            'text-margin-y':            -8,
          },
        },
      ],
      layout: {
        name:           'cose',
        animate:        false,
        nodeRepulsion:  () => 4096,
        idealEdgeLength: () => 100,
        padding:        24,
      },
    });

  } catch {
    showGraphEmpty();
  }
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
  UNPROCESSED: { label: 'not processed', cls: 'doc-status-badge doc-status-unprocessed' },
  QUEUED:      { label: 'queued',         cls: 'doc-status-badge doc-status-queued' },
  PROCESSING:  { label: 'processing',     cls: 'doc-status-badge doc-status-processing' },
  COMPLETE:    { label: 'analyzed',       cls: 'doc-status-badge doc-status-complete' },
  FAILED:      { label: 'failed',         cls: 'doc-status-badge doc-status-failed' },
};

function createDocumentItem(doc: DocumentRecord, isDuplicate: boolean): HTMLElement {
  const item = document.createElement('div');
  item.className = 'doc-item';
  item.dataset['docId'] = doc.documentId;
  const duplicateBadge = isDuplicate
    ? `<span class="doc-duplicate-badge" title="Another document with this name exists in this project">duplicate</span>`
    : '';
  const { label, cls } = STATUS_BADGE[doc.processingStatus];
  const statusBadge = `<span class="${cls}">${label}</span>`;
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
    <div class="doc-item-actions">
      <button class="btn-icon-danger btn-delete-doc" title="Delete document" aria-label="Delete ${doc.documentName}">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M11.5 3.5l-.75 8a1 1 0 01-1 .9H4.25a1 1 0 01-1-.9L2.5 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `;

  item.querySelector('.btn-delete-doc')?.addEventListener('click', (e) => {
    e.stopPropagation();
    void handleDeleteDocument(doc.documentId, doc.documentName, item);
  });

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
      const names = result.failed.map((f) => f.name).join(', ');
      showProjectUploadError(`Failed to upload: ${names}`);
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

document.getElementById('doc-text-modal-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeDocTextModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDocTextModal();
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

  const citationsEl   = document.getElementById('search-citations');
  const citationsLabel = document.getElementById('search-citations-label');

  if (citationsEl) {
    citationsEl.innerHTML = '';
    if (citations.length > 0) {
      citationsLabel?.classList.remove('hidden');
      citations.forEach((c) => {
        const item = document.createElement('div');
        item.className = 'search-citation';
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        item.title = 'Click to view full document text';
        item.innerHTML = `
          <div class="search-citation-source">${c.documentName}</div>
          <div class="search-citation-excerpt">${c.excerpt}</div>
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
  const queryEl = document.getElementById('search-query') as HTMLTextAreaElement | null;
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
  if (e.key === 'Enter' && !e.shiftKey) {
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

// ── Init ──────────────────────────────────────────────────────────────────────

async function initProjectPage(): Promise<void> {
  const tokens = await window.electron.auth.getTokens();

  if (!tokens) {
    await window.electron.auth.logout();
    return;
  }

  const payload = parseProjectJwt(tokens.idToken);
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = String(payload['email'] ?? '');

  const params = new URLSearchParams(window.location.search);
  currentProjectId = params.get('id') ?? '';
  const projectName = params.get('name') ?? 'Project';

  const nameEl = document.getElementById('project-name');
  if (nameEl) nameEl.textContent = projectName;
  document.title = `${projectName} — Document Analysis`;

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
    if (update.status === 'COMPLETE') void loadProjectGraph();
  });
}

void initProjectPage();