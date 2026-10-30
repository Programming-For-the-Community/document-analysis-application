import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startStoreResync, stopStoreResync } from '../../../main/services/store-resync';
import { setConnectionStatus } from '../../../main/services/connectivity';
import { syncNeo4jForUser } from '../../../main/services/neo4j-sync';
import { syncQdrantForUser } from '../../../main/services/qdrant-sync';
import { flushPromises, makeConfig } from '../../helpers';

vi.mock('../../../main/services/neo4j-sync', () => ({ syncNeo4jForUser: vi.fn() }));
vi.mock('../../../main/services/qdrant-sync', () => ({ syncQdrantForUser: vi.fn() }));

const config = makeConfig();

function reconnect(service: 'neo4j' | 'qdrant') {
  setConnectionStatus(service, 'disconnected');
  setConnectionStatus(service, 'connected');
}

describe('store resync', () => {
  beforeEach(() => {
    vi.mocked(syncNeo4jForUser).mockResolvedValue();
    vi.mocked(syncQdrantForUser).mockResolvedValue();
  });

  afterEach(() => {
    stopStoreResync();
  });

  it('syncs both stores at login', () => {
    startStoreResync('user-sub', config);
    expect(syncNeo4jForUser).toHaveBeenCalledWith('user-sub', config);
    expect(syncQdrantForUser).toHaveBeenCalledWith('user-sub', config);
  });

  it('resyncs a store when it reconnects', async () => {
    startStoreResync('user-sub', config);
    await flushPromises();

    reconnect('neo4j');
    reconnect('qdrant');

    expect(syncNeo4jForUser).toHaveBeenCalledTimes(2);
    expect(syncQdrantForUser).toHaveBeenCalledTimes(2);
  });

  it('does not start a second sync while one is in flight', async () => {
    let finish!: () => void;
    vi.mocked(syncNeo4jForUser).mockReturnValueOnce(
      new Promise<void>((resolve) => (finish = resolve))
    );
    startStoreResync('user-sub', config);

    reconnect('neo4j');
    expect(syncNeo4jForUser).toHaveBeenCalledTimes(1);

    finish();
    await flushPromises();
    reconnect('neo4j');
    expect(syncNeo4jForUser).toHaveBeenCalledTimes(2);
  });

  it('stops listening for reconnects after logout', async () => {
    startStoreResync('user-sub', config);
    await flushPromises();
    stopStoreResync();

    reconnect('neo4j');

    expect(syncNeo4jForUser).toHaveBeenCalledTimes(1);
  });
});
