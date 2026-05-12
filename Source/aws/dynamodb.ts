import crypto from 'crypto';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';

import { AWS_STS } from './sts';
import { awsConfig } from '../main/config';
import { DynamoDBConfig } from '../interfaces/app';
import { ProjectListItem, ProjectMember, ProjectRole } from '../interfaces/project';
import { DocumentRecord, ProcessingStatus } from '../interfaces/document';
import { Logger } from '../utils/logger';

export class AWS_DYNAMODB {
  // Client is created inside init() because it needs STS credentials
  // that aren't available until AWS_STS.init() has completed.
  private static client: DynamoDBDocumentClient;

  public static init(): void {
    const rawClient = new DynamoDBClient({
      region: awsConfig.region,
      credentials: async () => {
        await AWS_STS.maybeRefresh();
        return {
          accessKeyId: AWS_STS.credentials.accessKeyId,
          secretAccessKey: AWS_STS.credentials.secretAccessKey,
          sessionToken: AWS_STS.credentials.sessionToken,
        };
      },
    });
    this.client = DynamoDBDocumentClient.from(rawClient);
    Logger.debug(`DynamoDB document client initialized (region: ${awsConfig.region})`);
  }

  public static async listProjectsForUser(
    userSub: string,
    config: DynamoDBConfig
  ): Promise<ProjectListItem[]> {
    Logger.debug(`Querying projects accessible by user: ${userSub}`);

    const accessResult = await this.client.send(
      new QueryCommand({
        TableName: config.projectAccessTable,
        KeyConditionExpression: 'user_sub = :sub',
        ExpressionAttributeValues: { ':sub': userSub },
      })
    );

    // Filter out the SESSION sentinel record
    const accessItems = (accessResult.Items ?? []).filter(
      (item) => item['project_id'] !== 'SESSION'
    );
    if (accessItems.length === 0) return [];

    // Build a map of project_id → role for shared projects (owners have no role attribute)
    const roleByProjectId = new Map<string, string>();
    for (const item of accessItems) {
      if (item['role']) roleByProjectId.set(item['project_id'] as string, item['role'] as string);
    }

    const keys = accessItems.map((item) => ({
      project_id: item['project_id'] as string,
      document_id: 'META',
    }));

    const metaResult = await this.client.send(
      new BatchGetCommand({
        RequestItems: {
          [config.projectStateTable]: { Keys: keys },
        },
      })
    );

    const metaItems = metaResult.Responses?.[config.projectStateTable] ?? [];
    Logger.info(`Found ${metaItems.length} project(s) for user: ${userSub}`);

    return metaItems.map((item) => {
      const projectId = item['project_id'] as string;
      const ownerSub  = item['owner_sub']  as string;
      let role: ProjectRole;
      if (ownerSub === userSub) {
        role = 'OWNER';
      } else {
        role = (roleByProjectId.get(projectId) as 'VIEW' | 'EDIT') ?? 'VIEW';
      }
      return {
        id:            projectId,
        name:          item['project_name']   as string,
        documentCount: (item['document_count'] as number) ?? 0,
        lastModified:  formatDate(item['updated_at'] as string),
        role,
      };
    });
  }

  public static async getProjectRole(
    userSub:   string,
    projectId: string,
    config:    DynamoDBConfig
  ): Promise<ProjectRole | null> {
    const meta = await this.getProjectMeta(projectId, config);
    if (!meta) return null;
    if (meta.ownerSub === userSub) return 'OWNER';

    const result = await this.client.send(
      new GetCommand({
        TableName: config.projectAccessTable,
        Key: { user_sub: userSub, project_id: projectId },
      })
    );
    if (!result.Item || !result.Item['role']) return null;
    return result.Item['role'] as 'VIEW' | 'EDIT';
  }

