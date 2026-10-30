import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerDocumentHandlers } from '../../../main/handlers/documents';
import { embedAndStore, saveDocumentText } from '../../../main/services/embedder';
import { discardDocumentArtifacts } from '../../../main/services/document-artifacts';
import { extractTextFromBuffer } from '../../../main/services/doc-extractor';
import { AWS_DYNAMODB } from '../../../classes/aws/dynamodb';
import { AWS_S3 } from '../../../classes/aws/s3';
import { AWS_TEXTRACT } from '../../../classes/aws/textract';
import { AWS_BEDROCK } from '../../../classes/aws/bedrock';
import { Neo4J } from '../../../classes/neo4j';
import { Qdrant } from '../../../classes/qdrant';
import { GraphExtractionError } from '../../../classes/graphExtractionError';
import { DocumentRecord } from '../../../interfaces/document';
import { ProjectRole } from '../../../types/app';
import { CognitoAuthResult } from '../../../types/aws';
import { Logger } from '../../../utils/logger';
import { flushPromises, makeConfig, makeDoc, makeGraph, makeTokens } from '../../helpers';
import { dialog, invoke, BrowserWindow, mainWindow, sentOn } from '../../mocks/electron';

vi.mock('../../../main/services/embedder', () => ({
  embedAndStore: vi.fn(),
  saveDocumentText: vi.fn(),
}));
vi.mock('../../../main/services/doc-extractor', () => ({ extractTextFromBuffer: vi.fn() }));
vi.mock('../../../main/services/document-artifacts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  discardDocumentArtifacts: vi.fn(),
}));

const config = makeConfig();
const MINUTE = 60_000;
const awsError = () => Object.assign(new Error('arn:aws:iam::123 denied'), { $metadata: {} });

let appConfig: typeof config | null;
let tokens: CognitoAuthResult | null;

const statusesFor = (documentId: string) =>
  sentOn('document:status-update')
    .filter((u) => (u as { documentId: string }).documentId === documentId)
    .map((u) => (u as { status: string }).status);

const statusWrites = () =>
  vi
    .mocked(AWS_DYNAMODB.updateDocumentStatus)
    .mock.calls.map(([, documentId, status]) => `${documentId}:${status}`);

beforeEach(() => {
  appConfig = config;
  tokens = makeTokens();
  vi.spyOn(AWS_DYNAMODB, 'getProjectRole').mockResolvedValue('OWNER');
  vi.spyOn(AWS_DYNAMODB, 'updateDocumentStatus').mockResolvedValue(true);
  vi.spyOn(AWS_S3, 'putJson').mockResolvedValue();
  vi.spyOn(Neo4J, 'loadGraph').mockResolvedValue();
  vi.spyOn(AWS_BEDROCK, 'extractRelationshipsFromText').mockImplementation(async (_t, documentId) =>
    makeGraph(documentId)
  );
  vi.spyOn(AWS_TEXTRACT, 'startDocumentAnalysis').mockResolvedValue('job-1');
  vi.mocked(saveDocumentText).mockResolvedValue();
  vi.mocked(embedAndStore).mockResolvedValue();
  vi.mocked(discardDocumentArtifacts).mockResolvedValue();
  registerDocumentHandlers(
    () => appConfig,
    () => tokens
  );
});

