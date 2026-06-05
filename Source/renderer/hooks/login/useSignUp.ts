import { useState, useCallback } from 'react';
import { validateSignUp, signUp } from '../../handlers/login/signUp';

export function useSignUp(setError: (e: string | null) => void) {
  const [newUsername, setNewUsername]         = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);

  const handleSignUp = useCallback(async () => {
    setError(null);
    const validationError = validateSignUp(newUsername, newPassword, confirmPassword);
    if (validationError) { setError(validationError); return; }
    setCreatingAccount(true);
    const { error } = await signUp(newUsername, newPassword);
    if (error) { setError(error); setCreatingAccount(false); }
  }, [newUsername, newPassword, confirmPassword, setError]);

  return { newUsername, setNewUsername, newPassword, setNewPassword, confirmPassword, setConfirmPassword, creatingAccount, handleSignUp };
}