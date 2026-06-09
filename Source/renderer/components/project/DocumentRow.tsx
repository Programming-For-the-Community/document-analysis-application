const STATUS_BADGE: Record<ProcessingStatus, { label: string; cls: string }> = {
  UNPROCESSED:  { label: 'not processed', cls: 'doc-status-badge doc-status-unprocessed' },
  QUEUED:       { label: 'queued',         cls: 'doc-status-badge doc-status-queued' },
  PROCESSING:   { label: 'processing',     cls: 'doc-status-badge doc-status-processing' },
  COMPLETE:     { label: 'analyzed',       cls: 'doc-status-badge doc-status-complete' },
  FAILED:       { label: 'failed',         cls: 'doc-status-badge doc-status-failed' },
  GRAPH_FAILED: { label: 'graph failed',   cls: 'doc-status-badge doc-status-graph-failed' },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface DocumentRowProps {
  doc: DocumentRecord;
  isDuplicate: boolean;
  canEdit: boolean;
  onDelete: (documentId: string, documentName: string) => void;
  onRetry: (documentId: string) => void;
  onViewText: (documentId: string, documentName: string) => void;
}

export function DocumentRow({ doc, isDuplicate, canEdit, onDelete, onRetry, onViewText }: DocumentRowProps) {
  const { label, cls } = STATUS_BADGE[doc.processingStatus];

  return (
    <div className="doc-item" data-doc-id={doc.documentId}
      onClick={() => onViewText(doc.documentId, doc.documentName)}
      role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onViewText(doc.documentId, doc.documentName); }}>
      <div className="doc-item-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="1" width="11" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 6h5M6 9h4M6 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="doc-item-info">
        <div className="doc-item-name-row">
          <span className="doc-item-name">{doc.documentName}</span>
          {isDuplicate && <span className="doc-duplicate-badge" title="Another document with this name exists in this project">duplicate</span>}
          <span className={cls}>{label}</span>
        </div>
        <span className="doc-item-meta">{formatFileSize(doc.fileSize)} · Uploaded {formatUploadDate(doc.uploadedAt)}</span>
      </div>
      {canEdit && (
        <div className="doc-item-actions" onClick={e => e.stopPropagation()}>
          {doc.processingStatus === 'GRAPH_FAILED' && (
            <button className="btn-retry-graph" title="Retry graph extraction" aria-label={`Retry graph extraction for ${doc.documentName}`}
              onClick={() => onRetry(doc.documentId)}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M2 7a5 5 0 1 0 1.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 3.5V7h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button className="btn-icon-danger btn-delete-doc" title="Delete document" aria-label={`Delete ${doc.documentName}`}
            onClick={() => onDelete(doc.documentId, doc.documentName)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M11.5 3.5l-.75 8a1 1 0 01-1 .9H4.25a1 1 0 01-1-.9L2.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}