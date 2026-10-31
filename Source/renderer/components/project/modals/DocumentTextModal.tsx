import { DocumentTextModalProps } from '../../../../interfaces/renderer/project/documents';
import { ModalOverlay } from '../../ModalOverlay';

export function DocumentTextModal({ isOpen, documentName, text, loading, error, onClose }: Readonly<DocumentTextModalProps>) {
  if (!isOpen) return null;

  return (
    <ModalOverlay className="doc-text-overlay" onClose={onClose}>
      <div className="doc-text-modal">
        <div className="doc-text-modal-header">
          <span className="doc-text-modal-title">{documentName}</span>
          <button className="btn-icon-danger" aria-label="Close" onClick={onClose}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="doc-text-modal-body">
          {loading && <div className="doc-text-modal-loading"><div className="spinner"></div></div>}
          {error  && <p className="doc-text-modal-error">{error}</p>}
          {text   && <pre className="doc-text-modal-content">{text}</pre>}
        </div>
      </div>
    </ModalOverlay>
  );
}
