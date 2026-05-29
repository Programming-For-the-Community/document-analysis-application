import { showError } from "../../utils/renderer/showError";
import { homeShowErrors } from "../../constants/renderer/home";
import { openRenameModal } from "../modals/home/renameProject";
import { openDeleteModal } from "../modals/home/deleteProject";

export class Projects {
    private static formatDocumentCount(count: number): string {
        return count === 1 ? '1 document' : `${count} documents`;
    }

    private static createProjectCard(project: ProjectListItem): HTMLElement {
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
        <p class="project-card-meta">${this.formatDocumentCount(project.documentCount)} · Last modified ${project.lastModified}</p>
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

    private static showLoading(): void {
    document.getElementById('projects-loading')?.classList.remove('hidden');
    document.getElementById('projects-error')?.classList.add('hidden');
    document.getElementById('projects-empty')?.classList.add('hidden');
    document.getElementById('projects-list')?.classList.add('hidden');
    }

    private static renderProjects(projects: ProjectListItem[]): void {
    document.getElementById('projects-loading')?.classList.add('hidden');
    document.getElementById('projects-error')?.classList.add('hidden');

    if (projects.length === 0) {
        document.getElementById('projects-empty')?.classList.remove('hidden');
        return;
    }

    const listEl = document.getElementById('projects-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    projects.forEach((p) => listEl.appendChild(this.createProjectCard(p)));
    listEl.classList.remove('hidden');
    }

    public static async loadProjects(): Promise<void> {
        this.showLoading();
        const result = await window.electron.projects.list();
        if (!result.success || !result.projects) {
            showError(homeShowErrors['PROJECT_ERROR'], result.error ?? 'Failed to load projects.');
            return;
        }
        this.renderProjects(result.projects);
    }
}