import { vi } from 'vitest';

import { AWS_STS } from '../classes/aws/sts';
import { AppConfig } from '../interfaces/config';
import { DocumentRecord } from '../interfaces/document';
import { CognitoCredentials } from '../interfaces/aws';

export function makeConfig(): AppConfig {
  return {
    dynamoDB: {
      projectStateTable: 'state-table',
      projectAccessTable: 'access-table',
      userSessionsTable: 'sessions-table',
    },
    cognito: { userPoolId: 'pool-id', clientId: 'client-id' },
    s3: { documentBucket: 'doc-bucket' },
    releases: { bucket: 'release-bucket' },
    sns: { topicArn: 'arn:aws:sns:us-east-2:123:topic' },
    sqs: { queueUrl: 'https://sqs/queue' },
    bedrock: { modelId: 'model-id' },
    neo4j: { uri: 'bolt://localhost:7687', user: 'neo4j', password: 'pw' },
    qdrant: { url: 'http://localhost:6333', apiKey: 'key' },
  };
}

// A JWT-shaped string whose payload decodes to the given claims (signature is not checked).
export function makeIdToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${payload}.signature`;
}

export function makeTokens(sub = 'user-sub'): CognitoCredentials {
  return {
    accessToken: 'access-token',
    idToken: makeIdToken({ sub, 'cognito:username': 'alice' }),
    refreshToken: 'refresh-token',
  };
}

export function makeDoc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    documentId: 'doc-1',
    projectId: 'proj-1',
    ownerSub: 'user-sub',
    documentName: 'report.pdf',
    s3Key: 'user-sub/proj-1/doc-1',
    fileSize: 100,
    uploadedAt: '2026-01-01T00:00:00.000Z',
    processingStatus: 'COMPLETE',
    ...overrides,
  };
}

export function makeGraph(documentId = 'doc-1', projectId = 'proj-1') {
  return {
    documentId,
    projectId,
    entities: [
      { id: 'e1', type: 'Person' as const, value: 'Jane Doe' },
      { id: 'e2', type: 'Organization' as const, value: 'Acme Corp' },
    ],
    relationships: [{ source: 'e1', target: 'e2', type: 'EMPLOYED_BY' }],
  };
}

// Overrides process.platform; returns a function that restores the real value.
export function setPlatform(platform: NodeJS.Platform): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { ...original, value: platform });
  return () => Object.defineProperty(process, 'platform', original);
}

// Lets fire-and-forget promises (void foo()) settle before asserting.
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// Gives every AWS wrapper's credential provider something to return.
export function stubStsCredentials(): void {
  vi.spyOn(AWS_STS, 'maybeRefresh').mockResolvedValue();
  vi.spyOn(AWS_STS, 'credentials', 'get').mockReturnValue({
    accessKeyId: 'AKIA',
    secretAccessKey: 'secret',
    sessionToken: 'token',
    expiresAt: new Date(Date.now() + 3_600_000),
  });
}

interface CredentialedClient {
  config: { credentials: () => Promise<unknown> };
}

// The SDK client an AWS wrapper class holds in its private static `client`.
export function clientOf(wrapper: unknown): CredentialedClient {
  return (wrapper as { client: CredentialedClient }).client;
}

// Resolves the credential provider an AWS wrapper passed to its SDK client.
export async function resolveClientCredentials(client: CredentialedClient): Promise<unknown> {
  return client.config.credentials();
}
