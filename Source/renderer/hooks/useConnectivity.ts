import { useEffect, useState } from 'react';

import { ConnectivityStatus } from '../../interfaces/connectivity';

export function useConnectivity() {
  const [status, setStatus] = useState<ConnectivityStatus>({
    neo4j: 'disconnected',
    qdrant: 'disconnected',
  });

  useEffect(() => {
    void window.electron.connectivity.get().then(setStatus);
    window.electron.connectivity.onStatusUpdate(setStatus);
  }, []);

  return status;
}
