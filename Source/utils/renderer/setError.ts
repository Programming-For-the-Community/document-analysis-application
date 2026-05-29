import { DisplayError } from "../../types/renderer";

export function setError(error: DisplayError): void {
  const errorEl: HTMLElement | null = document.getElementById(error[0]);
  if (errorEl) errorEl.textContent = error[1];
  errorEl?.classList.remove('hidden');
}