describe('document:upload', () => {
  let tmpDir: string;
  const file = (name: string, size = 10) => ({ name, path: path.join(tmpDir, name), size });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-test-'));
    vi.spyOn(AWS_DYNAMODB, 'getProjectMeta').mockResolvedValue({
      s3Prefix: 'owner/proj-1/',
      ownerSub: 'owner',
      projectName: 'P',
    });
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockResolvedValue([
      makeDoc({ documentName: 'existing.pdf', fileSize: 10 }),
    ]);
    vi.spyOn(AWS_DYNAMODB, 'addDocumentRecord').mockResolvedValue();
    vi.spyOn(AWS_DYNAMODB, 'incrementDocumentCount').mockResolvedValue();
    vi.spyOn(AWS_S3, 'uploadDocument').mockResolvedValue();
    vi.spyOn(AWS_S3, 'getObjectText').mockResolvedValue('plain text');
    vi.spyOn(AWS_S3, 'getObjectBytes').mockResolvedValue(new Uint8Array([1]));
    vi.mocked(extractTextFromBuffer).mockResolvedValue('office text');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  type UploadResult = {
    success: boolean;
    uploaded: DocumentRecord[];
    failed: Array<{ name: string; error: string }>;
  };

  it('uploads each file under the project prefix and records it', async () => {
    const result = await invoke<UploadResult>('document:upload', 'proj-1', [file('scan.pdf', 42)]);

    expect(result.success).toBe(true);
    const [uploaded] = result.uploaded;
    expect(uploaded).toMatchObject({
      projectId: 'proj-1',
      ownerSub: 'owner',
      documentName: 'scan.pdf',
      fileSize: 42,
      processingStatus: 'QUEUED',
    });
    expect(uploaded!.s3Key).toBe(`owner/proj-1/${uploaded!.documentId}`);
    expect(AWS_S3.uploadDocument).toHaveBeenCalledWith(
      file('scan.pdf').path,
      uploaded!.s3Key,
      42,
      config.s3,
      'scan.pdf',
      'P'
    );
    expect(AWS_DYNAMODB.addDocumentRecord).toHaveBeenCalledWith(
      expect.objectContaining({ processingStatus: 'UNPROCESSED' }),
      config.dynamoDB
    );
    expect(AWS_DYNAMODB.incrementDocumentCount).toHaveBeenCalledWith('proj-1', 1, config.dynamoDB);
  });

  it('submits PDFs and images to Textract', async () => {
    const { uploaded } = await invoke<UploadResult>('document:upload', 'proj-1', [
      file('scan.PNG'),
    ]);

    expect(AWS_TEXTRACT.startDocumentAnalysis).toHaveBeenCalledWith(
      uploaded[0]!.s3Key,
      'doc-bucket',
      config.sns.topicArn,
      uploaded[0]!.documentId
    );
    expect(statusWrites()).toEqual([`${uploaded[0]!.documentId}:QUEUED`]);
    expect(AWS_DYNAMODB.updateDocumentStatus).toHaveBeenCalledWith(
      'proj-1',
      uploaded[0]!.documentId,
      'QUEUED',
      config.dynamoDB,
      'job-1'
    );
  });

  it('logs a failed Textract submission without failing the upload', async () => {
    vi.spyOn(AWS_TEXTRACT, 'startDocumentAnalysis').mockRejectedValue(new Error('InvalidS3Object'));

    const result = await invoke<UploadResult>('document:upload', 'proj-1', [file('scan.pdf')]);

    expect(result.uploaded).toHaveLength(1);
    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Enqueue FAILED: InvalidS3Object')
    );
  });

  it('processes plain text directly, without Textract', async () => {
    const { uploaded } = await invoke<UploadResult>('document:upload', 'proj-1', [
      file('notes.md'),
    ]);
    const id = uploaded[0]!.documentId;

    expect(AWS_TEXTRACT.startDocumentAnalysis).not.toHaveBeenCalled();
    expect(saveDocumentText).toHaveBeenCalledWith('owner', 'proj-1', id, 'plain text', config);
    expect(AWS_S3.putJson).toHaveBeenCalledWith(
      `owner/proj-1/analysis/${id}.json`,
      makeGraph(id),
      config.s3
    );
    expect(Neo4J.loadGraph).toHaveBeenCalled();
    expect(embedAndStore).toHaveBeenCalledWith(
      'owner',
      'proj-1',
      id,
      'notes.md',
      'plain text',
      config
    );
    expect(statusWrites()).toEqual([`${id}:PROCESSING`, `${id}:COMPLETE`]);
    expect(statusesFor(id)).toEqual(['PROCESSING', 'COMPLETE']);
  });

  it('extracts Office and HTML text locally', async () => {
    const { uploaded } = await invoke<UploadResult>('document:upload', 'proj-1', [
      file('sheet.xlsx'),
    ]);

    expect(extractTextFromBuffer).toHaveBeenCalledWith(Buffer.from([1]), 'sheet.xlsx');
    expect(embedAndStore).toHaveBeenCalledWith(
      'owner',
      'proj-1',
      uploaded[0]!.documentId,
      'sheet.xlsx',
      'office text',
      config
    );
  });

  it('keeps a document searchable as GRAPH_FAILED when extraction fails', async () => {
    vi.spyOn(AWS_BEDROCK, 'extractRelationshipsFromText').mockRejectedValue(
      new GraphExtractionError('x')
    );

    const { uploaded } = await invoke<UploadResult>('document:upload', 'proj-1', [
      file('notes.txt'),
    ]);
    const id = uploaded[0]!.documentId;

    expect(AWS_S3.putJson).toHaveBeenCalledWith(
      expect.any(String),
      { documentId: id, projectId: 'proj-1', entities: [], relationships: [] },
      config.s3
    );
    expect(Neo4J.loadGraph).not.toHaveBeenCalled();
    expect(embedAndStore).toHaveBeenCalled();
    expect(statusesFor(id)).toEqual(['PROCESSING', 'GRAPH_FAILED']);
  });

  it('treats graph and embedding store failures as non-fatal', async () => {
    vi.spyOn(Neo4J, 'loadGraph').mockRejectedValue(new Error('neo4j down'));
    vi.mocked(embedAndStore).mockRejectedValue('qdrant down');

    const { uploaded } = await invoke<UploadResult>('document:upload', 'proj-1', [
      file('notes.txt'),
    ]);

    expect(statusesFor(uploaded[0]!.documentId)).toEqual(['PROCESSING', 'COMPLETE']);
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Neo4j load failed (non-fatal): neo4j down')
    );
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Qdrant embedding failed (non-fatal): qdrant down')
    );
  });

  it('marks the document FAILED when direct processing breaks', async () => {
    vi.spyOn(AWS_BEDROCK, 'extractRelationshipsFromText').mockRejectedValue(
      new Error('ThrottlingException')
    );

    const { uploaded } = await invoke<UploadResult>('document:upload', 'proj-1', [
      file('notes.txt'),
    ]);
    const id = uploaded[0]!.documentId;

    expect(statusWrites()).toEqual([`${id}:PROCESSING`, `${id}:FAILED`]);
    expect(statusesFor(id)).toEqual(['PROCESSING', 'FAILED']);
  });

  it('does not report FAILED for a document deleted while failing', async () => {
    vi.spyOn(AWS_S3, 'getObjectText').mockRejectedValue('NoSuchKey');
    vi.mocked(AWS_DYNAMODB.updateDocumentStatus)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const { uploaded } = await invoke<UploadResult>('document:upload', 'proj-1', [
      file('notes.txt'),
    ]);

    expect(statusesFor(uploaded[0]!.documentId)).toEqual(['PROCESSING']);
  });

  it('skips documents deleted before processing and cleans up those deleted during it', async () => {
    vi.mocked(AWS_DYNAMODB.updateDocumentStatus)
      .mockResolvedValueOnce(false) // first file: gone before PROCESSING
      .mockResolvedValueOnce(true) // second file: PROCESSING ok…
      .mockResolvedValueOnce(false); // …but gone by COMPLETE

    const { uploaded } = await invoke<UploadResult>('document:upload', 'proj-1', [
      file('a.txt'),
      file('b.txt'),
    ]);

    expect(saveDocumentText).toHaveBeenCalledTimes(1);
    expect(discardDocumentArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: uploaded[1]!.documentId }),
      config
    );
    expect(statusesFor(uploaded[1]!.documentId)).toEqual(['PROCESSING']);
  });

  it('rejects unsupported types and duplicates, uploading the rest', async () => {
    vi.spyOn(AWS_S3, 'uploadDocument').mockImplementation(async (_p, _k, _s, _c, name) => {
      if (name === 'broken.pdf') throw awsError();
      if (name === 'locked.pdf') throw new Error('File is locked');
    });

    const result = await invoke<UploadResult>('document:upload', 'proj-1', [
      file('virus.exe'),
      file('existing.pdf', 10),
      file('existing.pdf', 11),
      file('broken.pdf'),
      file('locked.pdf'),
    ]);

    expect(result.uploaded.map((d) => d.documentName)).toEqual(['existing.pdf']);
    expect(result.failed).toEqual([
      { name: 'virus.exe', error: expect.stringContaining('Unsupported file type') },
      {
        name: 'existing.pdf',
        error: 'A file with this name and size already exists in the project',
      },
      { name: 'broken.pdf', error: 'Upload failed' },
      { name: 'locked.pdf', error: 'File is locked' },
    ]);
  });

  it('does not touch the document count when nothing uploaded', async () => {
    await invoke('document:upload', 'proj-1', [file('virus.exe')]);
    expect(AWS_DYNAMODB.incrementDocumentCount).not.toHaveBeenCalled();
  });

  it('refuses viewers and unknown projects', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getProjectRole')
      .mockResolvedValueOnce('VIEW')
      .mockResolvedValueOnce('EDIT');
    vi.spyOn(AWS_DYNAMODB, 'getProjectMeta').mockResolvedValue(null);

    await expect(invoke('document:upload', 'p', [])).resolves.toEqual({
      success: false,
      error: 'Not authorized to upload documents to this project',
    });
    await expect(invoke('document:upload', 'p', [])).resolves.toEqual({
      success: false,
      error: 'Project not found',
    });
  });

  it('reports failures', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getProjectRole').mockRejectedValue(awsError());
    await expect(invoke('document:upload', 'p', [])).resolves.toEqual({
      success: false,
      error: 'Upload failed. Please try again.',
    });
  });
});

