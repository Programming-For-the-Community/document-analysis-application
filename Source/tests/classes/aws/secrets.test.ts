import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import { AWS_SECRETS } from '../../../classes/aws/secrets';

const sm = mockClient(SecretsManagerClient);

describe('AWS_SECRETS', () => {
  beforeEach(() => sm.reset());

  it('loads and parses the secret', async () => {
    sm.on(GetSecretValueCommand).resolves({
      SecretString: JSON.stringify({ SVC_ROLE_ARN: 'arn:role', S3_BUCKET: 'b' }),
    });

    await AWS_SECRETS.init();

    expect(AWS_SECRETS.secrets.SVC_ROLE_ARN).toBe('arn:role');
    expect(AWS_SECRETS.secrets.S3_BUCKET).toBe('b');
  });

  it('rejects a secret with no string value', async () => {
    sm.on(GetSecretValueCommand).resolves({});
    await expect(AWS_SECRETS.init()).rejects.toThrow('has no string value');
  });

  it('rejects a secret missing SVC_ROLE_ARN', async () => {
    sm.on(GetSecretValueCommand).resolves({ SecretString: JSON.stringify({ S3_BUCKET: 'b' }) });
    await expect(AWS_SECRETS.init()).rejects.toThrow('missing required key: SVC_ROLE_ARN');
  });
});
