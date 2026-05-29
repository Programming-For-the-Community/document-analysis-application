import { Projects } from "../../classes/projects";
import { showError } from "../../../utils/renderer/showError";  
import { homeShowErrors } from "../../../constants/renderer/home";
import { closeDeleteModal, getPendingDeleteId } from "../../modals/home/deleteProject";

function deleteProjectCancelListener(): void {
    document.getElementById('delete-project-cancel')?.addEventListener('click', () => {
        closeDeleteModal();
    });
}

function deleteProjectClickAwayListener(): void {
    document.getElementById('delete-project-modal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeDeleteModal();
    });
}

function deleteProjectConfirmListener(): void {
    document.getElementById('delete-project-confirm')?.addEventListener('click', async () => {
        const pendingDeleteId = getPendingDeleteId();
        if (!pendingDeleteId) return;

        const confirmBtn: HTMLButtonElement = document.getElementById('delete-project-confirm') as HTMLButtonElement;
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deleting…';

        const result = await window.electron.projects.delete(pendingDeleteId);

        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete';

        if (!result.success) {
            closeDeleteModal();
            showError(homeShowErrors['PROJECT_ERROR'], result.error ?? 'Failed to delete project.');
            return;
        }

        closeDeleteModal();
        void Projects.loadProjects();
    });
}

export const deleteProjectListeners: Array<() => void> = [
    deleteProjectCancelListener,
    deleteProjectClickAwayListener,
    deleteProjectConfirmListener
];