describe('file pickers', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'picker-test-'));
    fs.writeFileSync(path.join(tmpDir, 'a.pdf'), '12345');
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'b.txt'), '123');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the selected files with their sizes', async () => {
    dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [path.join(tmpDir, 'a.pdf')],
    });

    await expect(invoke('document:select-files')).resolves.toEqual({
      success: true,
      files: [{ name: 'a.pdf', path: path.join(tmpDir, 'a.pdf'), size: 5 }],
    });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      mainWindow,
      expect.objectContaining({ properties: ['openFile', 'multiSelections'] })
    );
  });

  it('walks a selected folder recursively', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [tmpDir] });

    const { files } = await invoke<{ files: Array<{ name: string; size: number }> }>(
      'document:select-folder'
    );

    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted.map((f) => [f.name, f.size])).toEqual([
      ['a.pdf', 5],
      ['b.txt', 3],
    ]);
  });

  it.each(['document:select-files', 'document:select-folder'])(
    '%s returns nothing when cancelled',
    async (channel) => {
      BrowserWindow.fromWebContents.mockReturnValue(null);
      dialog.showOpenDialog
        .mockResolvedValueOnce({ canceled: true, filePaths: [] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [] });

      await expect(invoke(channel)).resolves.toEqual({ success: true, files: [] });
      await expect(invoke(channel)).resolves.toEqual({ success: true, files: [] });
    }
  );
});

