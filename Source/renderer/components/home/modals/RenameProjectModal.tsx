import { useState, useEffect } from 'react';
import { RenameProjectModalProps } from '../../../../interfaces/renderer/home';

export function RenameProjectModal({ isOpen, projectName, submitting, error, onClose, onSubmit }: RenameProjectModalProps) {
  const [name, setName] = useState(projectName);

  useEffect(() => { setName(projectName); }, [projectName]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h2 className="modal-title">Rename Project</h2>
        <div className="form-group">
          <label htmlFor="rename-project-name">New name</label>
          <input
            type="text" id="rename-project-name" maxLength={100}
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSubmit(name); else if (e.key === 'Escape') onClose(); }}
            autoFocus
          />
        </div>
        {error && <p className="error-msg">{error}</p>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={submitting} onClick={() => onSubmit(name)}>
            {submitting ? 'Renaming…' : 'Rename'}
          </button>
        </div>
      </div>
    </div>
  );
}