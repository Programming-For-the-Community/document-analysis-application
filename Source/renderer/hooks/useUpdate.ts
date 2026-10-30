import { useCallback, useEffect, useState } from 'react';

import { UpdateState } from '../../interfaces/update';

export function useUpdate() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    // The main process holds the state, so a page loaded after the check
    // still picks up an available update.
    void window.electron.updates.getStatus().then(setState);
    return window.electron.updates.onStatus(setState);
  }, []);

  const install = useCallback(() => {
    void window.electron.updates.install();
  }, []);

  return { state, install };
}