describe('document:list', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-01T12:00:00Z') });
    vi.spyOn(AWS_S3, 'getObjectText').mockResolvedValue('text');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  it('returns documents, enqueueing unprocessed ones in the background', async () => {
    const docs = [
      makeDoc({ documentId: 'done' }),
      makeDoc({ documentId: 'new', documentName: 'a.txt', processingStatus: 'UNPROCESSED' }),
    ];
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockResolvedValue(docs);

    await expect(invoke('document:list', 'proj-1')).resolves.toEqual({
      success: true,
      documents: docs,
    });
    await flushPromises();

    expect(statusWrites()).toEqual(['new:PROCESSING', 'new:COMPLETE']);
  });

  it('marks unsupported unprocessed documents FAILED', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockResolvedValue([
      makeDoc({ documentName: 'a.exe', processingStatus: 'UNPROCESSED' }),
    ]);

    await invoke('document:list', 'proj-1');
    await flushPromises();

    expect(statusWrites()).toEqual(['doc-1:FAILED']);
  });

  it('resolves stale QUEUED documents from their Textract job status', async () => {
    const stale = ago(31 * MINUTE);
    const docs = [
      makeDoc({
        documentId: 'fresh',
        processingStatus: 'QUEUED',
        queuedAt: ago(MINUTE),
        textractJobId: 'j0',
      }),
      makeDoc({
        documentId: 'succeeded',
        processingStatus: 'QUEUED',
        queuedAt: stale,
        textractJobId: 'j1',
      }),
      makeDoc({
        documentId: 'running',
        processingStatus: 'QUEUED',
        queuedAt: stale,
        textractJobId: 'j2',
      }),
      makeDoc({
        documentId: 'failed',
        processingStatus: 'QUEUED',
        queuedAt: stale,
        textractJobId: 'j3',
      }),
      makeDoc({
        documentId: 'expired',
        processingStatus: 'QUEUED',
        queuedAt: stale,
        textractJobId: 'j4',
      }),
      makeDoc({ documentId: 'no-job', processingStatus: 'QUEUED', queuedAt: stale }),
      makeDoc({ documentId: 'no-date', processingStatus: 'QUEUED', textractJobId: 'j1' }),
    ];
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockResolvedValue(docs);
    vi.spyOn(AWS_TEXTRACT, 'getJobStatus').mockImplementation(async (jobId) => {
      if (jobId === 'j1') return { status: 'SUCCEEDED', message: '' };
      if (jobId === 'j2') return { status: 'IN_PROGRESS', message: '' };
      if (jobId === 'j3') return { status: 'FAILED', message: 'bad pdf' };
      throw new Error('InvalidJobIdException');
    });

    const { documents } = await invoke<{ documents: DocumentRecord[] }>('document:list', 'proj-1');

    const status = Object.fromEntries(documents.map((d) => [d.documentId, d.processingStatus]));
    expect(status).toEqual({
      fresh: 'QUEUED',
      succeeded: 'QUEUED',
      running: 'QUEUED',
      failed: 'UNPROCESSED',
      expired: 'UNPROCESSED',
      'no-job': 'UNPROCESSED',
      'no-date': 'QUEUED',
    });
    expect(AWS_TEXTRACT.getJobStatus).not.toHaveBeenCalledWith('j0');
  });

  it('resets stale PROCESSING documents based on Textract result retention', async () => {
    const docs = [
      makeDoc({
        documentId: 'active',
        processingStatus: 'PROCESSING',
        statusUpdatedAt: ago(MINUTE),
      }),
      makeDoc({
        documentId: 'requeue',
        processingStatus: 'PROCESSING',
        statusUpdatedAt: ago(3 * 60 * MINUTE),
        queuedAt: ago(24 * 60 * MINUTE),
      }),
      makeDoc({
        documentId: 'expired',
        processingStatus: 'PROCESSING',
        statusUpdatedAt: ago(3 * 60 * MINUTE),
        queuedAt: ago(8 * 24 * 60 * MINUTE),
      }),
      makeDoc({ documentId: 'unknown', documentName: 'x.exe', processingStatus: 'PROCESSING' }),
    ];
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockResolvedValue(docs);

    const { documents } = await invoke<{ documents: DocumentRecord[] }>('document:list', 'proj-1');

    expect(Object.fromEntries(documents.map((d) => [d.documentId, d.processingStatus]))).toEqual({
      active: 'PROCESSING',
      requeue: 'QUEUED',
      expired: 'UNPROCESSED',
      unknown: 'UNPROCESSED',
    });
    expect(statusWrites()).toEqual(
      expect.arrayContaining(['requeue:QUEUED', 'expired:UNPROCESSED', 'unknown:UNPROCESSED'])
    );
  });

  it('reports failures', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listDocuments').mockRejectedValue(awsError());
    await expect(invoke('document:list', 'p')).resolves.toEqual({
      success: false,
      error: 'Failed to load documents. Please try again.',
    });
  });
});

