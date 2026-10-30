import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getConnectivityStatus,
  onReconnect,
  setConnectionStatus,
} from '../../../main/services/connectivity';
import { Logger } from '../../../utils/logger';
import { BrowserWindow, sentOn } from '../../mocks/electron';

describe('connectivity service', () => {
  beforeEach(() => {
    setConnectionStatus('neo4j', 'disconnected');
    setConnectionStatus('qdrant', 'disconnected');
  });

  it('pushes status changes to the renderer, ignoring repeats', () => {
    setConnectionStatus('neo4j', 'connected');
    setConnectionStatus('neo4j', 'connected');

    expect(sentOn('connectivity:status-update')).toEqual([
      { neo4j: 'connected', qdrant: 'disconnected' },
    ]);
    expect(getConnectivityStatus()).toEqual({ neo4j: 'connected', qdrant: 'disconnected' });
  });

  it('returns a copy of the status', () => {
    const snapshot = getConnectivityStatus();
    snapshot.neo4j = 'connected';
    expect(getConnectivityStatus().neo4j).toBe('disconnected');
  });

  it('tolerates having no window open', () => {
    BrowserWindow.getAllWindows.mockReturnValue([]);
    expect(() => setConnectionStatus('qdrant', 'connected')).not.toThrow();
  });

  it('notifies reconnect listeners for that service until unsubscribed', () => {
    const neo4jListener = vi.fn();
    const qdrantListener = vi.fn();
    const unsubscribe = onReconnect('neo4j', neo4jListener);
    onReconnect('qdrant', qdrantListener);

    setConnectionStatus('neo4j', 'connected');
    expect(neo4jListener).toHaveBeenCalledTimes(1);
    expect(qdrantListener).not.toHaveBeenCalled();

    unsubscribe();
    setConnectionStatus('neo4j', 'disconnected');
    setConnectionStatus('neo4j', 'connected');
    expect(neo4jListener).toHaveBeenCalledTimes(1);
  });

  it('isolates a failing listener from the others', () => {
    const after = vi.fn();
    const unsubscribers = [
      onReconnect('qdrant', () => {
        throw new Error('listener broke');
      }),
      onReconnect('qdrant', () => {
        throw 'not an error object';
      }),
      onReconnect('qdrant', after),
    ];

    setConnectionStatus('qdrant', 'connected');

    expect(after).toHaveBeenCalled();
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('listener broke'));
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('not an error object'));
    unsubscribers.forEach((u) => u());
  });
});
