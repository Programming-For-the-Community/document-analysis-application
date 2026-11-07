import { STSClient, AssumeRoleCommand, AssumeRoleCommandOutput } from '@aws-sdk/client-sts';

import { Logger } from '../../utils/logger';
import { awsConfig } from '../../main/config';
import { RoleCredentials } from '../../interfaces/aws';

export class AWS_STS {
  // Client is created at class load time — no credentials needed to call AssumeRole,
  // it uses the local AWS CLI session that is already authenticated.
  private static readonly client: STSClient = new STSClient({ region: awsConfig.region });
  private static current: RoleCredentials;

  public static get credentials(): RoleCredentials {
    return this.current;
  }
  private static roleArn: string;
  private static refreshPromise: Promise<void> | null = null;
  // Cognito sub of the signed-in user, stamped on the role session so CloudTrail
  // attributes every AWS call to that user. Null before login / after logout.
  private static sourceIdentity: string | null = null;

  // roleArn is passed in from the secret rather than read from .env,
  // so the secret can be fetched before the role is assumed.
  public static async init(roleArn: string): Promise<void> {
    this.roleArn = roleArn;
    Logger.info(`Assuming IAM role: ${roleArn}`);
    this.current = await this.assumeRole();
    Logger.info(
      `Role assumed successfully — session valid for 1h (keyId: ${this.credentials.accessKeyId})`
    );
  }

  // Refreshes credentials if expiring within 5 minutes or already expired.
  // Concurrent callers share a single in-flight assumeRole to avoid thundering-herd
  // on resume from sleep when many API calls fire simultaneously.
  public static async maybeRefresh(): Promise<void> {
    const fiveMin = 5 * 60 * 1000;
    if (this.credentials.expiresAt.getTime() - Date.now() >= fiveMin) return;

    this.refreshPromise ??= this.assumeRole()
      .then((creds) => {
        this.current = creds;
        Logger.info(`STS credentials refreshed — new expiry: ${creds.expiresAt.toISOString()}`);
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    await this.refreshPromise;
  }

  // Re-assumes the role with (or without) a per-user identity. Non-fatal: if the
  // trust policy doesn't yet allow sts:SetSourceIdentity, the current anonymous
  // session is kept so login still works.
  public static async setSourceIdentity(userSub: string | null): Promise<void> {
    const previous = this.sourceIdentity;
    this.sourceIdentity = userSub;
    try {
      this.current = await this.assumeRole();
      Logger.info(
        userSub
          ? `Role session re-assumed with source identity ${userSub}`
          : 'Role session re-assumed without source identity'
      );
    } catch (err) {
      this.sourceIdentity = previous;
      Logger.warn(
        `Could not re-assume role with source identity — keeping current session: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private static async assumeRole(): Promise<RoleCredentials> {
    const response: AssumeRoleCommandOutput = await this.client.send(
      new AssumeRoleCommand({
        RoleArn: this.roleArn,
        // Session names allow [\w+=,.@-]{2,64}; a Cognito sub (UUID) fits with the prefix
        RoleSessionName: this.sourceIdentity
          ? `user-${this.sourceIdentity}`
          : 'doc-analysis-electron',
        SourceIdentity: this.sourceIdentity ?? undefined,
        DurationSeconds: 3600,
      })
    );

    if (!response.Credentials?.AccessKeyId || !response.Credentials.SecretAccessKey) {
      throw new Error('STS returned incomplete credentials');
    }

    return {
      accessKeyId: response.Credentials.AccessKeyId,
      secretAccessKey: response.Credentials.SecretAccessKey,
      sessionToken: response.Credentials.SessionToken,
      // Expiration should always be set for an AssumeRole response; fall back to the
      // requested 1h duration in case AWS ever omits it.
      expiresAt: response.Credentials.Expiration ?? new Date(Date.now() + 3_600_000),
    };
  }
}