describe('document:delete', () => {
  beforeEach(() => {
    vi.spyOn(AWS_DYNAMODB, 'getDocumentRecord').mockResolvedValue({
      ownerSub: 'o',
      s3Key: 'o/p/d',
      documentName: 'a.pdf',
    });
    vi.spyOn(AWS_DYNAMODB, 'deleteDocument').mockResolvedValue();
    vi.spyOn(AWS_S3, 'deleteKeys').mockResolvedValue();
    vi.spyOn(Neo4J, 'deleteDocument').mockResolvedValue();
    vi.spyOn(Qdrant, 'deleteDocument').mockResolvedValue();
  });

  it('removes the record, every S3 object and the local store entries', async () => {
    await expect(invoke('document:delete', 'p', 'd')).resolves.toEqual({ success: true });

    expect(AWS_DYNAMODB.deleteDocument).toHaveBeenCalledWith('p', 'd', config.dynamoDB);
    expect(AWS_S3.deleteKeys).toHaveBeenCalledWith(
      ['o/p/d', 'o/p/analysis/d.json', 'o/p/text/d.txt', 'o/p/embeddings/d.json'],
      config.s3
    );
    expect(Neo4J.deleteDocument).toHaveBeenCalledWith('d');
    expect(Qdrant.deleteDocument).toHaveBeenCalledWith('d');
  });

  it('treats local store cleanup as non-fatal', async () => {
    vi.spyOn(Neo4J, 'deleteDocument').mockRejectedValue(new Error('neo4j down'));
    vi.spyOn(Qdrant, 'deleteDocument').mockRejectedValue('qdrant down');

    await expect(invoke('document:delete', 'p', 'd')).resolves.toEqual({ success: true });
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Qdrant cleanup failed (non-fatal): qdrant down')
    );
  });

  it('refuses viewers and unknown documents', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getProjectRole').mockResolvedValueOnce('VIEW' as ProjectRole);
    vi.spyOn(AWS_DYNAMODB, 'getDocumentRecord').mockResolvedValue(null);

    await expect(invoke('document:delete', 'p', 'd')).resolves.toEqual({
      success: false,
      error: 'Not authorized to delete documents from this project',
    });
    await expect(invoke('document:delete', 'p', 'd')).resolves.toEqual({
      success: false,
      error: 'Document not found',
    });
  });

  it('reports failures', async () => {
    vi.spyOn(AWS_DYNAMODB, 'deleteDocument').mockRejectedValue(awsError());
    await expect(invoke('document:delete', 'p', 'd')).resolves.toEqual({
      success: false,
      error: 'Failed to delete document. Please try again.',
    });
  });
});

