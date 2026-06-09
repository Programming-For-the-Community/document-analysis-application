interface SearchPanelProps {
  query: string;
  answer: string | null;
  citations: SearchCitation[];
  loading: boolean;
  error: string | null;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onViewDocument: (documentId: string, documentName: string) => void;
}

export function SearchPanel({
  query, answer, citations, loading, error,
  onQueryChange, onSearch, onViewDocument,
}: SearchPanelProps) {
  const hasResults = answer !== null;

  return (
    <section className="project-panel" id="search-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="7.5" cy="7.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11.5 11.5L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h2>Ask a Question</h2>
        </div>
      </div>

      <div className="search-form">
        <div className="search-input-row">
          <input type="text" className="search-input"
            placeholder="Ask anything about your documents…"
            autoComplete="off"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSearch(); } }}
          />
          <button className="search-submit-btn" aria-label="Ask" onClick={onSearch}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {loading && (
        <div className="panel-loading">
          <div className="spinner"></div>
          <span>Searching…</span>
        </div>
      )}

      {!loading && !hasResults && (
        <div className="panel-placeholder">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="13" cy="13" r="8" stroke="#d1d5db" strokeWidth="1.8" />
            <path d="M19 19L27 27" stroke="#d1d5db" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <p className="placeholder-title">Ask a question</p>
          <p className="placeholder-sub">Search across all analysed documents using natural language.</p>
          {error && <div className="upload-error">{error}</div>}
        </div>
      )}

      {!loading && hasResults && (
        <div className="search-results-area">
          <div className="search-answer-card">
            <p className="search-answer-text">{answer}</p>
          </div>
          {citations.length > 0 && (
            <>
              <p className="search-sources-label">Sources</p>
              <div className="search-sources-grid">
                {citations.map((c, i) => (
                  <div key={i} className="search-source-card" role="button" tabIndex={0}
                    title="Click to view full document text"
                    onClick={() => onViewDocument(c.documentId, c.documentName)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onViewDocument(c.documentId, c.documentName); }}>
                    <div className="search-source-name">
                      <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                        <rect x="2" y="1" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M4 4h4M4 6.5h3M4 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                      {c.documentName}
                    </div>
                    <div className="search-source-excerpt">{c.excerpt}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}