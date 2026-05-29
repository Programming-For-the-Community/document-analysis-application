let pendingDeleteId: string | null = null;

export function openDeleteModal(projectId: string, projectName: string): void {
  pendingDeleteId = projectId;
  const nameEl: HTMLElement | null = document.getElementById('delete-project-name');
  if (nameEl) nameEl.textContent = projectName;
  document.getElementById('delete-project-modal')?.classList.remove('hidden');
}

export function closeDeleteModal(): void {
  pendingDeleteId = null;
  document.getElementById('delete-project-modal')?.classList.add('hidden');
}

export function getPendingDeleteId(): string | null {
  return pendingDeleteId;
}