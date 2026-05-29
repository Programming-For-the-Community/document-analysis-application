let pendingRenameId: string | null = null;

export function openRenameModal(projectId: string, currentName: string): void {
  pendingRenameId = projectId;
  const input: HTMLInputElement = document.getElementById('rename-project-name') as HTMLInputElement;
  const errorEl: HTMLElement | null = document.getElementById('rename-project-error');
  input.value = currentName;
  errorEl?.classList.add('hidden');
  document.getElementById('rename-project-modal')?.classList.remove('hidden');
  input.focus();
  input.select();
}

export function closeRenameModal(): void {
  pendingRenameId = null;
  document.getElementById('rename-project-modal')?.classList.add('hidden');
}

export function getPendingRenameId(): string | null {
  return pendingRenameId;
}