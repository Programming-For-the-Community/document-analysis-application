import { STSClient, AssumeRoleCommand, AssumeRoleCommandOutput } from '@aws-sdk/client-sts';

import { Logger } from '../../utils/logger';
import { awsConfig } from '../../main/config';
import { RoleCredentials } from '../../interfaces/aws';

export class AWS_STS {
  // Client is created at class load time — no credentials needed to call AssumeRole,
  // it uses the local AWS CLI session that is already authenticated.
  private static client: STSClient = new STSClient({ region: awsConfig.region });
  public static credentials: RoleCredentials;
  private static roleArn: string;
  private static refreshPromise: Promise<void> | null = null;

  // roleArn is passed in from the secret rather than read from .env,
  // so the secret can be fetched before the role is assumed.
  public static async init(roleArn: string): Promise<void> {
    this.roleArn = roleArn;
    Logger.info(`Assuming IAM role: ${roleArn}`);
    this.credentials = await this.assumeRole();
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

    if (!this.refreshPromise) {
      this.refreshPromise = this.assumeRole()
        .then((creds) => {
          this.credentials = creds;
          Logger.info(`STS credentials refreshed — new expiry: ${creds.expiresAt.toISOString()}`);
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    await this.refreshPromise;
  }

  private static async assumeRole(): Promise<RoleCredentials> {
    const response: AssumeRoleCommandOutput = await this.client.send(
      new AssumeRoleCommand({
        RoleArn: this.roleArn,
        RoleSessionName: 'doc-analysis-electron',
        DurationSeconds: 3600,
      })
    );

    if (
      !response.Credentials ||
      !response.Credentials.AccessKeyId ||
      !response.Credentials.SecretAccessKey
    ) {
      throw new Error('STS returned incomplete credentials');
    }

    return {
      accessKeyId: response.Credentials.AccessKeyId,
      secretAccessKey: response.Credentials.SecretAccessKey,
      sessionToken: response.Credentials.SessionToken,
      expiresAt: response.Credentials.Expiration ?? new Date(Date.now() + 3_600_000),
    };
  }
}
