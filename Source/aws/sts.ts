import { STSClient, AssumeRoleCommand, AssumeRoleCommandOutput } from '@aws-sdk/client-sts';

import { awsConfig } from '../main/config';
import { RoleCredentials } from '../interfaces/aws';

export class AWS_STS {
  private static client: STSClient = new STSClient({ region: awsConfig.region });
  public static credentials: RoleCredentials;

  public static async init(): Promise<void> {
    this.credentials = await this.assumeRole();
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
    };
  }
}
