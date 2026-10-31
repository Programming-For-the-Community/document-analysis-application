import { useEffect, useRef, useState } from 'react';
import { NewProjectModalProps } from '../../../../interfaces/renderer/home';
import { ModalOverlay } from '../../ModalOverlay';

export function NewProjectModal({ isOpen, submitting, error, onClose, onSubmit }: Readonly<NewProjectModalProps>) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Move focus into the dialog when it opens
  useEffect(() => { if (isOpen) inputRef.current?.focus(); }, [isOpen]);

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-card">
        <h2 className="modal-title">New Project</h2>
        <div className="form-group">
          <label htmlFor="new-project-name">Project name</label>
          <input
            type="text" id="new-project-name" maxLength={100}
            placeholder="e.g. Legal Contracts Q1"
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSubmit(name); }}
            ref={inputRef}
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
    </ModalOverlay>
  );
}
