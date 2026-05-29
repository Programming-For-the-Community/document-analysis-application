import { ShowErrorType } from "../../types/renderer";

export function showError(elements: ShowErrorType, message: string): void {
  document.getElementById(elements[0])?.classList.add('hidden');
  const errorEl: HTMLElement | null = document.getElementById(elements[1]);
  const msgEl: HTMLElement | null = document.getElementById(elements[2]);
  if (msgEl) msgEl.textContent = message;
  errorEl?.classList.remove('hidden');
}