import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startProjectPoller, stopProjectPoller } from '../../../main/services/project-poller';
import { embedAndStore } from '../../../main/services/embedder';
import { AWS_DYNAMODB } from '../../../classes/aws/dynamodb';
import { AWS_S3 } from '../../../classes/aws/s3';
import { Neo4J } from '../../../classes/neo4j';
import { Qdrant } from '../../../classes/qdrant';
import { DocumentRecord } from '../../../interfaces/document';
import { POLL_INTERVAL_MS } from '../../../constants/services/projectPoller';
import { Logger } from '../../../utils/logger';
import { makeConfig, makeDoc, makeGraph } from '../../helpers';
import { sentOn } from '../../mocks/electron';

// Only embedAndStore (Bedrock) is faked; loadStoredEmbeddings runs for real on the S3/Qdrant spies
vi.mock('../../../main/services/embedder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../main/services/embedder')>()),
  embedAndStore: vi.fn(),
}));

const config = makeConfig();
const project = (id = 'proj-1') => ({
  id,
  name: id,
  documentCount: 0,
  lastModified: '',
  role: 'OWNER' as const,
});

let projects = [project()];
let documents: DocumentRecord[] = [];
let s3: Record<string, string> = {};

const poll = () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

describe('project poller', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    projects = [project()];
    documents = [];
    s3 = {};
    vi.spyOn(AWS_DYNAMODB, 'listProjectsForUser').mockImplementation(async () => projects);
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockImplementation(async () => documents);
    vi.spyOn(AWS_S3, 'getObjectText').mockImplementation(async (key) => {
      if (key in s3) return s3[key]!;
      throw new Error(`NoSuchKey ${key}`);
    });
    vi.spyOn(Neo4J, 'loadGraph').mockResolvedValue();
    vi.spyOn(Neo4J, 'deleteDocument').mockResolvedValue();
    vi.spyOn(Neo4J, 'deleteProject').mockResolvedValue();
    vi.spyOn(Qdrant, 'isAvailable').mockReturnValue(true);
    vi.spyOn(Qdrant, 'loadDocument').mockResolvedValue();
    vi.spyOn(Qdrant, 'deleteDocument').mockResolvedValue();
    vi.spyOn(Qdrant, 'deleteProject').mockResolvedValue();
    vi.mocked(embedAndStore).mockResolvedValue();
  });

  afterEach(() => {
    stopProjectPoller();
    vi.useRealTimers();
  });

  it('only records a baseline on the first poll', async () => {
    documents = [makeDoc()];
    startProjectPoller('user-sub', config);

    await poll();

    expect(AWS_DYNAMODB.listDocuments).toHaveBeenCalledWith('proj-1', config.dynamoDB);
    expect(sentOn('document:added')).toEqual([]);
  });

  it('pushes documents added elsewhere and loads finished ones into the local stores', async () => {
    startProjectPoller('user-sub', config);
    await poll();

    const done = makeDoc({ documentId: 'done' });
    const queued = makeDoc({ documentId: 'queued', processingStatus: 'QUEUED' });
    documents = [done, queued];
    s3 = {
      'user-sub/proj-1/analysis/done.json': JSON.stringify(makeGraph('done')),
      'user-sub/proj-1/embeddings/done.json': JSON.stringify({
        documentId: 'done',
        projectId: 'proj-1',
        documentName: 'report.pdf',
        chunks: [{ chunkIndex: 0, text: 't', vector: [1] }],
      }),
    };
    await poll();

    expect(sentOn('document:added')).toEqual([done, queued]);
    expect(Neo4J.loadGraph).toHaveBeenCalledTimes(1);
    expect(Qdrant.loadDocument).toHaveBeenCalledWith([
      expect.objectContaining({ documentId: 'done', text: 't' }),
    ]);
  });

  it('falls back to re-embedding saved text, and tolerates missing artifacts', async () => {
    startProjectPoller('user-sub', config);
    await poll();

    documents = [
      makeDoc({ documentId: 'text-only' }),
      makeDoc({ documentId: 'nothing', processingStatus: 'GRAPH_FAILED' }),
    ];
    s3 = { 'user-sub/proj-1/text/text-only.txt': 'raw text' };
    await poll();

    expect(embedAndStore).toHaveBeenCalledWith(
      'user-sub',
      'proj-1',
      'text-only',
      'report.pdf',
      'raw text',
      config
    );
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Neo4j load failed'));
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Qdrant load failed'));
  });

  it('skips the Qdrant load while Qdrant is offline', async () => {
    startProjectPoller('user-sub', config);
    await poll();
    vi.spyOn(Qdrant, 'isAvailable').mockReturnValue(false);

    documents = [makeDoc()];
    s3 = { 'user-sub/proj-1/analysis/doc-1.json': JSON.stringify(makeGraph()) };
    await poll();

    expect(Neo4J.loadGraph).toHaveBeenCalled();
    expect(AWS_S3.getObjectText).toHaveBeenCalledTimes(1);
  });

  it('cleans up documents removed elsewhere', async () => {
    documents = [makeDoc({ documentId: 'a' }), makeDoc({ documentId: 'b' })];
    startProjectPoller('user-sub', config);
    await poll();

    vi.spyOn(Neo4J, 'deleteDocument').mockRejectedValue(new Error('neo4j down'));
    vi.spyOn(Qdrant, 'deleteDocument').mockRejectedValue('qdrant down');
    documents = [makeDoc({ documentId: 'a' })];
    await poll();

    expect(Neo4J.deleteDocument).toHaveBeenCalledWith('b');
    expect(Qdrant.deleteDocument).toHaveBeenCalledWith('b');
    expect(sentOn('document:removed')).toEqual([{ projectId: 'proj-1', documentId: 'b' }]);
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Qdrant cleanup for b: qdrant down')
    );

    // Qdrant cleanup is skipped while it is offline
    vi.spyOn(Qdrant, 'isAvailable').mockReturnValue(false);
    documents = [];
    await poll();
    expect(Qdrant.deleteDocument).toHaveBeenCalledTimes(1);
  });

  it('pushes status changes and loads documents that finished elsewhere', async () => {
    documents = [makeDoc({ processingStatus: 'PROCESSING' })];
    startProjectPoller('user-sub', config);
    await poll();
    await poll(); // unchanged status — nothing pushed

    documents = [makeDoc({ processingStatus: 'COMPLETE' })];
    s3 = { 'user-sub/proj-1/analysis/doc-1.json': JSON.stringify(makeGraph()) };
    await poll();

    expect(sentOn('document:status-update')).toEqual([
      { projectId: 'proj-1', documentId: 'doc-1', status: 'COMPLETE' },
    ]);
    expect(Neo4J.loadGraph).toHaveBeenCalledTimes(1);

    documents = [makeDoc({ processingStatus: 'FAILED' })];
    await poll();
    expect(sentOn('document:status-update')).toHaveLength(2);
    expect(Neo4J.loadGraph).toHaveBeenCalledTimes(1);
  });

  it('cleans up projects deleted elsewhere', async () => {
    projects = [project('keep'), project('gone')];
    documents = [makeDoc()];
    startProjectPoller('user-sub', config);
    await poll();

    vi.spyOn(Neo4J, 'deleteProject').mockRejectedValue(new Error('ignored'));
    projects = [project('keep')];
    await poll();

    expect(Neo4J.deleteProject).toHaveBeenCalledWith('gone');
    expect(Qdrant.deleteProject).toHaveBeenCalledWith('gone');
    expect(sentOn('project:removed')).toEqual([{ projectId: 'gone' }]);

    vi.spyOn(Qdrant, 'isAvailable').mockReturnValue(false);
    projects = [];
    await poll();
    expect(Qdrant.deleteProject).toHaveBeenCalledTimes(1);
  });

  it('keeps polling after an error', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listProjectsForUser').mockRejectedValueOnce(new Error('throttled'));
    startProjectPoller('user-sub', config);

    await poll();
    await poll();

    expect(Logger.error).toHaveBeenCalledWith('[project-poller] Poll error: throttled');
    expect(AWS_DYNAMODB.listProjectsForUser).toHaveBeenCalledTimes(2);
  });

  it('stops polling', async () => {
    startProjectPoller('user-sub', config);
    stopProjectPoller();

    await poll();

    expect(AWS_DYNAMODB.listProjectsForUser).not.toHaveBeenCalled();
  });
});
