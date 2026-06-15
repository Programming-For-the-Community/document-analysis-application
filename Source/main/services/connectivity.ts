import { BrowserWindow } from 'electron';

import { ConnectionStatus, ConnectivityStatus } from '../../interfaces/connectivity';

const status: ConnectivityStatus = {
  neo4j: 'disconnected',
  qdrant: 'disconnected',
};

export function setConnectionStatus(service: keyof ConnectivityStatus, value: ConnectionStatus): void {
  if (status[service] === value) return;

  status[service] = value;
  BrowserWindow.getAllWindows()[0]?.webContents.send('connectivity:status-update', { ...status });
}

export function getConnectivityStatus(): ConnectivityStatus {
  return { ...status };
}
