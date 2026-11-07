import { getEntityColors } from '../../../../utils/renderer/graph';
import { NodeDetailModalProps } from '../../../../interfaces/renderer/project/node-detail';
import { withContentKeys } from '../../../../utils/renderer/keys';
import { ModalOverlay } from '../../ModalOverlay';

export function NodeDetailModal({
  isOpen, entityName, entityType, connections, documents,
  loading, error, theme, onClose, onViewDocument,
}: Readonly<NodeDetailModalProps>) {
  if (!isOpen) return null;
  const colors = getEntityColors(theme);
  const getColor = (type: string) => colors[type as keyof typeof colors] ?? colors['Other'];

  return (
    <ModalOverlay className="doc-text-overlay" onClose={onClose}>
      <div className="node-detail-modal">
        <div className="doc-text-modal-header">
          <div className="node-detail-header-info">
            <span className="node-detail-swatch" style={{ background: getColor(entityType) }}></span>
            <span className="doc-text-modal-title">{entityName}</span>
            <span className="node-detail-type-badge">{entityType}</span>
          </div>
          <button className="btn-icon-danger" aria-label="Close" onClick={onClose}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
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
                ) : withContentKeys(connections, c => `${c.direction}|${c.relType}|${c.otherType}|${c.otherName}`).map(({ item: c, key }) => (
                  <div key={key} className="node-detail-connection">
                    <span className="node-detail-rel-type">{c.relType}</span>
                    <span className="node-detail-arrow">{c.direction === 'out' ? '→' : '←'}</span>
                    <span className="node-detail-swatch-sm" style={{ background: getColor(c.otherType) }}></span>
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
                  <button type="button" key={doc.documentId} className="btn-plain node-detail-doc"
                    onClick={() => { onClose(); onViewDocument(doc.documentId, doc.documentName); }}>
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="2" y="1" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M4 4h4M4 6.5h3M4 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                    <span>{doc.documentName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
