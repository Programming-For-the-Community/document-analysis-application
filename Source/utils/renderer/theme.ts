import { THEME } from '../../constants/renderer/shared';
import { Theme } from '../../types/renderer';

export function getStoredTheme(): Theme {
  return localStorage.getItem('doc-analysis-theme') === THEME.PARCHMENT
    ? THEME.PARCHMENT : THEME.SLATE;
}

export function applyTheme(theme: Theme): void {
  if (theme === THEME.PARCHMENT) {
    document.documentElement.dataset['theme'] = THEME.PARCHMENT;
  } else {
    delete document.documentElement.dataset['theme'];
  }
}

export async function fetchServerTheme(): Promise<Theme | null> {
  try {
    const result = await window.electron.preferences.getTheme();
    if (!result.success || result.value == null) return null;
    return result.value === THEME.PARCHMENT ? THEME.PARCHMENT : THEME.SLATE;
  } catch { return null; }
}