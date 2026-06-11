import { useState, useEffect } from 'react';
import { FormField } from '../components/FormField';
import { LoginTab } from '../../types/renderer/login';
import { useSignIn } from '../hooks/login/useSignIn';
import { useSignUp } from '../hooks/login/useSignUp';

export function LoginPage() {
  const [tab, setTab]     = useState<LoginTab>('signin');
  const [error, setError] = useState<string | null>(null);

  const { username, setUsername, password, setPassword, signingIn, handleSignIn } = useSignIn(setError);
  const { newUsername, setNewUsername, newPassword, setNewPassword, confirmPassword, setConfirmPassword, creatingAccount, handleSignUp } = useSignUp(setError);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      void (tab === 'signup' ? handleSignUp() : handleSignIn());
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [tab, handleSignIn, handleSignUp]);

  function switchTab(next: LoginTab) {
    setTab(next);
    setError(null);
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="8" fill="var(--primary)" />
            <path d="M10 12h20M10 18h14M10 24h20M10 30h10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
        <h1>Document Analysis</h1>
        <p className="subtitle">Extract entity relationships from your documents using AI</p>

        <div className="tab-bar">
          <button className={`tab-btn${tab === 'signin' ? ' active' : ''}`} onClick={() => switchTab('signin')}>
            Sign In
          </button>
          <button className={`tab-btn${tab === 'signup' ? ' active' : ''}`} onClick={() => switchTab('signup')}>
            Create Account
          </button>
        </div>

        {tab === 'signin' && (
          <div>
            <FormField label="Username" id="username" value={username} placeholder="username"
              autoComplete="username" onChange={setUsername} />
            <FormField label="Password" id="password" type="password" value={password}
              placeholder="••••••••" autoComplete="current-password" onChange={setPassword} />
            <button className="btn-primary" disabled={signingIn} onClick={() => void handleSignIn()}>
              {signingIn ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        )}

        {tab === 'signup' && (
          <div>
            <FormField label="Username" id="new-username" value={newUsername} placeholder="username"
              autoComplete="username" onChange={setNewUsername} />
            <FormField label="Password" id="new-password" type="password" value={newPassword}
              placeholder="••••••••" autoComplete="new-password" onChange={setNewPassword} />
            <FormField label="Confirm Password" id="confirm-password" type="password" value={confirmPassword}
              placeholder="••••••••" autoComplete="new-password" onChange={setConfirmPassword} />
            <button className="btn-primary" disabled={creatingAccount} onClick={() => void handleSignUp()}>
              {creatingAccount ? 'Creating account…' : 'Create Account'}
            </button>
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}
      </div>
    </div>
  );
}