  public static async shareProject(
    projectId:      string,
    targetSub:      string,
    targetUsername: string,
    role:           'VIEW' | 'EDIT',
    config:         DynamoDBConfig
  ): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: config.projectAccessTable,
        Item: {
          user_sub:   targetSub,
          project_id: projectId,
          role,
          username:   targetUsername,
        },
        ConditionExpression: 'attribute_not_exists(user_sub)',
      })
    );
    Logger.info(`Project ${projectId} shared with user ${targetUsername} (${targetSub}) as ${role}`);
  }

  public static async unshareProject(
    projectId: string,
    targetSub: string,
    config:    DynamoDBConfig
  ): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: config.projectAccessTable,
        Key: { user_sub: targetSub, project_id: projectId },
      })
    );
    Logger.info(`Access to project ${projectId} removed for user ${targetSub}`);
  }

  public static async listProjectMembers(
    projectId: string,
    config:    DynamoDBConfig
  ): Promise<ProjectMember[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: config.projectAccessTable,
        IndexName: 'project-index',
        KeyConditionExpression: 'project_id = :pid',
        // Only return shared-access records (owner's record has no 'role' attribute)
        FilterExpression: 'attribute_exists(#r)',
        ExpressionAttributeNames: { '#r': 'role' },
        ExpressionAttributeValues: { ':pid': projectId },
      })
    );
    return (result.Items ?? []).map((item) => ({
      userSub:  item['user_sub']  as string,
      username: item['username']  as string,
      role:     item['role']      as 'VIEW' | 'EDIT',
    }));
  }

  public static async updateProjectRole(
    projectId: string,
    targetSub: string,
    newRole:   'VIEW' | 'EDIT',
    config:    DynamoDBConfig
  ): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: config.projectAccessTable,
        Key: { user_sub: targetSub, project_id: projectId },
        UpdateExpression: 'SET #r = :role',
        ExpressionAttributeNames: { '#r': 'role' },
        ExpressionAttributeValues: { ':role': newRole },
      })
    );
    Logger.info(`Role for user ${targetSub} on project ${projectId} updated to ${newRole}`);
  }

  public static async createProject(
    projectName: string,
    ownerSub: string,
    config: DynamoDBConfig
  ): Promise<ProjectListItem> {
    const existing = await this.listProjectsForUser(ownerSub, config);
    const duplicate = existing.some(
      (p) => p.name.toLowerCase() === projectName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A project named "${projectName}" already exists.`);
    }

    const projectId = crypto.randomUUID();
    const s3Prefix = `${ownerSub}/${projectId}/`;
    const now = new Date().toISOString();

    Logger.info(`Creating project "${projectName}" (${projectId}) for owner: ${ownerSub}`);

    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: config.projectStateTable,
              Item: {
                project_id: projectId,
                document_id: 'META',
                project_name: projectName,
                owner_sub: ownerSub,
                s3_prefix: s3Prefix,
                document_count: 0,
                created_at: now,
                updated_at: now,
              },
            },
          },
          {
            Put: {
              TableName: config.projectAccessTable,
              Item: {
                user_sub: ownerSub,
                project_id: projectId,
              },
            },
          },
        ],
      })
    );

    Logger.info(`Project "${projectName}" (${projectId}) created successfully`);

    return {
      id: projectId,
      name: projectName,
      documentCount: 0,
      lastModified: formatDate(now),
      role: 'OWNER',
    };
  }

  public static async renameProject(
    projectId: string,
    newName: string,
    userSub: string,
    config: DynamoDBConfig
  ): Promise<void> {
    const existing = await this.listProjectsForUser(userSub, config);
    const duplicate = existing.some(
      (p) => p.id !== projectId && p.name.toLowerCase() === newName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A project named "${newName}" already exists.`);
    }

    const now = new Date().toISOString();

    await this.client.send(
      new UpdateCommand({
        TableName: config.projectStateTable,
        Key: { project_id: projectId, document_id: 'META' },
        UpdateExpression: 'SET project_name = :name, updated_at = :now',
        ExpressionAttributeValues: {
          ':name': newName,
          ':now': now,
        },
      })
    );

    Logger.info(`Project ${projectId} renamed to "${newName}"`);
  }

  public static async deleteProject(
    projectId: string,
    userSub: string,
    config: DynamoDBConfig
  ): Promise<string> {
    Logger.info(`Deleting project ${projectId} for user: ${userSub}`);

    const metaResult = await this.client.send(
      new GetCommand({
        TableName: config.projectStateTable,
        Key: { project_id: projectId, document_id: 'META' },
      })
    );

    if (!metaResult.Item) throw new Error('Project not found');
    const s3Prefix = metaResult.Item['s3_prefix'] as string;

    const allItemsResult = await this.client.send(
      new QueryCommand({
        TableName: config.projectStateTable,
        KeyConditionExpression: 'project_id = :pid',
        ExpressionAttributeValues: { ':pid': projectId },
      })
    );

    const deleteRequests = (allItemsResult.Items ?? []).map((item) => ({
      DeleteRequest: {
        Key: {
          project_id: item['project_id'] as string,
          document_id: item['document_id'] as string,
        },
      },
    }));

    // BatchWriteItem accepts at most 25 requests per call
    for (let i = 0; i < deleteRequests.length; i += 25) {
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [config.projectStateTable]: deleteRequests.slice(i, i + 25),
          },
        })
      );
    }

    // Delete all access records for this project (owner + all shared users)
    const members = await this.listProjectMembers(projectId, config);
    const accessDeletePromises = [
      this.client.send(new DeleteCommand({
        TableName: config.projectAccessTable,
        Key: { user_sub: userSub, project_id: projectId },
      })),
      ...members.map((m) =>
        this.client.send(new DeleteCommand({
          TableName: config.projectAccessTable,
          Key: { user_sub: m.userSub, project_id: projectId },
        }))
      ),
    ];
    await Promise.all(accessDeletePromises);

    Logger.info(`Project ${projectId} removed from DynamoDB`);
    return s3Prefix;
  }

  public static async getProjectMeta(
    projectId: string,
    config: DynamoDBConfig
  ): Promise<{ s3Prefix: string; ownerSub: string; projectName: string } | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: config.projectStateTable,
        Key: { project_id: projectId, document_id: 'META' },
      })
    );
    if (!result.Item) return null;
    return {
      s3Prefix: result.Item['s3_prefix'] as string,
      ownerSub: result.Item['owner_sub'] as string,
      projectName: result.Item['project_name'] as string,
    };
  }

  public static async addDocumentRecord(
    record: DocumentRecord,
    config: DynamoDBConfig
  ): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: config.projectStateTable,
        Item: {
          project_id: record.projectId,
          document_id: record.documentId,
          project_name: record.projectName,
          owner_sub: record.ownerSub,
          document_name: record.documentName,
          s3_key: record.s3Key,
          file_size: record.fileSize,
          uploaded_at: record.uploadedAt,
          processing_status: record.processingStatus,
        },
      })
    );
    Logger.debug(`Document record created: ${record.documentId}`);
  }

  public static async updateDocumentStatus(
    projectId: string,
    documentId: string,
    status: ProcessingStatus,
    config: DynamoDBConfig,
    jobId?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    let expr = 'SET processing_status = :status';
    const values: Record<string, unknown> = { ':status': status };

    if (status === 'QUEUED') {
      expr += ', queued_at = :now';
      values[':now'] = now;
      if (jobId) {
        expr += ', textract_job_id = :jobId';
        values[':jobId'] = jobId;
      }
    } else if (status === 'PROCESSING') {
      expr += ', processing_started_at = :now';
      values[':now'] = now;
    }

    await this.client.send(
      new UpdateCommand({
        TableName: config.projectStateTable,
        Key: { project_id: projectId, document_id: documentId },
        UpdateExpression: expr,
        ExpressionAttributeValues: values,
      })
    );
    Logger.debug(`Document ${documentId} status → ${status}`);
  }

  public static async writeSession(
    userSub: string,
    sessionId: string,
    deviceId: string,
    config: DynamoDBConfig
  ): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: config.projectAccessTable,
        Item: {
          user_sub: userSub,
          project_id: 'SESSION',
          session_id: sessionId,
          device_id: deviceId,
          logged_in_at: new Date().toISOString(),
        },
      })
    );
    Logger.debug(`Session written for user ${userSub} (device: ${deviceId}): ${sessionId}`);
  }

  public static async getSession(
    userSub: string,
    config: DynamoDBConfig
  ): Promise<{ sessionId: string; deviceId: string } | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: config.projectAccessTable,
        Key: { user_sub: userSub, project_id: 'SESSION' },
      })
    );
    if (!result.Item) return null;
    return {
      sessionId: result.Item['session_id'] as string,
      deviceId: result.Item['device_id'] as string,
    };
  }

  public static async incrementDocumentCount(
    projectId: string,
    count: number,
    config: DynamoDBConfig
  ): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: config.projectStateTable,
        Key: { project_id: projectId, document_id: 'META' },
        UpdateExpression: 'ADD document_count :n SET updated_at = :now',
        ExpressionAttributeValues: {
          ':n': count,
          ':now': new Date().toISOString(),
        },
      })
    );
  }

  public static async getDocumentRecord(
    projectId:  string,
    documentId: string,
    config:     DynamoDBConfig
  ): Promise<{ ownerSub: string; s3Key: string; documentName: string } | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: config.projectStateTable,
        Key: { project_id: projectId, document_id: documentId },
        ProjectionExpression: 'owner_sub, s3_key, document_name',
      })
    );
    if (!result.Item) return null;
    return {
      ownerSub:     result.Item['owner_sub']     as string,
      s3Key:        result.Item['s3_key']        as string,
      documentName: result.Item['document_name'] as string,
    };
  }

  public static async deleteDocument(
    projectId:  string,
    documentId: string,
    config:     DynamoDBConfig
  ): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: config.projectStateTable,
        Key: { project_id: projectId, document_id: documentId },
      })
    );
    // Reuse incrementDocumentCount with -1 (DynamoDB ADD supports negatives)
    await this.incrementDocumentCount(projectId, -1, config);
    Logger.info(`Document ${documentId} deleted from project ${projectId}`);
  }

  public static async getDocumentName(
    projectId:  string,
    documentId: string,
    config:     DynamoDBConfig
  ): Promise<string | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: config.projectStateTable,
        Key: { project_id: projectId, document_id: documentId },
        ProjectionExpression: 'document_name',
      })
    );
    return result.Item ? (result.Item['document_name'] as string) : null;
  }

  public static async listDocuments(
    projectId: string,
    config: DynamoDBConfig
  ): Promise<DocumentRecord[]> {
    Logger.debug(`Listing documents for project: ${projectId}`);
    const result = await this.client.send(
      new QueryCommand({
        TableName: config.projectStateTable,
        KeyConditionExpression: 'project_id = :pid',
        ExpressionAttributeValues: { ':pid': projectId },
      })
    );
    const items = (result.Items ?? []).filter((item) => item['document_id'] !== 'META');
    Logger.info(`Found ${items.length} document(s) for project: ${projectId}`);
    return items.map((item) => ({
      documentId: item['document_id'] as string,
      projectId: item['project_id'] as string,
      projectName: (item['project_name'] as string) ?? '',
      ownerSub: (item['owner_sub'] as string) ?? '',
      documentName: item['document_name'] as string,
      s3Key: item['s3_key'] as string,
      fileSize: item['file_size'] as number,
      uploadedAt: item['uploaded_at'] as string,
      processingStatus: ((item['processing_status'] as ProcessingStatus) ?? 'UNPROCESSED'),
      queuedAt: item['queued_at'] as string | undefined,
      textractJobId: item['textract_job_id'] as string | undefined,
      processingStartedAt: item['processing_started_at'] as string | undefined,
    }));
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
