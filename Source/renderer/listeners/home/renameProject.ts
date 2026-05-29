import { Projects } from "../../classes/projects";
import { setError } from "../../../utils/renderer/setError";
import { homeDisplayErrors } from "../../../constants/renderer/home";
import { closeRenameModal, getPendingRenameId } from "../../modals/home/renameProject";

function renameProjectCancelListener(): void {
    document.getElementById('rename-project-cancel')?.addEventListener('click', () => {
        closeRenameModal();
    });
}

function renameProjectModalListener(): void {
    document.getElementById('rename-project-modal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeRenameModal();
    });
}

function renameProjectSubmitListener(): void {
    document.getElementById('rename-project-submit')?.addEventListener('click', async () => {
      const pendingRenameId = getPendingRenameId();
      if (!pendingRenameId) return;
    
      const input = document.getElementById('rename-project-name') as HTMLInputElement;
      const newName = input.value.trim();
    
      if (!newName) {
        setError(homeDisplayErrors['PROJECT_NAME_MISSING']);
        return;
      }
    
      const submitBtn = document.getElementById('rename-project-submit') as HTMLButtonElement;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Renaming…';
    
      const result = await window.electron.projects.rename(pendingRenameId, newName);
    
      submitBtn.disabled = false;
      submitBtn.textContent = 'Rename';
    
      if (!result.success) {
        const [elementId, defaultMessage] = homeDisplayErrors['PROJECT_RENAME_FAILURE'];
        setError([elementId, result.error ?? defaultMessage]);
        return;
      }
    
      closeRenameModal();
      void Projects.loadProjects();
    });
}

function renameProjectKeyListener(): void {
    document.getElementById('rename-project-name')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            (document.getElementById('rename-project-submit') as HTMLButtonElement | null)?.click();
        } else if (e.key === 'Escape') {
            closeRenameModal();
        }
    });
}

export const renameProjectListeners: Array<() => void> = [
    renameProjectCancelListener,
    renameProjectModalListener,
    renameProjectSubmitListener,
    renameProjectKeyListener,
];