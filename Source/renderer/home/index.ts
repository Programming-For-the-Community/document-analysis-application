function parseJwt(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '';
  return JSON.parse(atob(base64)) as Record<string, unknown>;
}

function formatDocumentCount(count: number): string {
  return count === 1 ? '1 document' : `${count} documents`;
}

function createProjectCard(project: ProjectListItem): HTMLElement {
  const isOwner = project.role === 'OWNER';
  const card = document.createElement('div');
  card.className = 'project-card';

  const ownerActions = `
    <button class="btn-card-action" title="Rename project" aria-label="Rename ${project.name}">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9.5 1.5a1.414 1.414 0 012 2L4 11H2v-2L9.5 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button class="btn-card-action btn-card-delete" title="Delete project" aria-label="Delete ${project.name}">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 1h5M1 3h13M6 6v5M9 6v5M2 3l1 10a1 1 0 001 1h7a1 1 0 001-1l1-10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;
  const sharedBadge = project.role === 'EDIT'
    ? `<span class="project-role-badge project-role-edit">Can edit</span>`
    : `<span class="project-role-badge project-role-view">View only</span>`;

  card.innerHTML = `
    <div class="project-card-header">
      <div class="project-card-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="2" width="13" height="17" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <path d="M7 8h7M7 11h5M7 14h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <rect x="11" y="13" width="9" height="9" rx="2" fill="var(--bg)" stroke="currentColor" stroke-width="1.5"/>
          <path d="M14 17h3M15.5 15.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      ${isOwner ? ownerActions : sharedBadge}
    </div>
    <div class="project-card-body">
      <h3 class="project-card-name">${project.name}</h3>
      <p class="project-card-meta">${formatDocumentCount(project.documentCount)} · Last modified ${project.lastModified}</p>
    </div>
  `;
  card.addEventListener('click', () => {
    void window.electron.nav.openProject({ id: project.id, name: project.name });
  });
  if (isOwner) {
    const [renameBtn, deleteBtn] = card.querySelectorAll('.btn-card-action');
    renameBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      openRenameModal(project.id, project.name);
    });
    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteModal(project.id, project.name);
    });
  }
  return card;
}

function showLoading(): void {
  document.getElementById('projects-loading')?.classList.remove('hidden');
  document.getElementById('projects-error')?.classList.add('hidden');
  document.getElementById('projects-empty')?.classList.add('hidden');
  document.getElementById('projects-list')?.classList.add('hidden');
}

function showProjectsError(message: string): void {
  document.getElementById('projects-loading')?.classList.add('hidden');
  const errorEl = document.getElementById('projects-error');
  const msgEl = document.getElementById('projects-error-msg');
  if (msgEl) msgEl.textContent = message;
  errorEl?.classList.remove('hidden');
}

function renderProjects(projects: ProjectListItem[]): void {
  document.getElementById('projects-loading')?.classList.add('hidden');
  document.getElementById('projects-error')?.classList.add('hidden');

  if (projects.length === 0) {
    document.getElementById('projects-empty')?.classList.remove('hidden');
    return;
  }

  const listEl = document.getElementById('projects-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  projects.forEach((p) => listEl.appendChild(createProjectCard(p)));
  listEl.classList.remove('hidden');
}

async function loadProjects(): Promise<void> {
  showLoading();
  const result = await window.electron.projects.list();
  if (!result.success || !result.projects) {
    showProjectsError(result.error ?? 'Failed to load projects.');
    return;
  }
  renderProjects(result.projects);
}

async function init(): Promise<void> {
  initTheme();
  const tokens = await window.electron.auth.getTokens();
  if (!tokens) {
    await window.electron.auth.logout();
    return;
  }

  const payload = parseJwt(tokens.idToken);
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = String(payload['email'] ?? '');

  void syncThemeFromServer();
  await loadProjects();
}

// ── Modal helpers ────────────────────────────────────────────────────────────

let pendingRenameId: string | null = null;

function openRenameModal(projectId: string, currentName: string): void {
  pendingRenameId = projectId;
  const input = document.getElementById('rename-project-name') as HTMLInputElement;
  const errorEl = document.getElementById('rename-project-error');
  input.value = currentName;
  errorEl?.classList.add('hidden');
  document.getElementById('rename-project-modal')?.classList.remove('hidden');
  input.focus();
  input.select();
}

function closeRenameModal(): void {
  pendingRenameId = null;
  document.getElementById('rename-project-modal')?.classList.add('hidden');
}

function setRenameError(message: string): void {
  const errorEl = document.getElementById('rename-project-error');
  if (errorEl) errorEl.textContent = message;
  errorEl?.classList.remove('hidden');
}

let pendingDeleteId: string | null = null;

function openDeleteModal(projectId: string, projectName: string): void {
  pendingDeleteId = projectId;
  const nameEl = document.getElementById('delete-project-name');
  if (nameEl) nameEl.textContent = projectName;
  document.getElementById('delete-project-modal')?.classList.remove('hidden');
}

function closeDeleteModal(): void {
  pendingDeleteId = null;
  document.getElementById('delete-project-modal')?.classList.add('hidden');
}

function openNewProjectModal(): void {
  const nameInput = document.getElementById('new-project-name') as HTMLInputElement;
  const errorEl = document.getElementById('new-project-error');
  nameInput.value = '';
  errorEl?.classList.add('hidden');
  document.getElementById('new-project-modal')?.classList.remove('hidden');
  nameInput.focus();
}

function closeNewProjectModal(): void {
  document.getElementById('new-project-modal')?.classList.add('hidden');
}

function setModalError(message: string): void {
  const errorEl = document.getElementById('new-project-error');
  if (errorEl) errorEl.textContent = message;
  errorEl?.classList.remove('hidden');
}

// ── Event listeners ──────────────────────────────────────────────────────────

document.getElementById('rename-project-cancel')?.addEventListener('click', () => {
  closeRenameModal();
});

document.getElementById('rename-project-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeRenameModal();
});

document.getElementById('rename-project-submit')?.addEventListener('click', async () => {
  if (!pendingRenameId) return;

  const input = document.getElementById('rename-project-name') as HTMLInputElement;
  const newName = input.value.trim();

  if (!newName) {
    setRenameError('Please enter a project name.');
    return;
  }

  const submitBtn = document.getElementById('rename-project-submit') as HTMLButtonElement;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Renaming…';

  const result = await window.electron.projects.rename(pendingRenameId, newName);

  submitBtn.disabled = false;
  submitBtn.textContent = 'Rename';

  if (!result.success) {
    setRenameError(result.error ?? 'Failed to rename project.');
    return;
  }

  closeRenameModal();
  void loadProjects();
});

document.getElementById('rename-project-name')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    (document.getElementById('rename-project-submit') as HTMLButtonElement | null)?.click();
  } else if (e.key === 'Escape') {
    closeRenameModal();
  }
});

document.getElementById('delete-project-cancel')?.addEventListener('click', () => {
  closeDeleteModal();
});

document.getElementById('delete-project-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeDeleteModal();
});

document.getElementById('delete-project-confirm')?.addEventListener('click', async () => {
  if (!pendingDeleteId) return;

  const confirmBtn = document.getElementById('delete-project-confirm') as HTMLButtonElement;
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Deleting…';

  const result = await window.electron.projects.delete(pendingDeleteId);

  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Delete';

  if (!result.success) {
    closeDeleteModal();
    showProjectsError(result.error ?? 'Failed to delete project.');
    return;
  }

  closeDeleteModal();
  void loadProjects();
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await window.electron.auth.logout();
});

// ── Theme ─────────────────────────────────────────────────────────────────────

function updateThemeToggleIcon(): void {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const isParchment = document.documentElement.dataset['theme'] === 'parchment';
  btn.innerHTML = isParchment
    ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 10.5A6 6 0 015.5 2.5a6.5 6.5 0 108 8z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  btn.title = isParchment ? 'Switch to dark theme' : 'Switch to light theme';
  btn.setAttribute('aria-label', isParchment ? 'Switch to dark theme' : 'Switch to light theme');
}

function initTheme(): void {
  const saved = localStorage.getItem('doc-analysis-theme');
  if (saved === 'parchment') {
    document.documentElement.dataset['theme'] = 'parchment';
  } else {
    delete document.documentElement.dataset['theme'];
  }
  updateThemeToggleIcon();
}

async function syncThemeFromServer(): Promise<void> {
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
    updateThemeToggleIcon();
  } catch { /* non-fatal */ }
}

function toggleTheme(): void {
  const isParchment = document.documentElement.dataset['theme'] === 'parchment';
  const newTheme = isParchment ? 'slate' : 'parchment';
  if (isParchment) {
    delete document.documentElement.dataset['theme'];
  } else {
    document.documentElement.dataset['theme'] = 'parchment';
  }
  localStorage.setItem('doc-analysis-theme', newTheme);
  updateThemeToggleIcon();
  void window.electron.preferences.setTheme(newTheme);
}

document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);

document.getElementById('projects-retry-btn')?.addEventListener('click', () => {
  void loadProjects();
});

document.getElementById('new-project-btn')?.addEventListener('click', () => {
  openNewProjectModal();
});

document.getElementById('new-project-cancel')?.addEventListener('click', () => {
  closeNewProjectModal();
});

document.getElementById('new-project-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeNewProjectModal();
});

document.getElementById('new-project-submit')?.addEventListener('click', async () => {
  const nameInput = document.getElementById('new-project-name') as HTMLInputElement;
  const name = nameInput.value.trim();

  if (!name) {
    setModalError('Please enter a project name.');
    return;
  }

  const submitBtn = document.getElementById('new-project-submit') as HTMLButtonElement;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating…';

  const result = await window.electron.projects.create(name);

  submitBtn.disabled = false;
  submitBtn.textContent = 'Create Project';

  if (!result.success || !result.project) {
    setModalError(result.error ?? 'Failed to create project.');
    return;
  }

  closeNewProjectModal();
  void window.electron.nav.openProject({ id: result.project.id, name: result.project.name });
});

document.getElementById('new-project-name')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    (document.getElementById('new-project-submit') as HTMLButtonElement | null)?.click();
  } else if (e.key === 'Escape') {
    closeNewProjectModal();
  }
});

void init();
