import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

import { AWS_STS } from './sts';
import { awsConfig } from '../main/config';
import { SecretValues } from '../interfaces/aws';

export class AWS_SECRETS {
  private static client: SecretsManagerClient;
  public static secrets: SecretValues;

  public static async init(): Promise<void> {
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

    const response = await this.client.send(
      new GetSecretValueCommand({ SecretId: awsConfig.secretName })
    );

    if (!response.SecretString) {
      throw new Error(`Secret "${awsConfig.secretName}" has no string value`);
    }

    this.secrets = JSON.parse(response.SecretString) as SecretValues;
  }
}
