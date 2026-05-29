export function openNewProjectModal(): void {
  const nameInput: HTMLInputElement = document.getElementById('new-project-name') as HTMLInputElement;
  const errorEl: HTMLElement | null = document.getElementById('new-project-error');
  nameInput.value = '';
  errorEl?.classList.add('hidden');
  document.getElementById('new-project-modal')?.classList.remove('hidden');
  nameInput.focus();
}

export function closeNewProjectModal(): void {
  document.getElementById('new-project-modal')?.classList.add('hidden');
}