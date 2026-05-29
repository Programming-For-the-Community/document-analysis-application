export class Theme {
    public static async syncThemeFromServer(): Promise<void> {
      try {
        const result = await window.electron.preferences.getTheme();
        if (!result.success || result.value == null) return;
        const serverTheme = result.value === 'parchment' ? 'parchment' : 'slate';
        const localTheme  = localStorage.getItem('doc-analysis-theme') ?? 'slate';
        if (serverTheme === localTheme) return;
        localStorage.setItem('doc-analysis-theme', serverTheme);
        if (serverTheme === 'parchment') {
          document.documentElement.dataset['theme'] = 'parchment';
        } else {
          delete document.documentElement.dataset['theme'];
        }
        this.updateThemeToggleIcon();
      } catch { /* non-fatal */ }
    }

    public static initTheme(): void {
      const saved = localStorage.getItem('doc-analysis-theme');
      if (saved === 'parchment') {
        document.documentElement.dataset['theme'] = 'parchment';
      } else {
        delete document.documentElement.dataset['theme'];
      }
      this.updateThemeToggleIcon();
    }

    public static toggleTheme(): void {
      const isParchment = document.documentElement.dataset['theme'] === 'parchment';
      const newTheme = isParchment ? 'slate' : 'parchment';
      if (isParchment) {
        delete document.documentElement.dataset['theme'];
      } else {
        document.documentElement.dataset['theme'] = 'parchment';
      }
      localStorage.setItem('doc-analysis-theme', newTheme);
      this.updateThemeToggleIcon();
      void window.electron.preferences.setTheme(newTheme);
    }

    private static updateThemeToggleIcon(): void {
        const btn = document.getElementById('theme-toggle-btn');
        if (!btn) return;
        const isParchment = document.documentElement.dataset['theme'] === 'parchment';
        btn.innerHTML = isParchment
            ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 10.5A6 6 0 015.5 2.5a6.5 6.5 0 108 8z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
        btn.title = isParchment ? 'Switch to dark theme' : 'Switch to light theme';
        btn.setAttribute('aria-label', isParchment ? 'Switch to dark theme' : 'Switch to light theme');
    }
}