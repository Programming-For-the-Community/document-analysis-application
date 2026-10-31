import { useEffect, useRef, useState } from 'react';
import { RenameProjectModalProps } from '../../../../interfaces/renderer/home';
import { ModalOverlay } from '../../ModalOverlay';

export function RenameProjectModal({ isOpen, projectName, submitting, error, onClose, onSubmit }: Readonly<RenameProjectModalProps>) {
  const [name, setName] = useState(projectName);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setName(projectName); }, [projectName]);

  // Move focus into the dialog when it opens
  useEffect(() => { if (isOpen) inputRef.current?.focus(); }, [isOpen]);

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-card">
        <h2 className="modal-title">Rename Project</h2>
        <div className="form-group">
          <label htmlFor="rename-project-name">New name</label>
          <input
            type="text" id="rename-project-name" maxLength={100}
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSubmit(name); }}
            ref={inputRef}
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
    </ModalOverlay>
  );
}
