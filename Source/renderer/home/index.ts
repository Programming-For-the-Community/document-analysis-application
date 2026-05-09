function parseJwt(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '';
  return JSON.parse(atob(base64)) as Record<string, unknown>;
}

function formatDocumentCount(count: number): string {
  return count === 1 ? '1 document' : `${count} documents`;
}

function createProjectCard(project: ProjectListItem): HTMLElement {
  const card = document.createElement('div');
  card.className = 'project-card';
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
      <button class="btn-card-delete" title="Delete project" aria-label="Delete ${project.name}">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 1h5M1 3h13M6 6v5M9 6v5M2 3l1 10a1 1 0 001 1h7a1 1 0 001-1l1-10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
    <div class="project-card-body">
      <h3 class="project-card-name">${project.name}</h3>
      <p class="project-card-meta">${formatDocumentCount(project.documentCount)} · Last modified ${project.lastModified}</p>
    </div>
  `;
  card.addEventListener('click', () => {
    void window.electron.nav.openProject({ id: project.id, name: project.name });
  });
  const deleteBtn = card.querySelector('.btn-card-delete');
  deleteBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    openDeleteModal(project.id, project.name);
  });
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
  const tokens = await window.electron.auth.getTokens();
  if (!tokens) {
    await window.electron.auth.logout();
    return;
  }

  const payload = parseJwt(tokens.idToken);
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = String(payload['email'] ?? '');

  await loadProjects();
}

// ── Modal helpers ────────────────────────────────────────────────────────────

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
