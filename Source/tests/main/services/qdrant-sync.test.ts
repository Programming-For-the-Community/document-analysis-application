import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncQdrantForUser } from '../../../main/services/qdrant-sync';
import * as embedder from '../../../main/services/embedder';
import { AWS_DYNAMODB } from '../../../classes/aws/dynamodb';
import { AWS_S3 } from '../../../classes/aws/s3';
import { Qdrant } from '../../../classes/qdrant';
import { Logger } from '../../../utils/logger';
import { makeConfig, makeDoc, makeGraph } from '../../helpers';

vi.mock('../../../main/services/embedder', () => ({ embedAndStore: vi.fn() }));

const config = makeConfig();
const project = {
  id: 'proj-1',
  name: 'P',
  documentCount: 0,
  lastModified: '',
  role: 'OWNER' as const,
};

// S3 objects by key; anything else is NoSuchKey
function s3Objects(objects: Record<string, string>) {
  vi.spyOn(AWS_S3, 'getObjectText').mockImplementation(async (key) => {
    if (key in objects) return objects[key]!;
    throw new Error(`NoSuchKey: ${key}`);
  });
}

describe('syncQdrantForUser', () => {
  beforeEach(() => {
    vi.spyOn(Qdrant, 'isAvailable').mockReturnValue(true);
    vi.spyOn(Qdrant, 'loadDocument').mockResolvedValue();
    vi.spyOn(AWS_DYNAMODB, 'listProjectsForUser').mockResolvedValue([project]);
    vi.spyOn(Qdrant, 'findMissingDocuments').mockImplementation(async (_p, ids) => ids);
    vi.mocked(embedder.embedAndStore).mockResolvedValue();
  });

  it('does nothing while Qdrant is offline', async () => {
    vi.spyOn(Qdrant, 'isAvailable').mockReturnValue(false);
    await syncQdrantForUser('user-sub', config);
    expect(AWS_DYNAMODB.listProjectsForUser).not.toHaveBeenCalled();
  });

  it('includes GRAPH_FAILED documents and skips projects already in sync', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listProjectsForUser').mockResolvedValue([
      project,
      { ...project, id: 'none' },
    ]);
    vi.spyOn(AWS_DYNAMODB, 'listDocuments')
      .mockResolvedValueOnce([
        makeDoc({ documentId: 'a' }),
        makeDoc({ documentId: 'b', processingStatus: 'GRAPH_FAILED' }),
        makeDoc({ documentId: 'c', processingStatus: 'PROCESSING' }),
      ])
      .mockResolvedValueOnce([makeDoc({ processingStatus: 'FAILED' })]);
    vi.spyOn(Qdrant, 'findMissingDocuments').mockResolvedValue([]);

    await syncQdrantForUser('user-sub', config);

    expect(Qdrant.findMissingDocuments).toHaveBeenCalledTimes(1);
    expect(Qdrant.findMissingDocuments).toHaveBeenCalledWith('proj-1', ['a', 'b']);
    expect(Qdrant.loadDocument).not.toHaveBeenCalled();
  });

  it('prefers the saved embedding file', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockResolvedValue([makeDoc()]);
    s3Objects({
      'user-sub/proj-1/embeddings/doc-1.json': JSON.stringify({
        documentId: 'doc-1',
        projectId: 'proj-1',
        documentName: 'report.pdf',
        chunks: [{ chunkIndex: 0, text: 't', vector: [1] }],
      }),
    });

    await syncQdrantForUser('user-sub', config);

    expect(Qdrant.loadDocument).toHaveBeenCalledWith([
      {
        chunkIndex: 0,
        text: 't',
        vector: [1],
        documentId: 'doc-1',
        projectId: 'proj-1',
        documentName: 'report.pdf',
      },
    ]);
    expect(embedder.embedAndStore).not.toHaveBeenCalled();
  });

  it('re-embeds from saved raw text when there is no embedding file', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockResolvedValue([makeDoc()]);
    s3Objects({ 'user-sub/proj-1/text/doc-1.txt': 'raw text' });

    await syncQdrantForUser('user-sub', config);

    expect(embedder.embedAndStore).toHaveBeenCalledWith(
      'user-sub',
      'proj-1',
      'doc-1',
      'report.pdf',
      'raw text',
      config
    );
  });

  it('recovers legacy text files from the original upload', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockResolvedValue([
      makeDoc({ documentName: 'notes.TXT' }),
    ]);
    s3Objects({ 'user-sub/proj-1/doc-1': 'original text' });

    await syncQdrantForUser('user-sub', config);

    expect(embedder.embedAndStore).toHaveBeenCalledWith(
      'user-sub',
      'proj-1',
      'doc-1',
      'notes.TXT',
      'original text',
      config
    );
  });

  it('recovers legacy PDFs from the analysis graph', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockResolvedValue([makeDoc()]);
    s3Objects({ 'user-sub/proj-1/analysis/doc-1.json': JSON.stringify(makeGraph()) });

    await syncQdrantForUser('user-sub', config);

    const [, , , , text] = vi.mocked(embedder.embedAndStore).mock.calls[0]!;
    expect(text).toContain('Jane Doe (Person)');
    expect(text).toContain('Jane Doe — EMPLOYED BY — Acme Corp');
  });

  it('gives up on legacy PDFs with no analysis or no entities', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockResolvedValue([
      makeDoc({ documentId: 'none' }),
      makeDoc({ documentId: 'empty' }),
    ]);
    s3Objects({
      'user-sub/proj-1/analysis/empty.json': JSON.stringify({
        ...makeGraph('empty'),
        entities: [],
      }),
    });

    await syncQdrantForUser('user-sub', config);

    expect(embedder.embedAndStore).not.toHaveBeenCalled();
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('cannot embed'));
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('no entities'));
  });

  it('logs per-document, per-project and top-level failures without throwing', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listProjectsForUser').mockResolvedValue([
      { ...project, id: 'bad', name: 'Bad' },
      project,
    ]);
    vi.spyOn(AWS_DYNAMODB, 'listDocuments')
      .mockRejectedValueOnce('ddb down')
      .mockResolvedValueOnce([makeDoc()]);
    s3Objects({ 'user-sub/proj-1/analysis/doc-1.json': 'not json' });

    await syncQdrantForUser('user-sub', config);

    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('error processing project "Bad" (bad): ddb down')
    );
    expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('failed for "report.pdf"'));

    vi.spyOn(AWS_DYNAMODB, 'listProjectsForUser').mockRejectedValue(new Error('offline'));
    await expect(syncQdrantForUser('user-sub', config)).resolves.toBeUndefined();
    expect(Logger.error).toHaveBeenCalledWith('Qdrant sync: failed: offline');
  });
});
