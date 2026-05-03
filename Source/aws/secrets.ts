import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import { RoleCredentials, SecretValues } from "../interfaces/aws";

export class AWS_SECRETS {
    private static secretsClient: SecretsManagerClient;
    private static secrets: SecretValues | null = null;

    static async init(region: string, credentials: RoleCredentials): Promise<void> {
        AWS_SECRETS.secretsClient = new SecretsManagerClient({
            region,
            credentials: {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken,
            },
        });
    }

    static async loadSecrets(secretName: string): Promise<void> {
        if (!AWS_SECRETS.secretsClient) {
            throw new Error('AWS_SECRETS not initialized — call init() first');
        }

        const response = await AWS_SECRETS.secretsClient.send(
            new GetSecretValueCommand({ SecretId: secretName }),
        );

        if (!response.SecretString) {
            throw new Error(`Secret "${secretName}" has no string value`);
        }

        AWS_SECRETS.secrets = JSON.parse(response.SecretString) as SecretValues;
    }

    static getSecrets(): SecretValues {
        if (!AWS_SECRETS.secrets) {
            throw new Error('Secrets not loaded — restart the app');
        }

        return AWS_SECRETS.secrets;
    }
}
