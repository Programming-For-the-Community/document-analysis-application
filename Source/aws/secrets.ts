import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

import { awsConfig } from '../main/config';
import { SecretValues } from '../interfaces/aws';
import { Logger } from '../utils/logger';

export class AWS_SECRETS {
  private static client: SecretsManagerClient;
  public static secrets: SecretValues;

  // Uses the local AWS credential chain (CLI profile / env vars / IAM instance role)
  // rather than the assumed service role — this is intentional, because the role ARN
  // itself lives inside the secret and must be retrieved before the role can be assumed.
  public static async init(): Promise<void> {
    Logger.debug(`Building Secrets Manager client (region: ${awsConfig.region})`);

    this.client = new SecretsManagerClient({ region: awsConfig.region });

    Logger.info(`Fetching secret: "${awsConfig.secretName}"`);

    const response = await this.client.send(
      new GetSecretValueCommand({ SecretId: awsConfig.secretName })
    );

    if (!response.SecretString) {
      throw new Error(`Secret "${awsConfig.secretName}" has no string value`);
    }

    this.secrets = JSON.parse(response.SecretString) as SecretValues;

    if (!this.secrets.SVC_ROLE_ARN) {
      throw new Error(`Secret "${awsConfig.secretName}" is missing required key: SVC_ROLE_ARN`);
    }

    Logger.info(
      `Secret "${awsConfig.secretName}" loaded — ${Object.keys(this.secrets).length} keys`
    );
  }
}
