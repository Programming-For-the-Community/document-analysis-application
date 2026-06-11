import { useState } from 'react';

import { DocumentRow } from './DocumentRow';
import { PROJECT_ROLES } from '../../../constants/app';
import { DocumentsPanelProps } from '../../../interfaces/renderer/project/documents';

export function DocumentsPanel({
  documents, loading, uploadStatus, uploadError, role,
  onUpload, onDelete, onRetry, onViewText,
}: DocumentsPanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const canEdit = role === PROJECT_ROLES.OWNER || role === PROJECT_ROLES.EDIT;

  const nameCounts = new Map<string, number>();
  documents.forEach(d => nameCounts.set(d.documentName, (nameCounts.get(d.documentName) ?? 0) + 1));

  async function handleSelectFiles() {
    setMenuOpen(false);
    const result = await window.electron.documents.selectFiles();
    if (!result.success || result.files.length === 0) return;
    onUpload(result.files);
  }

  async function handleSelectFolder() {
    setMenuOpen(false);
    const result = await window.electron.documents.selectFolder();
    if (!result.success || result.files.length === 0) return;
    onUpload(result.files);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const files = Array.from(e.dataTransfer.files).map(f => ({
      name: f.name,
      path: window.electron.utils.getFilePath(f),
      size: f.size,
    }));
    if (files.length) onUpload(files);
  }

  function handleConfirmDelete(documentId: string, documentName: string) {
    if (!confirm(`Delete "${documentName}"? This cannot be undone.`)) return;
    onDelete(documentId, documentName);
  }

  return (
    <section className="project-panel" id="documents-panel"
      onDragOver={e => { if (canEdit) e.preventDefault(); }}
      onDrop={handleDrop}>

      {role === PROJECT_ROLES.VIEW && (
        <div id="view-only-banner" className="view-only-banner">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M7.5 4.5v4M7.5 10v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          You have view-only access to this project. Contact the owner to upload or manage documents.
        </div>
      )}

      <div className="panel-header">
        <div className="panel-title-group">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="1" width="11" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 5h5M5 8h4M5 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h2>Documents</h2>
        </div>
        {canEdit && (
          <div className="dropdown-container" onClick={e => e.stopPropagation()}>
            <button className="btn-sm btn-primary" onClick={() => setMenuOpen(o => !o)}>+ Add Documents</button>
            {menuOpen && (
              <div className="dropdown-menu" onClick={() => setMenuOpen(false)}>
                <button className="dropdown-item" onClick={() => void handleSelectFiles()}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <rect x="1" y="1" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M3.5 4h3M3.5 6.5h2M3.5 9h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  Files
                </button>
                <button className="dropdown-item" onClick={() => void handleSelectFolder()}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M1 3.5A1.5 1.5 0 012.5 2h2.586a1 1 0 01.707.293L6.5 3H11.5A1.5 1.5 0 0113 4.5v6A1.5 1.5 0 0111.5 12h-9A1.5 1.5 0 011 10.5v-7z" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                  Folder
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="panel-loading">
          <div className="spinner"></div>
          <span>Loading documents…</span>
        </div>
      )}

      {!loading && documents.length === 0 && canEdit && (
        <div className="upload-zone" role="button" tabIndex={0}
          onClick={() => void handleSelectFiles()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') void handleSelectFiles(); }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect x="4" y="6" width="20" height="24" rx="3" stroke="#d1d5db" strokeWidth="1.8" />
            <path d="M8 13h12M8 18h8M8 23h12" stroke="#d1d5db" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="28" cy="28" r="7" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1.5" />
            <path d="M25.5 28h5M28 25.5v5" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="upload-zone-title">Drop files or folders here</p>
          <p className="upload-zone-sub">or click to browse files</p>
        </div>
      )}

      {!loading && documents.length > 0 && (
        <div className="doc-list-container">
          <div className="doc-list">
            {documents.map(doc => (
              <DocumentRow
                key={doc.documentId}
                doc={doc}
                isDuplicate={(nameCounts.get(doc.documentName) ?? 0) > 1}
                canEdit={canEdit}
                onDelete={handleConfirmDelete}
                onRetry={onRetry}
                onViewText={onViewText}
              />
            ))}
          </div>
        </div>
      )}

      {uploadStatus && (
        <div className="upload-status">
          <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></div>
          <span>{uploadStatus}</span>
        </div>
      )}

      {uploadError && (
        <div className="upload-error">{uploadError}</div>
      )}
    </section>
  );
}