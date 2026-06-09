import { useState, useCallback } from 'react';
import { validateSignIn, signIn } from '../../handlers/login/signIn';

export function useSignIn(setError: (e: string | null) => void) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = useCallback(async () => {
    setError(null);
    const validationError = validateSignIn(username, password);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSigningIn(true);
    const { error } = await signIn(username, password);
    if (error) {
      setError(error);
      setSigningIn(false);
    }
  }, [username, password, setError]);

  return { username, setUsername, password, setPassword, signingIn, handleSignIn };
}
