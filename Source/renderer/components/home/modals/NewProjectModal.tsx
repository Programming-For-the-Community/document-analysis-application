import { useState } from 'react';
import { NewProjectModalProps } from '../../../../interfaces/renderer/home';

export function NewProjectModal({ isOpen, submitting, error, onClose, onSubmit }: NewProjectModalProps) {
  const [name, setName] = useState('');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h2 className="modal-title">New Project</h2>
        <div className="form-group">
          <label htmlFor="new-project-name">Project name</label>
          <input
            type="text" id="new-project-name" maxLength={100}
            placeholder="e.g. Legal Contracts Q1"
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSubmit(name); else if (e.key === 'Escape') onClose(); }}
            autoFocus
          />
        </div>
        {error && <p className="error-msg">{error}</p>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={submitting} onClick={() => { onSubmit(name); }}>
            {submitting ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}