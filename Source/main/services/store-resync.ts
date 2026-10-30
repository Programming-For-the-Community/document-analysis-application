import { AppConfig } from '../../interfaces/config';
import { Logger } from '../../utils/logger';
import { onReconnect } from './connectivity';
import { syncNeo4jForUser } from './neo4j-sync';
import { syncQdrantForUser } from './qdrant-sync';

// Keeps the local Neo4j and Qdrant stores in step with S3/DynamoDB for the
// signed-in user: syncs once at login, then again whenever either store comes
// back after being unreachable (local backend started late, Docker restarted…).
// Documents processed while a store was down are only in S3 until this runs.

type Store = 'neo4j' | 'qdrant';

let unsubscribers: Array<() => void> = [];
const inFlight: Record<Store, Promise<void> | null> = { neo4j: null, qdrant: null };

function run(store: Store, sync: () => Promise<void>): void {
  // A reconnect during an in-flight sync is covered by that sync
  if (inFlight[store]) return;
  inFlight[store] = sync().finally(() => {
    inFlight[store] = null;
  });
}

export function startStoreResync(userSub: string, config: AppConfig): void {
  stopStoreResync();

  const syncNeo4j = () => run('neo4j', () => syncNeo4jForUser(userSub, config));
  const syncQdrant = () => run('qdrant', () => syncQdrantForUser(userSub, config));

  unsubscribers = [
    onReconnect('neo4j', () => {
      Logger.info('Neo4j reconnected — resyncing graph for signed-in user');
      syncNeo4j();
    }),
    onReconnect('qdrant', () => {
      Logger.info('Qdrant reconnected — resyncing embeddings for signed-in user');
      syncQdrant();
    }),
  ];

  syncNeo4j();
  syncQdrant();
}

export function stopStoreResync(): void {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
}
