import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QdrantClient } from '@qdrant/js-client-rest';

import { Qdrant } from '../../classes/qdrant';
import { getConnectivityStatus } from '../../main/services/connectivity';
import { COLLECTION } from '../../constants/qdrant';
import { RECONNECT_INTERVAL_MS } from '../../constants/connectivity';
import { Logger } from '../../utils/logger';

vi.mock('@qdrant/js-client-rest', () => ({ QdrantClient: vi.fn() }));

const client = {
  getCollections: vi.fn(),
  createCollection: vi.fn(),
  createPayloadIndex: vi.fn(),
  delete: vi.fn(),
  upsert: vi.fn(),
  scroll: vi.fn(),
  search: vi.fn(),
};
const config = { url: 'http://localhost:6333', apiKey: 'key' };
const internals = Qdrant as unknown as { available: boolean };

const chunk = (documentId: string, chunkIndex = 0) => ({
  documentId,
  projectId: 'proj',
  documentName: 'a.pdf',
  chunkIndex,
  text: `chunk ${chunkIndex}`,
  vector: [0.1],
});

describe('Qdrant', () => {
  beforeEach(async () => {
    vi.mocked(QdrantClient).mockImplementation(() => client as unknown as QdrantClient);
    client.getCollections.mockResolvedValue({ collections: [{ name: COLLECTION }] });
    for (const fn of [
      client.createCollection,
      client.createPayloadIndex,
      client.delete,
      client.upsert,
    ]) {
      fn.mockResolvedValue({});
    }
    await Qdrant.init(config);
  });

  afterEach(() => {
    Qdrant.close();
    internals.available = false;
    vi.useRealTimers();
  });

  describe('connection', () => {
    it('connects to an existing collection, passing the API key', () => {
      expect(Qdrant.isAvailable()).toBe(true);
      expect(getConnectivityStatus().qdrant).toBe('connected');
      expect(QdrantClient).toHaveBeenCalledWith({ url: config.url, apiKey: 'key' });
      expect(client.createCollection).not.toHaveBeenCalled();
    });

    it('creates the collection and payload indexes on first run, without an API key', async () => {
      Qdrant.close();
      internals.available = false;
      client.getCollections.mockResolvedValue({ collections: [] });

      await Qdrant.init({ url: config.url, apiKey: '' });

      expect(QdrantClient).toHaveBeenLastCalledWith({ url: config.url });
      expect(client.createCollection).toHaveBeenCalledWith(
        COLLECTION,
        expect.objectContaining({ vectors: expect.any(Object) })
      );
      expect(client.createPayloadIndex.mock.calls.map(([, opts]) => opts.field_name)).toEqual([
        'documentId',
        'projectId',
      ]);
    });

    it('retries while the container starts, then gives up', async () => {
      Qdrant.close();
      internals.available = false;
      vi.useFakeTimers();
      client.getCollections.mockClear().mockRejectedValue(new Error('ECONNREFUSED'));

      const init = Qdrant.init(config);
      await vi.advanceTimersByTimeAsync(9_000);
      await init;

      expect(client.getCollections).toHaveBeenCalledTimes(10);
      expect(Qdrant.isAvailable()).toBe(false);
    });

    it('health-checks on an interval', async () => {
      Qdrant.close();
      internals.available = false;
      vi.useFakeTimers();
      await Qdrant.init(config);

      client.getCollections.mockRejectedValue('down');
      await vi.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);

      expect(Qdrant.isAvailable()).toBe(false);
      expect(getConnectivityStatus().qdrant).toBe('disconnected');
    });
  });

  describe('loadDocument', () => {
    it('replaces the stored chunks for a document', async () => {
      await Qdrant.loadDocument([chunk('doc', 0), chunk('doc', 1)]);

      expect(client.delete).toHaveBeenCalledWith(COLLECTION, {
        filter: { must: [{ key: 'documentId', match: { value: 'doc' } }] },
      });
      const { points } = client.upsert.mock.calls[0]![1];
      expect(points).toHaveLength(2);
      expect(points[1].payload).toEqual({
        documentId: 'doc',
        projectId: 'proj',
        documentName: 'a.pdf',
        chunkIndex: 1,
        text: 'chunk 1',
      });
    });

    it('does nothing for an empty chunk list', async () => {
      await Qdrant.loadDocument([]);
      expect(client.upsert).not.toHaveBeenCalled();
    });

    it('defers loading while offline', async () => {
      internals.available = false;
      await Qdrant.loadDocument([chunk('doc')]);
      expect(client.upsert).not.toHaveBeenCalled();
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('deferred until reconnect'));
    });

    it('marks Qdrant offline when a write fails', async () => {
      client.upsert.mockRejectedValue(new Error('connection reset'));
      await expect(Qdrant.loadDocument([chunk('doc')])).resolves.toBeUndefined();
      expect(Qdrant.isAvailable()).toBe(false);
    });
  });

  describe('findMissingDocuments', () => {
    it('pages through the project and returns ids with no chunks', async () => {
      client.scroll
        .mockResolvedValueOnce({
          points: [{ payload: { documentId: 'a' } }, { payload: {} }],
          next_page_offset: 'page-2',
        })
        .mockResolvedValueOnce({
          points: [{ payload: { documentId: 'b' } }, {}],
          next_page_offset: { unexpected: true },
        });

      await expect(Qdrant.findMissingDocuments('proj', ['a', 'b', 'c'])).resolves.toEqual(['c']);
      expect(client.scroll.mock.calls[1]![1].offset).toBe('page-2');
    });

    it('follows numeric page offsets', async () => {
      client.scroll
        .mockResolvedValueOnce({ points: [], next_page_offset: 200 })
        .mockResolvedValueOnce({ points: [], next_page_offset: null });
      await Qdrant.findMissingDocuments('proj', ['a']);
      expect(client.scroll.mock.calls[1]![1].offset).toBe(200);
    });

    it('returns an empty list unchanged', async () => {
      await expect(Qdrant.findMissingDocuments('proj', [])).resolves.toEqual([]);
      expect(client.scroll).not.toHaveBeenCalled();
    });

    it('treats every document as missing while offline', async () => {
      internals.available = false;
      await expect(Qdrant.findMissingDocuments('proj', ['a'])).resolves.toEqual(['a']);
    });
  });

  describe('search', () => {
    it('maps hits, defaulting missing payload fields', async () => {
      client.search.mockResolvedValue([
        { score: 0.9, payload: { documentId: 'a', documentName: 'a.pdf', text: 'hello' } },
        { score: 0.5 },
      ]);

      await expect(Qdrant.search('proj', [0.1], 2)).resolves.toEqual([
        { documentId: 'a', documentName: 'a.pdf', text: 'hello', score: 0.9 },
        { documentId: '', documentName: 'Unknown', text: '', score: 0.5 },
      ]);
      expect(client.search.mock.calls[0]![1]).toMatchObject({
        limit: 2,
        filter: { must: [{ key: 'projectId', match: { value: 'proj' } }] },
      });
    });

    it('returns no hits when the search fails', async () => {
      client.search.mockRejectedValue(new Error('timeout'));
      await expect(Qdrant.search('proj', [0.1])).resolves.toEqual([]);
    });
  });

  it('deletes by project and by document', async () => {
    await Qdrant.deleteProject('proj');
    await Qdrant.deleteDocument('doc');

    expect(client.delete.mock.calls.map(([, opts]) => opts.filter.must[0])).toEqual([
      { key: 'projectId', match: { value: 'proj' } },
      { key: 'documentId', match: { value: 'doc' } },
    ]);
  });
});
