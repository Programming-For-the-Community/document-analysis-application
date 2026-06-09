import { useState, useEffect } from 'react';
import { getUser } from '../../utils/renderer/getUser';

export function useUser() {
  const [username, setUsername] = useState('');

  useEffect(() => {
    void getUser().then((user) => {
      if (!user) return void window.electron.auth.logout();
      setUsername(user.username);
    });
  }, []);

  return { username };
}