describe('document:get-text', () => {
  it('returns the saved text', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getDocumentRecord').mockResolvedValue({
      ownerSub: 'o',
      s3Key: 'k',
      documentName: 'a',
    });
    vi.spyOn(AWS_S3, 'getObjectText')
      .mockResolvedValueOnce('full text')
      .mockRejectedValueOnce(new Error('NoSuchKey'));

    await expect(invoke('document:get-text', 'p', 'd')).resolves.toEqual({
      success: true,
      text: 'full text',
    });
    expect(AWS_S3.getObjectText).toHaveBeenCalledWith('o/p/text/d.txt', config.s3);
    await expect(invoke('document:get-text', 'p', 'd')).resolves.toEqual({
      success: false,
      error: 'Full text not available for this document.',
    });
  });

  it('handles unknown documents and lookup failures', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getDocumentRecord')
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(awsError());

    await expect(invoke('document:get-text', 'p', 'd')).resolves.toEqual({
      success: false,
      error: 'Document not found',
    });
    await expect(invoke('document:get-text', 'p', 'd')).resolves.toEqual({
      success: false,
      error: 'Failed to fetch document text. Please try again.',
    });
  });
});

describe('document:retry-graph', () => {
  beforeEach(() => {
    vi.spyOn(AWS_DYNAMODB, 'getDocumentRecord').mockResolvedValue({
      ownerSub: 'o',
      s3Key: 'k',
      documentName: 'a.pdf',
    });
    vi.spyOn(AWS_S3, 'getObjectText').mockResolvedValue('saved text');
  });

  it('re-runs extraction from the saved text', async () => {
    await expect(invoke('document:retry-graph', 'p', 'd')).resolves.toEqual({ success: true });

    expect(AWS_BEDROCK.extractRelationshipsFromText).toHaveBeenCalledWith('saved text', 'd', 'p');
    expect(AWS_S3.putJson).toHaveBeenCalledWith('o/p/analysis/d.json', makeGraph('d'), config.s3);
    expect(statusesFor('d')).toEqual(['PROCESSING', 'COMPLETE']);
  });

  it('treats a graph load failure as non-fatal', async () => {
    vi.spyOn(Neo4J, 'loadGraph').mockRejectedValue('neo4j down');
    await expect(invoke('document:retry-graph', 'p', 'd')).resolves.toEqual({ success: true });
  });

  it('needs the document and its saved text', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getDocumentRecord').mockResolvedValueOnce(null);
    await expect(invoke('document:retry-graph', 'p', 'd')).resolves.toEqual({
      success: false,
      error: 'Document not found',
    });

    vi.spyOn(AWS_S3, 'getObjectText').mockRejectedValue(new Error('NoSuchKey'));
    await expect(invoke('document:retry-graph', 'p', 'd')).resolves.toEqual({
      success: false,
      error: 'Saved text not available — document may need to be re-uploaded.',
    });
  });

  it('explains an unparseable model response and marks GRAPH_FAILED', async () => {
    vi.spyOn(AWS_BEDROCK, 'extractRelationshipsFromText').mockRejectedValue(
      new GraphExtractionError('d')
    );

    await expect(invoke('document:retry-graph', 'p', 'd')).resolves.toEqual({
      success: false,
      error:
        'Graph extraction failed for "a.pdf" — the AI\'s response could not be parsed. Please try again.',
    });
    expect(statusesFor('d')).toEqual(['PROCESSING', 'GRAPH_FAILED']);
  });

  it('hides other errors and tolerates a failing status reset', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getDocumentRecord').mockRejectedValue(awsError());
    vi.mocked(AWS_DYNAMODB.updateDocumentStatus).mockRejectedValue(new Error('also down'));

    await expect(invoke('document:retry-graph', 'p', 'd')).resolves.toEqual({
      success: false,
      error: 'Graph retry failed. Please try again.',
    });
    expect(statusesFor('d')).toEqual(['GRAPH_FAILED']);
  });

  it('names the document generically when its record could not be read', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getDocumentRecord').mockRejectedValue(new GraphExtractionError('d'));
    await expect(invoke('document:retry-graph', 'p', 'd')).resolves.toMatchObject({
      error: expect.stringContaining('"this document"'),
    });
  });
});

it.each([
  ['document:upload', ['p', []]],
  ['document:list', ['p']],
  ['document:delete', ['p', 'd']],
  ['document:get-text', ['p', 'd']],
  ['document:retry-graph', ['p', 'd']],
])('%s is unavailable until signed in', async (channel, args) => {
  const notReady = { success: false, error: 'App not ready' };
  appConfig = null;
  await expect(invoke(channel, ...args)).resolves.toEqual(notReady);
  appConfig = config;
  tokens = false;
  await expect(invoke(channel, ...args)).resolves.toEqual(notReady);
});
