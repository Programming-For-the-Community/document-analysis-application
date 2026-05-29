import { setError } from "../../../utils/renderer/setError";
import { homeDisplayErrors } from "../../../constants/renderer/home";
import { openNewProjectModal, closeNewProjectModal } from "../../modals/home/newProject";

function newProjectListener(): void {
    document.getElementById('new-project-btn')?.addEventListener('click', () => {
        openNewProjectModal();
    });
}

function newProjectCancelListener(): void {
    document.getElementById('new-project-cancel')?.addEventListener('click', () => {
        closeNewProjectModal();
    });
}

function newProjectClickAwayListener(): void {
    document.getElementById('new-project-modal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeNewProjectModal();
    });
}

function newProjectSubmitListener(): void {
    document.getElementById('new-project-submit')?.addEventListener('click', async () => {
        const nameInput: HTMLInputElement = document.getElementById('new-project-name') as HTMLInputElement;
        const name = nameInput.value.trim();

        if (!name) {
            setError(homeDisplayErrors['NEW_PROJECT_NAME_MISSING']);
            return;
        }

        const submitBtn: HTMLButtonElement = document.getElementById('new-project-submit') as HTMLButtonElement;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating…';

        const result = await window.electron.projects.create(name);

        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Project';

        if (!result.success || !result.project) {
            const [elementId, defaultMessage] = homeDisplayErrors['NEW_PROJECT_CREATION_FAILURE'];
            setError([elementId, result.error ?? defaultMessage]);
            return;
        }

        closeNewProjectModal();
        void window.electron.nav.openProject({ id: result.project.id, name: result.project.name });
    });
}

function newProjectKeyListener(): void {
    document.getElementById('new-project-name')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            (document.getElementById('new-project-submit') as HTMLButtonElement | null)?.click();
        } else if (e.key === 'Escape') {
            closeNewProjectModal();
        }
    });
}

export const newProjectListeners: Array<() => void> = [
    newProjectListener,
    newProjectCancelListener,
    newProjectClickAwayListener,
    newProjectSubmitListener,
    newProjectKeyListener
];