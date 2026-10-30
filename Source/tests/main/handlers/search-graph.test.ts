import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerSearchHandlers } from '../../../main/handlers/search';
import { registerGraphHandlers } from '../../../main/handlers/graph';
import { AWS_BEDROCK } from '../../../classes/aws/bedrock';
import { AWS_CLOUDWATCH } from '../../../classes/aws/cloudwatch';
import { AWS_DYNAMODB } from '../../../classes/aws/dynamodb';
import { AWS_S3 } from '../../../classes/aws/s3';
import { Neo4J } from '../../../classes/neo4j';
import { Qdrant } from '../../../classes/qdrant';
import { CognitoAuthResult } from '../../../types/aws';
import { makeConfig, makeDoc, makeGraph, makeTokens } from '../../helpers';
import { invoke } from '../../mocks/electron';

const config = makeConfig();
const notReady = { success: false, error: 'App not ready' };

let appConfig: typeof config | null;
let tokens: CognitoAuthResult | null;

beforeEach(() => {
  appConfig = config;
  tokens = makeTokens();
  registerSearchHandlers(
    () => appConfig,
    () => tokens
  );
  registerGraphHandlers(
    () => appConfig,
    () => tokens
  );
});

describe('search:query', () => {
  let record: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    record = vi.spyOn(AWS_CLOUDWATCH, 'record').mockImplementation(() => undefined);
    vi.spyOn(Qdrant, 'isAvailable').mockReturnValue(true);
    vi.spyOn(AWS_BEDROCK, 'embedText').mockResolvedValue([0.1]);
  });

  it('answers from the top hits with truncated citations', async () => {
    vi.spyOn(Qdrant, 'search').mockResolvedValue([
      { documentId: 'd1', documentName: 'a.pdf', text: 'x'.repeat(301), score: 0.9 },
      { documentId: 'd2', documentName: 'b.pdf', text: 'short', score: 0.5 },
    ]);
    vi.spyOn(AWS_BEDROCK, 'synthesize').mockResolvedValue('The answer');

    const result = await invoke<{ answer: string; citations: Array<{ excerpt: string }> }>(
      'search:query',
      'proj',
      '  who?  '
    );

    expect(result).toMatchObject({ success: true, answer: 'The answer' });
    expect(result.citations[0]!.excerpt).toBe(`${'x'.repeat(300)}…`);
    expect(result.citations[1]).toEqual({
      documentId: 'd2',
      documentName: 'b.pdf',
      excerpt: 'short',
      score: 0.5,
    });
    expect(AWS_BEDROCK.embedText).toHaveBeenCalledWith('who?');
    expect(Qdrant.search).toHaveBeenCalledWith('proj', [0.1], 5);
    const prompt = vi.mocked(AWS_BEDROCK.synthesize).mock.calls[0]![0];
    expect(prompt).toContain('[1] Source: "a.pdf"');
    expect(prompt).toContain('Question: who?');
    const metrics = Object.fromEntries(record.mock.calls.map(([n, v]) => [n, v]));
    expect(metrics).toMatchObject({ SearchQueries: 1, SearchZeroHits: 0, SearchEmptyAnswer: 0 });
  });

  it('records an empty answer', async () => {
    vi.spyOn(Qdrant, 'search').mockResolvedValue([
      { documentId: 'd', documentName: 'a', text: 't', score: 1 },
    ]);
    vi.spyOn(AWS_BEDROCK, 'synthesize').mockResolvedValue('  ');

    await invoke('search:query', 'proj', 'q');

    expect(record).toHaveBeenCalledWith('SearchEmptyAnswer', 1, { ModelId: 'model-id' });
  });

  it('says so when nothing relevant is found', async () => {
    vi.spyOn(Qdrant, 'search').mockResolvedValue([]);
    const synthesize = vi.spyOn(AWS_BEDROCK, 'synthesize');

    await expect(invoke('search:query', 'proj', 'q')).resolves.toEqual({
      success: true,
      answer: 'No relevant document passages were found for this question.',
      citations: [],
    });
    expect(synthesize).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith('SearchZeroHits', 1, { ModelId: 'model-id' });
  });

  it('rejects empty queries and an offline Qdrant', async () => {
    await expect(invoke('search:query', 'proj', '   ')).resolves.toEqual({
      success: false,
      error: 'Query is empty',
    });

    vi.spyOn(Qdrant, 'isAvailable').mockReturnValue(false);
    await expect(invoke('search:query', 'proj', 'q')).resolves.toEqual({
      success: false,
      error: 'Search is not available — Qdrant is offline',
    });
  });

  it('returns errors from the model', async () => {
    vi.spyOn(AWS_BEDROCK, 'embedText')
      .mockRejectedValueOnce(new Error('ThrottlingException'))
      .mockRejectedValueOnce('odd');

    await expect(invoke('search:query', 'proj', 'q')).resolves.toEqual({
      success: false,
      error: 'ThrottlingException',
    });
    await expect(invoke('search:query', 'proj', 'q')).resolves.toEqual({
      success: false,
      error: 'Search failed',
    });
  });
});

