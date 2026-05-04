import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

import { AWS_STS } from './sts';
import { awsConfig } from '../main/config';
import { SecretValues } from '../interfaces/aws';
import { Logger } from '../utils/logger';

export class AWS_SECRETS {
  // Client is created inside init() rather than as a static field initializer because
  // it needs STS credentials that aren't available until AWS_STS.init() has completed.
  private static client: SecretsManagerClient;
  public static secrets: SecretValues;

  public static async init(): Promise<void> {
    Logger.debug(`Building Secrets Manager client (region: ${awsConfig.region})`);

    this.client = new SecretsManagerClient({
      region: awsConfig.region,
      credentials: {
        accessKeyId: AWS_STS.credentials.accessKeyId,
        secretAccessKey: AWS_STS.credentials.secretAccessKey,
        sessionToken: AWS_STS.credentials.sessionToken,
      },
    });

    if (!this.client) {
      throw new Error('AWS_SECRETS not initialized — call init() first');
    }

    Logger.info(`Fetching secret: "${awsConfig.secretName}"`);

    const response = await this.client.send(
      new GetSecretValueCommand({ SecretId: awsConfig.secretName })
    );

    if (!response.SecretString) {
      throw new Error(`Secret "${awsConfig.secretName}" has no string value`);
    }

    this.secrets = JSON.parse(response.SecretString) as SecretValues;
    Logger.info(`Secret "${awsConfig.secretName}" loaded — ${Object.keys(this.secrets).length} keys`);
  }
}