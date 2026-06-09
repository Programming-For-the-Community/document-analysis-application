import { Theme } from '../../../../types/renderer';
import { getEntityColors } from '../../../../utils/renderer/graph';

interface NodeDetailModalProps {
  isOpen: boolean;
  entityName: string;
  entityType: string;
  connections: Array<{ relType: string; otherName: string; otherType: string; direction: 'out' | 'in' }>;
  documents: Array<{ documentId: string; documentName: string }>;
  loading: boolean;
  error: string | null;
  theme: Theme;
  onClose: () => void;
  onViewDocument: (documentId: string, documentName: string) => void;
}

export function NodeDetailModal({
  isOpen, entityName, entityType, connections, documents,
  loading, error, theme, onClose, onViewDocument,
}: NodeDetailModalProps) {
  if (!isOpen) return null;
  const colors = getEntityColors(theme);

  return (
    <div className="doc-text-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="node-detail-modal">
        <div className="doc-text-modal-header">
          <div className="node-detail-header-info">
            <span className="node-detail-swatch" style={{ background: colors[entityType] ?? colors['Other'] }}></span>
            <span className="doc-text-modal-title">{entityName}</span>
            <span className="node-detail-type-badge">{entityType}</span>
          </div>
          <button className="btn-icon-danger" aria-label="Close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="node-detail-body">
          {loading && <div className="doc-text-modal-loading"><div className="spinner"></div></div>}
          {error  && <p className="doc-text-modal-error">{error}</p>}
          {!loading && !error && (
            <div>
              <div className="node-detail-section">
                <h3 className="node-detail-section-title">Connections</h3>
                {connections.length === 0 ? (
                  <p className="node-detail-empty">No connections found.</p>
                ) : connections.map((c, i) => (
                  <div key={i} className="node-detail-connection">
                    <span className="node-detail-rel-type">{c.relType}</span>
                    <span className="node-detail-arrow">{c.direction === 'out' ? '→' : '←'}</span>
                    <span className="node-detail-swatch-sm" style={{ background: colors[c.otherType] ?? colors['Other'] }}></span>
                    <span className="node-detail-other-name">{c.otherName}</span>
                    <span className="node-detail-other-type">{c.otherType}</span>
                  </div>
                ))}
              </div>
              <div className="node-detail-section">
                <h3 className="node-detail-section-title">Referenced in</h3>
                {documents.length === 0 ? (
                  <p className="node-detail-empty">No documents found.</p>
                ) : documents.map(doc => (
                  <div key={doc.documentId} className="node-detail-doc" role="button" tabIndex={0}
                    onClick={() => { onClose(); onViewDocument(doc.documentId, doc.documentName); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { onClose(); onViewDocument(doc.documentId, doc.documentName); } }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="2" y="1" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M4 4h4M4 6.5h3M4 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                    <span>{doc.documentName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}