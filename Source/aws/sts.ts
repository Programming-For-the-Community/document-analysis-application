import { STSClient, AssumeRoleCommand, AssumeRoleCommandOutput } from '@aws-sdk/client-sts';

import { awsConfig } from '../main/config';
import { RoleCredentials } from '../interfaces/aws';
import { Logger } from '../utils/logger';

export class AWS_STS {
  // Client is created at class load time — no credentials needed to call AssumeRole,
  // it uses the local AWS CLI session that is already authenticated.
  private static client: STSClient = new STSClient({ region: awsConfig.region });
  public static credentials: RoleCredentials;

  public static async init(): Promise<void> {
    Logger.info(`Assuming IAM role: ${awsConfig.roleArn}`);
    this.credentials = await this.assumeRole();
    Logger.info(`Role assumed successfully — session valid for 1h (keyId: ${this.credentials.accessKeyId})`);
  }

  public static async maybeRefresh(): Promise<void> {
    const fiveMin = 5 * 60 * 1000;
    if (this.credentials.expiresAt.getTime() - Date.now() < fiveMin) {
      Logger.info('STS credentials expiring soon — refreshing');
      this.credentials = await this.assumeRole();
      Logger.info(`STS credentials refreshed — new expiry: ${this.credentials.expiresAt.toISOString()}`);
    }
  }

  private static async assumeRole(): Promise<RoleCredentials> {
    const response: AssumeRoleCommandOutput = await this.client.send(
      new AssumeRoleCommand({
        RoleArn: awsConfig.roleArn,
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