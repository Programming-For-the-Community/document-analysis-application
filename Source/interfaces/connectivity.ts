export type ConnectionStatus = 'connected' | 'disconnected';

export interface ConnectivityStatus {
  neo4j: ConnectionStatus;
  qdrant: ConnectionStatus;
}
