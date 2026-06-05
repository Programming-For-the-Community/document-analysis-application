import { DeleteProjectModalProps } from '../../../../interfaces/renderer/home';

export function DeleteProjectModal({ isOpen, projectName, confirming, error, onClose, onConfirm }: DeleteProjectModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h2 className="modal-title">Delete Project</h2>
        <p className="modal-body">
          Are you sure you want to delete <strong>{projectName}</strong>? All documents and graph data will be permanently removed.
        </p>
        {error && <p className="error-msg">{error}</p>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-danger" disabled={confirming} onClick={onConfirm}>
            {confirming ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}