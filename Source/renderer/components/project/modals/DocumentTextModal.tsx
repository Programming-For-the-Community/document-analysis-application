import { DocumentTextModalProps } from '../../../../interfaces/renderer/project';

export function DocumentTextModal({ isOpen, documentName, text, loading, error, onClose }: DocumentTextModalProps) {
  if (!isOpen) return null;

  return (
    <div className="doc-text-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="doc-text-modal">
        <div className="doc-text-modal-header">
          <span className="doc-text-modal-title">{documentName}</span>
          <button className="btn-icon-danger" aria-label="Close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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
    </div>
  );
}