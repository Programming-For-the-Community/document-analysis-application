import { useState, useEffect, useCallback } from 'react';

import { Theme } from '../../types/renderer/shared';
import { THEME } from '../../constants/renderer/shared';
import { getStoredTheme, applyTheme, fetchServerTheme } from '../../utils/renderer/theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // The user's theme preference is synced server-side, so on load it may
  // override the local cache (e.g. if it was changed on another device).
  useEffect(() => {
    void fetchServerTheme().then((serverTheme) => {
      if (!serverTheme) return;
      setTheme((prev) => {
        if (serverTheme === prev) return prev;
        localStorage.setItem('doc-analysis-theme', serverTheme);
        return serverTheme;
      });
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === THEME.LIGHT ? THEME.DARK : THEME.LIGHT;
      localStorage.setItem('doc-analysis-theme', next);
      void window.electron.preferences.setTheme(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
