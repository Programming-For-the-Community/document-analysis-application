import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncNeo4jForUser } from '../../../main/services/neo4j-sync';
import { AWS_DYNAMODB } from '../../../classes/aws/dynamodb';
import { AWS_S3 } from '../../../classes/aws/s3';
import { Neo4J } from '../../../classes/neo4j';
import { Logger } from '../../../utils/logger';
import { makeConfig, makeDoc, makeGraph } from '../../helpers';

const config = makeConfig();
const project = (id: string) => ({
  id,
  name: id,
  documentCount: 0,
  lastModified: '',
  role: 'OWNER' as const,
});

describe('syncNeo4jForUser', () => {
  beforeEach(() => {
    vi.spyOn(AWS_DYNAMODB, 'listProjectsForUser').mockResolvedValue([project('p1')]);
    vi.spyOn(Neo4J, 'loadGraph').mockResolvedValue();
  });

  it('loads analysis JSON for COMPLETE documents missing from the graph', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockResolvedValue([
      makeDoc({ documentId: 'have' }),
      makeDoc({ documentId: 'missing' }),
      makeDoc({ documentId: 'failed', processingStatus: 'GRAPH_FAILED' }),
    ]);
    const findMissing = vi.spyOn(Neo4J, 'findMissingDocuments').mockResolvedValue(['missing']);
    vi.spyOn(AWS_S3, 'getObjectText').mockResolvedValue(JSON.stringify(makeGraph('missing')));

    await syncNeo4jForUser('user-sub', config);

    expect(findMissing).toHaveBeenCalledWith(['have', 'missing']);
    expect(AWS_S3.getObjectText).toHaveBeenCalledWith(
      'user-sub/proj-1/analysis/missing.json',
      config.s3
    );
    expect(Neo4J.loadGraph).toHaveBeenCalledWith(makeGraph('missing'));
  });

  it('skips projects with nothing complete or nothing missing', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listProjectsForUser').mockResolvedValue([
      project('empty'),
      project('synced'),
    ]);
    vi.spyOn(AWS_DYNAMODB, 'listDocuments')
      .mockResolvedValueOnce([makeDoc({ processingStatus: 'QUEUED' })])
      .mockResolvedValueOnce([makeDoc()]);
    const findMissing = vi.spyOn(Neo4J, 'findMissingDocuments').mockResolvedValue([]);

    await syncNeo4jForUser('user-sub', config);

    expect(findMissing).toHaveBeenCalledTimes(1);
    expect(Neo4J.loadGraph).not.toHaveBeenCalled();
  });

  it('logs per-document, per-project and top-level failures without throwing', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listProjectsForUser').mockResolvedValue([
      project('bad'),
      project('good'),
    ]);
    vi.spyOn(AWS_DYNAMODB, 'listDocuments')
      .mockRejectedValueOnce(new Error('ddb down'))
      .mockResolvedValueOnce([makeDoc()]);
    vi.spyOn(Neo4J, 'findMissingDocuments').mockResolvedValue(['doc-1']);
    vi.spyOn(AWS_S3, 'getObjectText').mockRejectedValue('no such key');

    await syncNeo4jForUser('user-sub', config);

    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('error processing project "bad"')
    );
    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to load "report.pdf" (doc-1): no such key')
    );

    vi.spyOn(AWS_DYNAMODB, 'listProjectsForUser').mockRejectedValue('offline');
    await expect(syncNeo4jForUser('user-sub', config)).resolves.toBeUndefined();
    expect(Logger.error).toHaveBeenCalledWith('Neo4j sync: failed: offline');
  });
});
