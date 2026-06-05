import { TopbarProps } from '../../interfaces/renderer/shared';

export function Topbar({ username, theme, onToggleTheme, onLogout }: TopbarProps) {
  const isParchment = theme === 'parchment';

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="8" fill="var(--primary)" />
          <path d="M10 12h20M10 18h14M10 24h20M10 30h10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <span className="brand-name">Document Analysis</span>
      </div>
      <div className="topbar-user">
        <span className="user-email">{username}</span>
        <button
          className="btn-theme-toggle"
          title={isParchment ? 'Switch to dark theme' : 'Switch to light theme'}
          aria-label={isParchment ? 'Switch to dark theme' : 'Switch to light theme'}
          onClick={onToggleTheme}
        >
          {isParchment ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 10.5A6 6 0 015.5 2.5a6.5 6.5 0 108 8z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <button className="btn-logout" onClick={onLogout}>Sign Out</button>
      </div>
    </header>
  );
}