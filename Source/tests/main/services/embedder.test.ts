import { beforeEach, describe, expect, it, vi } from 'vitest';

import { embedAndStore, saveDocumentText } from '../../../main/services/embedder';
import { discardDocumentArtifacts, analysisKey } from '../../../main/services/document-artifacts';
import { AWS_BEDROCK } from '../../../classes/aws/bedrock';
import { AWS_S3 } from '../../../classes/aws/s3';
import { Neo4J } from '../../../classes/neo4j';
import { Qdrant } from '../../../classes/qdrant';
import { Logger } from '../../../utils/logger';
import { makeConfig } from '../../helpers';

const config = makeConfig();

describe('embedder', () => {
  beforeEach(() => {
    vi.spyOn(AWS_S3, 'putText').mockResolvedValue();
    vi.spyOn(AWS_S3, 'putJson').mockResolvedValue();
    vi.spyOn(Qdrant, 'loadDocument').mockResolvedValue();
    vi.spyOn(AWS_BEDROCK, 'embedText').mockImplementation(async (t) => [t.length]);
  });

  it('saves raw text under the document text key', async () => {
    await saveDocumentText('o', 'p', 'd', 'text', config);
    expect(AWS_S3.putText).toHaveBeenCalledWith('o/p/text/d.txt', 'text', config.s3);
  });

  it('embeds each chunk, writes the embedding file, then loads Qdrant', async () => {
    await embedAndStore('o', 'p', 'd', 'a.txt', 'Some document text.', config);

    expect(AWS_S3.putJson).toHaveBeenCalledWith(
      'o/p/embeddings/d.json',
      {
        documentId: 'd',
        projectId: 'p',
        documentName: 'a.txt',
        chunks: [{ chunkIndex: 0, text: 'Some document text.', vector: [19] }],
      },
      config.s3
    );
    expect(Qdrant.loadDocument).toHaveBeenCalledWith([
      {
        chunkIndex: 0,
        text: 'Some document text.',
        vector: [19],
        documentId: 'd',
        projectId: 'p',
        documentName: 'a.txt',
      },
    ]);
  });

  it('skips documents with no text', async () => {
    await embedAndStore('o', 'p', 'd', 'a.txt', '   ', config);
    expect(AWS_BEDROCK.embedText).not.toHaveBeenCalled();
    expect(AWS_S3.putJson).not.toHaveBeenCalled();
  });
});

describe('document artifacts', () => {
  const doc = { ownerSub: 'o', projectId: 'p', documentId: 'd' };

  it('builds the analysis key', () => {
    expect(analysisKey(doc)).toBe('o/p/analysis/d.json');
  });

  it('removes S3 objects, graph and vectors', async () => {
    vi.spyOn(AWS_S3, 'deleteKeys').mockResolvedValue();
    vi.spyOn(Neo4J, 'deleteDocument').mockResolvedValue();
    vi.spyOn(Qdrant, 'deleteDocument').mockResolvedValue();

    await discardDocumentArtifacts(doc, config);

    expect(AWS_S3.deleteKeys).toHaveBeenCalledWith(
      ['o/p/analysis/d.json', 'o/p/text/d.txt', 'o/p/embeddings/d.json'],
      config.s3
    );
    expect(Neo4J.deleteDocument).toHaveBeenCalledWith('d');
    expect(Qdrant.deleteDocument).toHaveBeenCalledWith('d');
  });

  it('keeps going when individual cleanups fail', async () => {
    vi.spyOn(AWS_S3, 'deleteKeys').mockRejectedValue(new Error('s3 down'));
    vi.spyOn(Neo4J, 'deleteDocument').mockRejectedValue('neo4j down');
    vi.spyOn(Qdrant, 'deleteDocument').mockResolvedValue();

    await expect(discardDocumentArtifacts(doc, config)).resolves.toBeUndefined();

    expect(Qdrant.deleteDocument).toHaveBeenCalled();
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('S3 cleanup failed (non-fatal): s3 down')
    );
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Neo4j cleanup failed (non-fatal): neo4j down')
    );
  });
});
