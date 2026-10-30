import { BrowserWindow } from 'electron';

import { ConnectionStatus, ConnectivityStatus } from '../../interfaces/connectivity';
import { Logger } from '../../utils/logger';

const status: ConnectivityStatus = {
  neo4j: 'disconnected',
  qdrant: 'disconnected',
};

type Service = keyof ConnectivityStatus;

const reconnectListeners: Record<Service, Set<() => void>> = {
  neo4j: new Set(),
  qdrant: new Set(),
};

export function setConnectionStatus(service: Service, value: ConnectionStatus): void {
  if (status[service] === value) return;

  status[service] = value;
  BrowserWindow.getAllWindows()[0]?.webContents.send('connectivity:status-update', { ...status });

  if (value === 'connected') {
    for (const listener of reconnectListeners[service]) {
      try {
        listener();
      } catch (err) {
        Logger.warn(
          `${service} reconnect listener failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
}

export function getConnectivityStatus(): ConnectivityStatus {
  return { ...status };
}

// Runs fn every time the service transitions to connected. Returns an unsubscribe function.
export function onReconnect(service: Service, fn: () => void): () => void {
  reconnectListeners[service].add(fn);
  return () => reconnectListeners[service].delete(fn);
}
