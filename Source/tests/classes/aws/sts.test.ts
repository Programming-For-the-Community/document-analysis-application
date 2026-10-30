import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

import { AWS_STS } from '../../../classes/aws/sts';

const sts = mockClient(STSClient);

function creds(expiresInMs: number, keyId = 'AKIA1') {
  return {
    Credentials: {
      AccessKeyId: keyId,
      SecretAccessKey: 'secret',
      SessionToken: 'token',
      Expiration: new Date(Date.now() + expiresInMs),
    },
  };
}

describe('AWS_STS', () => {
  beforeEach(() => {
    sts.reset();
  });

  it('assumes the role anonymously on init', async () => {
    sts.on(AssumeRoleCommand).resolves(creds(3_600_000));

    await AWS_STS.init('arn:aws:iam::1:role/svc');

    expect(AWS_STS.credentials.accessKeyId).toBe('AKIA1');
    expect(sts.commandCalls(AssumeRoleCommand)[0]!.args[0].input).toMatchObject({
      RoleArn: 'arn:aws:iam::1:role/svc',
      RoleSessionName: 'doc-analysis-electron',
      SourceIdentity: undefined,
      DurationSeconds: 3600,
    });
  });

  it('falls back to a 1h expiry when AWS omits Expiration', async () => {
    sts.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: 'A',
        SecretAccessKey: 'S',
        SessionToken: 'T',
        Expiration: undefined,
      },
    });

    await AWS_STS.init('arn:role');

    expect(AWS_STS.credentials.expiresAt.getTime() - Date.now()).toBeGreaterThan(3_500_000);
  });

  it('rejects incomplete credentials', async () => {
    sts.on(AssumeRoleCommand).resolves({});
    await expect(AWS_STS.init('arn:role')).rejects.toThrow('incomplete credentials');
  });

  it('does not refresh credentials that are still fresh', async () => {
    sts.on(AssumeRoleCommand).resolves(creds(3_600_000));
    await AWS_STS.init('arn:role');
    sts.resetHistory();

    await AWS_STS.maybeRefresh();

    expect(sts.commandCalls(AssumeRoleCommand)).toHaveLength(0);
  });

  it('refreshes expiring credentials once for concurrent callers', async () => {
    sts.on(AssumeRoleCommand).resolvesOnce(creds(60_000)).resolves(creds(3_600_000, 'AKIA2'));
    await AWS_STS.init('arn:role');

    await Promise.all([AWS_STS.maybeRefresh(), AWS_STS.maybeRefresh()]);

    expect(sts.commandCalls(AssumeRoleCommand)).toHaveLength(2);
    expect(AWS_STS.credentials.accessKeyId).toBe('AKIA2');
  });

  it('re-assumes the role with and without a source identity', async () => {
    sts.on(AssumeRoleCommand).resolves(creds(3_600_000));
    await AWS_STS.init('arn:role');

    await AWS_STS.setSourceIdentity('sub-123');
    await AWS_STS.setSourceIdentity(null);

    const [, withUser, withoutUser] = sts
      .commandCalls(AssumeRoleCommand)
      .map((c) => c.args[0].input);
    expect(withUser).toMatchObject({ RoleSessionName: 'user-sub-123', SourceIdentity: 'sub-123' });
    expect(withoutUser).toMatchObject({ RoleSessionName: 'doc-analysis-electron' });
  });

  it('keeps the current session and identity when the new identity is refused', async () => {
    sts
      .on(AssumeRoleCommand)
      .resolvesOnce(creds(3_600_000, 'KEEP'))
      .rejectsOnce(new Error('AccessDenied'))
      .resolves(creds(3_600_000, 'NEXT'));
    await AWS_STS.init('arn:role');

    await AWS_STS.setSourceIdentity('sub-123');
    expect(AWS_STS.credentials.accessKeyId).toBe('KEEP');

    // The refused identity was rolled back, so a later refresh assumes anonymously
    await AWS_STS.setSourceIdentity(null);
    expect(
      sts.commandCalls(AssumeRoleCommand).at(-1)!.args[0].input.SourceIdentity
    ).toBeUndefined();
  });
});
