import { TopbarProps } from '../../interfaces/renderer/shared';
import { useConnectivity } from '../hooks/useConnectivity';

export function Topbar({ username, theme, onToggleTheme, onLogout, projectName, onBack, onShare }: TopbarProps) {
  const isParchment = theme === 'parchment';
  const connectivity = useConnectivity();

  return (
    <header className="topbar">
      <div className="topbar-brand">
        {onBack && (
          <button className="btn-back" title="Back to projects" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="8" fill="var(--primary)" />
          <path d="M10 12h20M10 18h14M10 24h20M10 30h10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <span className="brand-name">{projectName ?? 'Document Analysis'}</span>
        {onShare && (
          <button className="btn-sm btn-secondary hidden" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} onClick={onShare}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ marginRight: 4 }}>
              <circle cx="10.5" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="10.5" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="2.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M4 6.5h3M7 6.5l2.5-3.5M7 6.5l2.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Share
          </button>
        )}
      </div>
      <div className="topbar-user">
        <span
          className={`status-pill status-pill--${connectivity.neo4j}`}
          title={`Neo4j: ${connectivity.neo4j === 'connected' ? 'Connected' : 'Disconnected — retrying every 15s'}`}
        >
          <span className="status-pill-dot" />
          Neo4j
        </span>
        <span
          className={`status-pill status-pill--${connectivity.qdrant}`}
          title={`Qdrant: ${connectivity.qdrant === 'connected' ? 'Connected' : 'Disconnected — retrying every 15s'}`}
        >
          <span className="status-pill-dot" />
          Qdrant
        </span>
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