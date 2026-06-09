interface ShareModalProps {
  isOpen: boolean;
  members: ProjectMember[];
  membersLoading: boolean;
  shareUsername: string;
  shareRole: 'VIEW' | 'EDIT';
  sharing: boolean;
  error: string | null;
  suggestions: string[];
  callerRole: ProjectRole;
  onClose: () => void;
  onShare: () => void;
  onRemoveMember: (userSub: string) => void;
  onUpdateRole: (userSub: string, newRole: 'VIEW' | 'EDIT') => void;
  onUsernameInput: (value: string) => void;
  onShareRoleChange: (role: 'VIEW' | 'EDIT') => void;
  onSelectSuggestion: (username: string) => void;
}

export function ShareModal({
  isOpen, members, membersLoading, shareUsername, shareRole, sharing, error, suggestions, callerRole,
  onClose, onShare, onRemoveMember, onUpdateRole, onUsernameInput, onShareRoleChange, onSelectSuggestion,
}: ShareModalProps) {
  if (!isOpen) return null;
  const isOwner = callerRole === 'OWNER';

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card share-modal-card">
        <h2 className="modal-title">Share Project</h2>

        <div className="form-group">
          <label>Add people</label>
          <div className="share-form-row">
            <div className="share-username-wrapper">
              <input type="text" id="share-username-input" placeholder="Enter username" autoComplete="off"
                value={shareUsername} onChange={e => onUsernameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onShare(); }}
                onBlur={() => setTimeout(() => onSelectSuggestion(''), 150)}
              />
              {suggestions.length > 0 && (
                <div className="username-dropdown">
                  {suggestions.map(u => (
                    <div key={u} className="username-dropdown-item"
                      onMouseDown={e => { e.preventDefault(); onSelectSuggestion(u); }}>
                      {u}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <select className="share-role-select" value={shareRole}
              onChange={e => onShareRoleChange(e.target.value as 'VIEW' | 'EDIT')}>
              <option value="VIEW">View</option>
              {isOwner && <option value="EDIT">Edit</option>}
            </select>
            <button className="btn-primary btn-sm" disabled={sharing} onClick={onShare}>
              {sharing ? 'Sharing…' : 'Share'}
            </button>
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <p className="share-members-label">People with access</p>
        <div className="members-list">
          {membersLoading && <p className="members-empty">Loading…</p>}
          {!membersLoading && members.length === 0 && <p className="members-empty">No one else has access yet.</p>}
          {!membersLoading && members.map(member => (
            <div key={member.userSub} className="member-item">
              <span className="member-username">{member.username}</span>
              <select className="member-role-select" value={member.role} disabled={!isOwner}
                onChange={e => void onUpdateRole(member.userSub, e.target.value as 'VIEW' | 'EDIT')}>
                <option value="VIEW">View</option>
                <option value="EDIT">Edit</option>
              </select>
              {isOwner && (
                <button className="btn-member-remove" title={`Remove ${member.username}`} onClick={() => onRemoveMember(member.userSub)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}