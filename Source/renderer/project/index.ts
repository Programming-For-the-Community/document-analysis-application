let currentProjectId = '';

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
  `;
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
}

void initProjectPage();