describe('graph handlers', () => {
  describe('graph:sync-project', () => {
    beforeEach(() => {
      vi.spyOn(AWS_DYNAMODB, 'getProjectMeta').mockResolvedValue({
        s3Prefix: 'o/p/',
        ownerSub: 'o',
        projectName: 'P',
      });
      vi.spyOn(Neo4J, 'loadGraph').mockResolvedValue();
    });

    it('loads only complete documents missing from the graph, in batches', async () => {
      const docs = Array.from({ length: 7 }, (_, i) => makeDoc({ documentId: `d${i}` }));
      vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockResolvedValue([
        ...docs,
        makeDoc({ documentId: 'q', processingStatus: 'QUEUED' }),
      ]);
      vi.spyOn(Neo4J, 'findMissingDocuments').mockResolvedValue(
        docs.slice(1).map((d) => d.documentId)
      );
      vi.spyOn(AWS_S3, 'getObjectText').mockImplementation(async (key) => {
        if (key.includes('d6')) throw new Error('NoSuchKey');
        return JSON.stringify(makeGraph());
      });

      await expect(invoke('graph:sync-project', 'proj-1')).resolves.toEqual({
        success: true,
        loaded: 5,
        failed: 1,
        total: 7,
      });
      expect(AWS_S3.getObjectText).toHaveBeenCalledWith(
        'user-sub/proj-1/analysis/d1.json',
        config.s3
      );
    });

    it('short-circuits when there is nothing to load', async () => {
      vi.spyOn(AWS_DYNAMODB, 'listDocuments')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeDoc()]);
      vi.spyOn(Neo4J, 'findMissingDocuments').mockResolvedValue([]);

      await expect(invoke('graph:sync-project', 'p')).resolves.toEqual({
        success: true,
        loaded: 0,
        failed: 0,
        total: 0,
      });
      await expect(invoke('graph:sync-project', 'p')).resolves.toEqual({
        success: true,
        loaded: 0,
        failed: 0,
        total: 1,
      });
    });

    it('fails for an unknown project or a lookup error', async () => {
      vi.spyOn(AWS_DYNAMODB, 'getProjectMeta')
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('boom'))
        .mockRejectedValueOnce('?');

      await expect(invoke('graph:sync-project', 'p')).resolves.toEqual({
        success: false,
        error: 'Project not found',
      });
      await expect(invoke('graph:sync-project', 'p')).resolves.toEqual({
        success: false,
        error: 'boom',
      });
      await expect(invoke('graph:sync-project', 'p')).resolves.toEqual({
        success: false,
        error: 'Sync failed',
      });
    });
  });

  describe('graph:get-node-detail', () => {
    it('resolves document names, falling back to the id', async () => {
      vi.spyOn(Neo4J, 'getNodeDetail').mockResolvedValue({
        connections: [],
        documentIds: ['d1', 'd2', 'd3'],
      });
      vi.spyOn(AWS_DYNAMODB, 'getDocumentName')
        .mockResolvedValueOnce('a.pdf')
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('ddb'));

      await expect(invoke('graph:get-node-detail', 'p', 'Jane', 'Person')).resolves.toEqual({
        success: true,
        connections: [],
        documents: [
          { documentId: 'd1', documentName: 'a.pdf' },
          { documentId: 'd2', documentName: 'd2' },
          { documentId: 'd3', documentName: 'd3' },
        ],
      });
    });

    it('returns graph errors', async () => {
      vi.spyOn(Neo4J, 'getNodeDetail')
        .mockRejectedValueOnce(new Error('offline'))
        .mockRejectedValueOnce(null);
      await expect(invoke('graph:get-node-detail', 'p', 'n', 't')).resolves.toEqual({
        success: false,
        error: 'offline',
      });
      await expect(invoke('graph:get-node-detail', 'p', 'n', 't')).resolves.toEqual({
        success: false,
        error: 'Failed to load node detail',
      });
    });
  });

  describe('graph:get-project-graph', () => {
    it('clamps the document threshold to at least 2', async () => {
      const getGraph = vi
        .spyOn(Neo4J, 'getProjectGraph')
        .mockResolvedValue({ nodes: [], edges: [] });

      await expect(invoke('graph:get-project-graph', 'p', 5)).resolves.toEqual({
        success: true,
        nodes: [],
        edges: [],
      });
      await invoke('graph:get-project-graph', 'p', 0);
      await invoke('graph:get-project-graph', 'p', Number.NaN);

      expect(getGraph.mock.calls.map(([, min]) => min)).toEqual([5, 2, 2]);
    });

    it('returns graph errors', async () => {
      vi.spyOn(Neo4J, 'getProjectGraph')
        .mockRejectedValueOnce(new Error('offline'))
        .mockRejectedValueOnce(undefined);
      await expect(invoke('graph:get-project-graph', 'p', 2)).resolves.toEqual({
        success: false,
        error: 'offline',
      });
      await expect(invoke('graph:get-project-graph', 'p', 2)).resolves.toEqual({
        success: false,
        error: 'Failed to load graph',
      });
    });
  });
});

it.each([
  ['search:query', ['p', 'q']],
  ['graph:sync-project', ['p']],
  ['graph:get-node-detail', ['p', 'n', 't']],
  ['graph:get-project-graph', ['p', 2]],
])('%s is unavailable until signed in', async (channel, args) => {
  appConfig = null;
  await expect(invoke(channel, ...args)).resolves.toEqual(notReady);
  appConfig = config;
  tokens = false;
  await expect(invoke(channel, ...args)).resolves.toEqual(notReady);
});
