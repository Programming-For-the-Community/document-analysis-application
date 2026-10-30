import { describe, expect, it } from 'vitest';

import { extractSub } from '../../utils/jwt';
import { userFacingError } from '../../utils/errors';
import { extractDocumentText } from '../../utils/textract';
import { buildAppConfig } from '../../main/config';
import { SecretValues } from '../../interfaces/aws';
import { makeIdToken } from '../helpers';

describe('extractSub', () => {
  it('reads the sub claim from a base64url payload', () => {
    // '~~~' encodes to base64 with '+'/'/', which base64url turns into '-'/'_'
    expect(extractSub(makeIdToken({ sub: 'abc-123', note: '~~~???' }))).toBe('abc-123');
  });

  it.each([
    ['missing', {}],
    ['empty', { sub: '' }],
    ['not a string', { sub: 42 }],
  ])('rejects a %s sub', (_label, claims) => {
    expect(() => extractSub(makeIdToken(claims))).toThrow('ID token missing sub claim');
  });

  it('rejects a token with no payload', () => {
    expect(() => extractSub('just-one-part')).toThrow();
  });
});

describe('userFacingError', () => {
  it('shows application errors but hides AWS SDK errors', () => {
    expect(userFacingError(new Error('Project not found'), 'fallback')).toBe('Project not found');
    expect(
      userFacingError(Object.assign(new Error('arn:aws:...'), { $metadata: {} }), 'fallback')
    ).toBe('fallback');
    expect(userFacingError('string', 'fallback')).toBe('fallback');
  });
});

describe('extractDocumentText', () => {
  it('joins the text of LINE blocks', () => {
    expect(
      extractDocumentText([
        { BlockType: 'PAGE' },
        { BlockType: 'LINE', Text: 'first' },
        { BlockType: 'WORD', Text: 'first' },
        { BlockType: 'LINE' },
        { BlockType: 'LINE', Text: 'second' },
      ])
    ).toBe('first\nsecond');
  });
});

describe('buildAppConfig', () => {
  it('maps secret values onto the app configuration', () => {
    const secrets: SecretValues = {
      SVC_ROLE_ARN: 'arn',
      COGNITO_USER_POOL_ID: 'pool',
      COGNITO_CLIENT_ID: 'client',
      S3_BUCKET: 'docs',
      RELEASE_BUCKET: 'releases',
      DYNAMODB_PROJECT_STATE_TABLE: 'state',
      DYNAMODB_PROJECT_ACCESS_TABLE: 'access',
      DYNAMODB_USER_SESSIONS_TABLE: 'sessions',
      SQS_QUEUE_URL: 'queue',
      SNS_TOPIC_ARN: 'topic',
      BEDROCK_MODEL_ID: 'model',
      QDRANT_KEY: 'qkey',
      SVC_PWD: 'pw',
      NEO4J_URI: 'bolt://x',
      QDRANT_URL: 'http://q',
    };

    expect(buildAppConfig(secrets)).toEqual({
      dynamoDB: {
        projectStateTable: 'state',
        projectAccessTable: 'access',
        userSessionsTable: 'sessions',
      },
      cognito: { userPoolId: 'pool', clientId: 'client' },
      s3: { documentBucket: 'docs' },
      releases: { bucket: 'releases' },
      sns: { topicArn: 'topic' },
      sqs: { queueUrl: 'queue' },
      bedrock: { modelId: 'model' },
      neo4j: { uri: 'bolt://x', user: 'neo4j', password: 'pw' },
      qdrant: { url: 'http://q', apiKey: 'qkey' },
    });
  });
});
