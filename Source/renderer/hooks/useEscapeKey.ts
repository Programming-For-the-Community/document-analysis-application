import { useEffect, useRef } from 'react';

// Calls onEscape when Escape is pressed anywhere in the window, for as long as
// the calling component is mounted. Always invokes the latest callback, so
// passing an inline arrow doesn't re-subscribe on every render.
export function useEscapeKey(onEscape: () => void): void {
  const callbackRef = useRef(onEscape);
  callbackRef.current = onEscape;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') callbackRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
