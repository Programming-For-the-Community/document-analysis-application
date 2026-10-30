import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { AWS_DYNAMODB } from '../../../classes/aws/dynamodb';
import { Logger } from '../../../utils/logger';
import {
  clientOf,
  flushPromises,
  makeConfig,
  makeDoc,
  resolveClientCredentials,
  stubStsCredentials,
} from '../../helpers';

const ddb = mockClient(DynamoDBDocumentClient);
const config = makeConfig().dynamoDB;

const conditionalFailure = () =>
  Object.assign(new Error('The conditional request failed'), {
    name: 'ConditionalCheckFailedException',
  });

function inputsOf<T extends object>(command: new (input: never) => T) {
  return ddb.commandCalls(command as never).map((c) => c.args[0].input as Record<string, unknown>);
}

describe('AWS_DYNAMODB', () => {
  beforeEach(() => {
    ddb.reset();
    stubStsCredentials();
    AWS_DYNAMODB.init();
  });

  it('sources credentials from the assumed role', async () => {
    await expect(resolveClientCredentials(clientOf(AWS_DYNAMODB))).resolves.toMatchObject({
      accessKeyId: 'AKIA',
    });
  });

  describe('listProjectsForUser', () => {
    it('returns nothing when the user has no access records', async () => {
      ddb.on(QueryCommand).resolves({});
      await expect(AWS_DYNAMODB.listProjectsForUser('u', config)).resolves.toEqual([]);
      expect(ddb.commandCalls(BatchGetCommand)).toHaveLength(0);
    });

    it('joins access roles onto project metadata', async () => {
      ddb.on(QueryCommand).resolves({
        Items: [
          { project_id: 'p1', role: 'OWNER' },
          { project_id: 'p2', role: 'EDIT' },
        ],
      });
      ddb.on(BatchGetCommand).resolves({
        Responses: {
          'state-table': [
            {
              project_id: 'p1',
              project_name: 'One',
              document_count: 3,
              updated_at: '2026-03-04T12:00:00Z',
            },
            { project_id: 'p2', project_name: 'Two', updated_at: '2026-03-04T12:00:00Z' },
            { project_id: 'p3', project_name: 'Orphan', updated_at: '2026-03-04T12:00:00Z' },
          ],
        },
      });

      const projects = await AWS_DYNAMODB.listProjectsForUser('u', config);

      expect(projects).toEqual([
        { id: 'p1', name: 'One', documentCount: 3, lastModified: 'Mar 4, 2026', role: 'OWNER' },
        { id: 'p2', name: 'Two', documentCount: 0, lastModified: 'Mar 4, 2026', role: 'EDIT' },
        { id: 'p3', name: 'Orphan', documentCount: 0, lastModified: 'Mar 4, 2026', role: 'VIEW' },
      ]);
      expect(inputsOf(BatchGetCommand)[0]).toMatchObject({
        RequestItems: {
          'state-table': {
            Keys: [
              { project_id: 'p1', document_id: 'META' },
              { project_id: 'p2', document_id: 'META' },
            ],
          },
        },
      });
    });

    it('handles a batch response with no table entry', async () => {
      ddb.on(QueryCommand).resolves({ Items: [{ project_id: 'p1', role: 'OWNER' }] });
      ddb.on(BatchGetCommand).resolves({});
      await expect(AWS_DYNAMODB.listProjectsForUser('u', config)).resolves.toEqual([]);
    });
  });

  it('reads a project role, or null without one', async () => {
    ddb
      .on(GetCommand)
      .resolvesOnce({ Item: { role: 'EDIT' } })
      .resolvesOnce({ Item: {} })
      .resolvesOnce({});

    await expect(AWS_DYNAMODB.getProjectRole('u', 'p', config)).resolves.toBe('EDIT');
    await expect(AWS_DYNAMODB.getProjectRole('u', 'p', config)).resolves.toBeNull();
    await expect(AWS_DYNAMODB.getProjectRole('u', 'p', config)).resolves.toBeNull();
  });

  it('shares, unshares and re-roles project members', async () => {
    ddb.on(PutCommand).resolves({});
    ddb.on(DeleteCommand).resolves({});
    ddb.on(UpdateCommand).resolves({});

    await AWS_DYNAMODB.shareProject('p', 'target', 'bob', 'VIEW', config);
    await AWS_DYNAMODB.unshareProject('p', 'target', config);
    await AWS_DYNAMODB.updateProjectRole('p', 'target', 'EDIT', config);

    expect(inputsOf(PutCommand)[0]).toMatchObject({
      TableName: 'access-table',
      Item: { user_sub: 'target', project_id: 'p', role: 'VIEW', username: 'bob' },
      ConditionExpression: 'attribute_not_exists(user_sub)',
    });
    expect(inputsOf(DeleteCommand)[0]).toMatchObject({
      Key: { user_sub: 'target', project_id: 'p' },
    });
    expect(inputsOf(UpdateCommand)[0]).toMatchObject({
      ExpressionAttributeValues: { ':role': 'EDIT' },
    });
  });

  it('lists shared members, excluding the owner', async () => {
    ddb
      .on(QueryCommand)
      .resolvesOnce({ Items: [{ user_sub: 's1', username: 'bob', role: 'VIEW' }] })
      .resolvesOnce({});

    await expect(AWS_DYNAMODB.listProjectMembers('p', config)).resolves.toEqual([
      { userSub: 's1', username: 'bob', role: 'VIEW' },
    ]);
    await expect(AWS_DYNAMODB.listProjectMembers('p', config)).resolves.toEqual([]);
    expect(inputsOf(QueryCommand)[0]).toMatchObject({
      IndexName: 'project-index',
      ExpressionAttributeValues: { ':pid': 'p', ':owner': 'OWNER' },
    });
  });

  describe('createProject', () => {
    it('writes the project and owner access record in one transaction', async () => {
      ddb.on(QueryCommand).resolves({});
      ddb.on(TransactWriteCommand).resolves({});

      const project = await AWS_DYNAMODB.createProject('New', 'owner', config);

      expect(project).toMatchObject({ name: 'New', documentCount: 0, role: 'OWNER' });
      const items = inputsOf(TransactWriteCommand)[0]!['TransactItems'] as Array<{
        Put: { TableName: string; Item: Record<string, unknown> };
      }>;
      expect(items[0]!.Put).toMatchObject({
        TableName: 'state-table',
        Item: {
          project_id: project.id,
          document_id: 'META',
          project_name: 'New',
          s3_prefix: `owner/${project.id}/`,
        },
      });
      expect(items[1]!.Put).toMatchObject({
        TableName: 'access-table',
        Item: { user_sub: 'owner', role: 'OWNER' },
      });
    });

    it('refuses a case-insensitive duplicate name', async () => {
      ddb.on(QueryCommand).resolves({ Items: [{ project_id: 'p1', role: 'OWNER' }] });
      ddb.on(BatchGetCommand).resolves({
        Responses: {
          'state-table': [{ project_id: 'p1', project_name: 'Taken', updated_at: '2026-01-01' }],
        },
      });

      await expect(AWS_DYNAMODB.createProject('taken', 'owner', config)).rejects.toThrow(
        'already exists'
      );
      expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
    });
  });

  describe('renameProject', () => {
    beforeEach(() => {
      ddb.on(QueryCommand).resolves({
        Items: [
          { project_id: 'p1', role: 'OWNER' },
          { project_id: 'p2', role: 'OWNER' },
        ],
      });
      ddb.on(BatchGetCommand).resolves({
        Responses: {
          'state-table': [
            { project_id: 'p1', project_name: 'One', updated_at: '2026-01-01' },
            { project_id: 'p2', project_name: 'Two', updated_at: '2026-01-01' },
          ],
        },
      });
      ddb.on(UpdateCommand).resolves({});
    });

    it('renames, allowing a case change of its own name', async () => {
      await AWS_DYNAMODB.renameProject('p1', 'ONE', 'u', config);
      expect(inputsOf(UpdateCommand)[0]).toMatchObject({
        Key: { project_id: 'p1', document_id: 'META' },
        ExpressionAttributeValues: { ':name': 'ONE' },
      });
    });

    it("refuses another project's name", async () => {
      await expect(AWS_DYNAMODB.renameProject('p1', 'two', 'u', config)).rejects.toThrow(
        'already exists'
      );
    });
  });

  describe('deleteProject', () => {
    it('fails for an unknown project', async () => {
      ddb.on(GetCommand).resolves({});
      await expect(AWS_DYNAMODB.deleteProject('p', 'u', config)).rejects.toThrow(
        'Project not found'
      );
    });

    it('deletes every item in batches of 25 plus all access records', async () => {
      ddb.on(GetCommand).resolves({ Item: { s3_prefix: 'u/p/' } });
      const items = Array.from({ length: 30 }, (_, i) => ({
        project_id: 'p',
        document_id: `d${i}`,
      }));
      ddb
        .on(QueryCommand)
        .resolvesOnce({ Items: items })
        .resolvesOnce({ Items: [{ user_sub: 'member', username: 'bob', role: 'VIEW' }] });
      ddb.on(BatchWriteCommand).resolves({});
      ddb.on(DeleteCommand).resolves({});

      await expect(AWS_DYNAMODB.deleteProject('p', 'u', config)).resolves.toBe('u/p/');

      const batchSizes = inputsOf(BatchWriteCommand).map(
        (i) => (i['RequestItems'] as Record<string, unknown[]>)['state-table']!.length
      );
      expect(batchSizes).toEqual([25, 5]);
      expect(
        inputsOf(DeleteCommand).map((i) => (i['Key'] as { user_sub: string }).user_sub)
      ).toEqual(['u', 'member']);
    });

    it('handles a project with no items', async () => {
      ddb.on(GetCommand).resolves({ Item: { s3_prefix: 'u/p/' } });
      ddb.on(QueryCommand).resolves({});
      ddb.on(DeleteCommand).resolves({});

      await AWS_DYNAMODB.deleteProject('p', 'u', config);

      expect(ddb.commandCalls(BatchWriteCommand)).toHaveLength(0);
    });
  });

  it('reads project metadata', async () => {
    ddb
      .on(GetCommand)
      .resolvesOnce({ Item: { s3_prefix: 'o/p/', owner_sub: 'o', project_name: 'P' } })
      .resolvesOnce({});

    await expect(AWS_DYNAMODB.getProjectMeta('p', config)).resolves.toEqual({
      s3Prefix: 'o/p/',
      ownerSub: 'o',
      projectName: 'P',
    });
    await expect(AWS_DYNAMODB.getProjectMeta('p', config)).resolves.toBeNull();
  });

  it('writes a document record', async () => {
    ddb.on(PutCommand).resolves({});
    await AWS_DYNAMODB.addDocumentRecord(makeDoc({ processingStatus: 'UNPROCESSED' }), config);
    expect(inputsOf(PutCommand)[0]).toMatchObject({
      TableName: 'state-table',
      Item: {
        project_id: 'proj-1',
        document_id: 'doc-1',
        document_name: 'report.pdf',
        processing_status: 'UNPROCESSED',
      },
    });
  });

  describe('updateDocumentStatus', () => {
    it('only updates documents that still exist', async () => {
      ddb.on(UpdateCommand).resolves({});

      await expect(AWS_DYNAMODB.updateDocumentStatus('p', 'd', 'PROCESSING', config)).resolves.toBe(
        true
      );

      const input = inputsOf(UpdateCommand)[0]!;
      expect(input['ConditionExpression']).toBe('attribute_exists(document_name)');
      expect(input['UpdateExpression']).toBe(
        'SET processing_status = :status, status_updated_at = :now'
      );
    });

    it('stamps queued_at and the Textract job id when queuing', async () => {
      ddb.on(UpdateCommand).resolves({});

      await AWS_DYNAMODB.updateDocumentStatus('p', 'd', 'QUEUED', config, 'job-1');
      await AWS_DYNAMODB.updateDocumentStatus('p', 'd', 'QUEUED', config);

      const [withJob, withoutJob] = inputsOf(UpdateCommand);
      expect(withJob!['UpdateExpression']).toContain('queued_at = :now, textract_job_id = :jobId');
      expect(withJob!['ExpressionAttributeValues']).toMatchObject({ ':jobId': 'job-1' });
      expect(withoutJob!['UpdateExpression']).not.toContain('textract_job_id');
    });

    it('returns false for a deleted document', async () => {
      ddb.on(UpdateCommand).rejects(conditionalFailure());
      await expect(AWS_DYNAMODB.updateDocumentStatus('p', 'd', 'COMPLETE', config)).resolves.toBe(
        false
      );
    });

    it('rethrows other errors', async () => {
      ddb.on(UpdateCommand).rejects(new Error('throttled'));
      await expect(AWS_DYNAMODB.updateDocumentStatus('p', 'd', 'COMPLETE', config)).rejects.toThrow(
        'throttled'
      );
    });
  });

  it('writes sessions and reads them back', async () => {
    ddb.on(UpdateCommand).resolves({});
    ddb
      .on(GetCommand)
      .resolvesOnce({ Item: { session_id: 's', device_id: 'dev' } })
      .resolvesOnce({});

    await AWS_DYNAMODB.writeSession('u', 's', 'dev', config);

    expect(inputsOf(UpdateCommand)[0]).toMatchObject({
      TableName: 'sessions-table',
      ExpressionAttributeValues: { ':sid': 's', ':did': 'dev' },
    });
    await expect(AWS_DYNAMODB.getSession('u', config)).resolves.toEqual({
      sessionId: 's',
      deviceId: 'dev',
    });
    await expect(AWS_DYNAMODB.getSession('u', config)).resolves.toBeNull();
  });

  it('gets and sets user preferences', async () => {
    ddb
      .on(GetCommand)
      .resolvesOnce({ Item: { theme: 'slate' } })
      .resolvesOnce({ Item: {} })
      .resolvesOnce({});
    ddb.on(UpdateCommand).resolves({});

    await expect(AWS_DYNAMODB.getUserPreference('u', 'theme', config)).resolves.toBe('slate');
    await expect(AWS_DYNAMODB.getUserPreference('u', 'theme', config)).resolves.toBeNull();
    await expect(AWS_DYNAMODB.getUserPreference('u', 'theme', config)).resolves.toBeNull();

    await AWS_DYNAMODB.setUserPreference('u', 'theme', 'parchment', config);
    expect(inputsOf(UpdateCommand)[0]).toMatchObject({
      ExpressionAttributeNames: { '#k': 'theme' },
      ExpressionAttributeValues: { ':v': 'parchment' },
    });
  });

  it('gets and sets the project min-doc filter', async () => {
    ddb
      .on(GetCommand)
      .resolvesOnce({ Item: { min_doc_filter: 4 } })
      .resolvesOnce({});
    ddb.on(UpdateCommand).resolves({});

    await expect(AWS_DYNAMODB.getProjectSettings('p', config)).resolves.toEqual({
      minDocFilter: 4,
    });
    await expect(AWS_DYNAMODB.getProjectSettings('p', config)).resolves.toEqual({
      minDocFilter: undefined,
    });

    await AWS_DYNAMODB.setProjectMinDocFilter('p', 3, config);
    expect(inputsOf(UpdateCommand)[0]).toMatchObject({ ExpressionAttributeValues: { ':v': 3 } });
  });

  it('reads document records and names', async () => {
    ddb
      .on(GetCommand)
      .resolvesOnce({ Item: { owner_sub: 'o', s3_key: 'k', document_name: 'n' } })
      .resolvesOnce({})
      .resolvesOnce({ Item: { document_name: 'n' } })
      .resolvesOnce({});

    await expect(AWS_DYNAMODB.getDocumentRecord('p', 'd', config)).resolves.toEqual({
      ownerSub: 'o',
      s3Key: 'k',
      documentName: 'n',
    });
    await expect(AWS_DYNAMODB.getDocumentRecord('p', 'd', config)).resolves.toBeNull();
    await expect(AWS_DYNAMODB.getDocumentName('p', 'd', config)).resolves.toBe('n');
    await expect(AWS_DYNAMODB.getDocumentName('p', 'd', config)).resolves.toBeNull();
  });

  it('deletes a document and decrements the project count', async () => {
    ddb.on(DeleteCommand).resolves({});
    ddb.on(UpdateCommand).resolves({});

    await AWS_DYNAMODB.deleteDocument('p', 'd', config);

    expect(inputsOf(DeleteCommand)[0]).toMatchObject({
      Key: { project_id: 'p', document_id: 'd' },
    });
    expect(inputsOf(UpdateCommand)[0]).toMatchObject({
      Key: { project_id: 'p', document_id: 'META' },
      UpdateExpression: 'ADD document_count :n SET updated_at = :now',
      ExpressionAttributeValues: { ':n': -1 },
    });
  });

  describe('listDocuments', () => {
    it('maps document items, skipping META and defaulting optional fields', async () => {
      ddb.on(QueryCommand).resolves({
        Items: [
          { project_id: 'p', document_id: 'META' },
          {
            project_id: 'p',
            document_id: 'd1',
            owner_sub: 'o',
            document_name: 'a.pdf',
            s3_key: 'k',
            file_size: 5,
            uploaded_at: 't',
            processing_status: 'QUEUED',
            queued_at: 'q',
            textract_job_id: 'j',
            status_updated_at: 's',
          },
          { project_id: 'p', document_id: 'd2', document_name: 'b.txt' },
        ],
      });

      const docs = await AWS_DYNAMODB.listDocuments('p', config);

      expect(docs).toEqual([
        {
          documentId: 'd1',
          projectId: 'p',
          ownerSub: 'o',
          documentName: 'a.pdf',
          s3Key: 'k',
          fileSize: 5,
          uploadedAt: 't',
          processingStatus: 'QUEUED',
          queuedAt: 'q',
          textractJobId: 'j',
          statusUpdatedAt: 's',
        },
        expect.objectContaining({
          documentId: 'd2',
          ownerSub: '',
          processingStatus: 'UNPROCESSED',
        }),
      ]);
      expect(ddb.commandCalls(DeleteCommand)).toHaveLength(0);
    });

    it('hides nameless ghost items and purges them in the background', async () => {
      ddb.on(QueryCommand).resolves({
        Items: [
          { project_id: 'p', document_id: 'real', document_name: 'a.pdf' },
          { project_id: 'p', document_id: 'ghost1', processing_status: 'COMPLETE' },
          { project_id: 'p', document_id: 'ghost2', processing_status: 'COMPLETE' },
        ],
      });
      // General stub first — aws-sdk-client-mock lets the later input-specific one win
      ddb.on(DeleteCommand).resolves({});
      ddb
        .on(DeleteCommand, { Key: { project_id: 'p', document_id: 'ghost2' } })
        .rejects(new Error('boom'));

      const docs = await AWS_DYNAMODB.listDocuments('p', config);
      await flushPromises();

      expect(docs.map((d) => d.documentId)).toEqual(['real']);
      const purges = inputsOf(DeleteCommand);
      expect(purges.map((i) => (i['Key'] as { document_id: string }).document_id)).toEqual([
        'ghost1',
        'ghost2',
      ]);
      expect(purges[0]!['ConditionExpression']).toBe('attribute_not_exists(document_name)');
      // A failed purge is logged, never thrown, and never touches document_count
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to purge orphaned record ghost2')
      );
      expect(ddb.commandCalls(UpdateCommand)).toHaveLength(0);
    });

    it('handles an empty project', async () => {
      ddb.on(QueryCommand).resolves({});
      await expect(AWS_DYNAMODB.listDocuments('p', config)).resolves.toEqual([]);
    });
  });
});
