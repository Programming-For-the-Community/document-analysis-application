import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import neo4j from 'neo4j-driver';

import { Neo4J } from '../../classes/neo4j';
import { getConnectivityStatus } from '../../main/services/connectivity';
import { RECONNECT_INTERVAL_MS } from '../../constants/connectivity';
import { makeGraph } from '../helpers';
import { sentOn } from '../mocks/electron';

vi.mock('neo4j-driver', () => ({
  default: { driver: vi.fn(), auth: { basic: vi.fn() } },
}));

type Row = Record<string, unknown>;
const records = (rows: Row[]) => ({ records: rows.map((row) => ({ get: (k: string) => row[k] })) });
const int = (n: number) => ({ toNumber: () => n });

const tx = { run: vi.fn() };
const session = { run: vi.fn(), executeWrite: vi.fn(), close: vi.fn() };
const driver = { verifyConnectivity: vi.fn(), session: vi.fn(), close: vi.fn() };
const config = { uri: 'bolt://localhost:7687', user: 'neo4j', password: 'pw' };

const internals = Neo4J as unknown as { available: boolean };

describe('Neo4J', () => {
  beforeEach(async () => {
    vi.mocked(neo4j.driver).mockReturnValue(driver as never);
    driver.verifyConnectivity.mockResolvedValue(undefined);
    driver.session.mockReturnValue(session);
    driver.close.mockResolvedValue(undefined);
    session.close.mockResolvedValue(undefined);
    session.executeWrite.mockImplementation(async (work: (t: typeof tx) => Promise<void>) =>
      work(tx)
    );
    tx.run.mockResolvedValue(records([]));
    await Neo4J.init(config);
  });

  afterEach(async () => {
    await Neo4J.close();
    internals.available = false;
    vi.useRealTimers();
  });

  describe('connection', () => {
    it('connects on init and reports it to the renderer', () => {
      expect(Neo4J.isAvailable()).toBe(true);
      expect(getConnectivityStatus().neo4j).toBe('connected');
      expect(sentOn('connectivity:status-update')).toContainEqual(
        expect.objectContaining({ neo4j: 'connected' })
      );
    });

    it('retries while the container starts, then gives up', async () => {
      await Neo4J.close();
      internals.available = false;
      vi.useFakeTimers();
      driver.verifyConnectivity.mockClear().mockRejectedValue(new Error('ECONNREFUSED'));

      const init = Neo4J.init(config);
      await vi.advanceTimersByTimeAsync(9_000);
      await init;

      expect(driver.verifyConnectivity).toHaveBeenCalledTimes(10);
      expect(Neo4J.isAvailable()).toBe(false);
    });

    it('health-checks on an interval and recovers', async () => {
      await Neo4J.close();
      internals.available = false;
      vi.useFakeTimers();
      driver.verifyConnectivity
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValue(undefined);

      const init = Neo4J.init(config);
      await vi.advanceTimersByTimeAsync(1_000); // the one retry delay
      await init;
      expect(Neo4J.isAvailable()).toBe(true);

      driver.verifyConnectivity.mockRejectedValue('still down');
      await vi.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
      expect(Neo4J.isAvailable()).toBe(false);
      expect(getConnectivityStatus().neo4j).toBe('disconnected');
    });
  });

  describe('getProjectGraph', () => {
    it('returns filtered nodes and de-duplicated edges between them', async () => {
      session.run
        .mockResolvedValueOnce(
          records([
            { id: 'Jane:Person', label: 'Jane', type: 'Person', docCount: int(3) },
            { id: 'Acme:Organization', label: 'Acme', type: 'Organization', docCount: int(2) },
          ])
        )
        .mockResolvedValueOnce(
          records([
            { source: 'Jane:Person', target: 'Acme:Organization', label: 'EMPLOYED_BY' },
            { source: 'Jane:Person', target: 'Acme:Organization', label: 'EMPLOYED_BY' },
            { source: 'Jane:Person', target: 'Filtered:Person', label: 'MANAGES' },
          ])
        );

      const graph = await Neo4J.getProjectGraph('proj', 2);

      expect(graph.nodes).toEqual([
        { data: { id: 'Jane:Person', label: 'Jane', type: 'Person', docCount: 3 } },
        { data: { id: 'Acme:Organization', label: 'Acme', type: 'Organization', docCount: 2 } },
      ]);
      expect(graph.edges).toEqual([
        {
          data: {
            id: 'Jane:Person→EMPLOYED_BY→Acme:Organization',
            source: 'Jane:Person',
            target: 'Acme:Organization',
            label: 'EMPLOYED_BY',
          },
        },
      ]);
      expect(session.run.mock.calls[0]![1]).toEqual({ projectId: 'proj', minDocCount: 2 });
      expect(session.close).toHaveBeenCalled();
    });

    it('closes the session when a query fails', async () => {
      session.run.mockRejectedValue(new Error('boom'));
      await expect(Neo4J.getProjectGraph('proj', 2)).rejects.toThrow('boom');
      expect(session.close).toHaveBeenCalled();
    });
  });

  it('deletes a document and a project inside write transactions', async () => {
    await Neo4J.deleteDocument('doc');
    await Neo4J.deleteProject('proj');

    expect(tx.run.mock.calls.map(([, params]) => params)).toEqual([
      { documentId: 'doc' },
      { documentId: 'doc' },
      { projectId: 'proj' },
      { projectId: 'proj' },
    ]);
    expect(session.close).toHaveBeenCalledTimes(2);
  });

  it('returns node connections and the documents mentioning it', async () => {
    session.run
      .mockResolvedValueOnce(
        records([
          {
            otherName: 'Acme',
            otherType: 'Organization',
            relType: 'EMPLOYED_BY',
            direction: 'out',
          },
        ])
      )
      .mockResolvedValueOnce(records([{ documentId: 'doc-1' }, { documentId: 'doc-2' }]));

    await expect(Neo4J.getNodeDetail('proj', 'Jane', 'Person')).resolves.toEqual({
      connections: [
        { otherName: 'Acme', otherType: 'Organization', relType: 'EMPLOYED_BY', direction: 'out' },
      ],
      documentIds: ['doc-1', 'doc-2'],
    });
  });

  describe('findMissingDocuments', () => {
    it('returns ids with no Document node', async () => {
      session.run.mockResolvedValue(records([{ id: 'a' }]));
      await expect(Neo4J.findMissingDocuments(['a', 'b'])).resolves.toEqual(['b']);
    });

    it('skips the query for an empty list', async () => {
      await expect(Neo4J.findMissingDocuments([])).resolves.toEqual([]);
      expect(driver.session).not.toHaveBeenCalled();
    });
  });

  describe('synthesizeTextFromGraph', () => {
    it('renders entities and relationships as readable lines', () => {
      const graph = makeGraph();
      graph.relationships.push({
        source: 'e1',
        target: 'missing',
        type: 'HAS_ROLE',
        attributes: { title: 'CEO', since: '2020' },
      } as never);

      expect(Neo4J.synthesizeTextFromGraph(graph)).toBe(
        'Entities:\nJane Doe (Person)\nAcme Corp (Organization)\n\n' +
          'Relationships:\nJane Doe — EMPLOYED BY — Acme Corp\nJane Doe — HAS ROLE — missing title: CEO, since: 2020'
      );
    });

    it('marks empty sections', () => {
      expect(
        Neo4J.synthesizeTextFromGraph({
          documentId: 'd',
          projectId: 'p',
          entities: [],
          relationships: [],
        })
      ).toBe('Entities:\n(none)\n\nRelationships:\n(none)');
    });
  });

  it('replaces a document graph, batching nodes by label and edges by type', async () => {
    const graph = makeGraph();
    graph.entities.push(
      { id: 'e3', type: 'Spaceship' as never, value: 'enterprise' },
      { id: 'e4', type: 'Person', value: 'John Roe' }
    );
    graph.relationships.push({
      source: 'e4',
      target: 'e3',
      type: 'PILOTS',
      attributes: { rank: 'Captain' },
    } as never);

    await Neo4J.loadGraph(graph);

    const calls = tx.run.mock.calls as Array<[string, Record<string, unknown>]>;
    // delete entities, delete document, create document, then one UNWIND per label/type
    expect(calls[0]![0]).toContain('DETACH DELETE n');
    expect(calls[2]![0]).toContain('CREATE (:Document');
    const nodeBatches = calls.filter(([q]) => q.includes('CREATE (n:Entity'));
    expect(nodeBatches.map(([, p]) => p['type'])).toEqual(['Person', 'Organization', 'Other']);
    expect(nodeBatches[0]![1]['nodes']).toEqual([
      { id: 'doc-1:e1', name: 'Jane Doe' },
      { id: 'doc-1:e4', name: 'John Roe' },
    ]);
    const edgeBatches = calls.filter(([q]) => q.includes('UNWIND $rels'));
    expect(edgeBatches.map(([q]) => /rel:`(\w+)`/.exec(q)![1])).toEqual([
      'EMPLOYED_BY',
      'RELATED_TO',
    ]);
    expect(edgeBatches[1]![1]['rels']).toEqual([
      { srcId: 'doc-1:e4', tgtId: 'doc-1:e3', attributes: { rank: 'Captain' } },
    ]);
    expect(session.close).toHaveBeenCalled();
  });
});
