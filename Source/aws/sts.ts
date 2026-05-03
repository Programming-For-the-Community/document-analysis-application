import { STSClient, AssumeRoleCommand, AssumeRoleCommandOutput } from '@aws-sdk/client-sts'

import { awsConfig } from '../main/config'
import { RoleCredentials } from '../interfaces/aws'

export class AWS_STS {
    private static instance: AWS_STS;
    private static stsClient: STSClient;
    private static credentials: RoleCredentials | null = null;

    private constructor() {
        AWS_STS.stsClient = new STSClient({ region: awsConfig.region })
    }

    static getInstance(): AWS_STS {
        if (!AWS_STS.instance) {
            AWS_STS.instance = new AWS_STS()
        }

        return AWS_STS.instance;
    }

    static async getCredentials(): Promise<RoleCredentials> {
        AWS_STS.getInstance();
        if(!AWS_STS.credentials) {
            AWS_STS.credentials = await AWS_STS.assumeRole();
        }

        return AWS_STS.credentials;
    }

    private static async assumeRole(): Promise<RoleCredentials> {
        const response: AssumeRoleCommandOutput = await AWS_STS.stsClient.send(
            new AssumeRoleCommand({
                RoleArn: awsConfig.roleArn,
                RoleSessionName: 'doc-analysis-electron',
                DurationSeconds: 3600,
            }),
        );

        if (!response.Credentials || !response.Credentials.AccessKeyId || !response.Credentials.SecretAccessKey) {
            throw new Error('STS returned incomplete credentials')
        } 

        return {
            accessKeyId: response.Credentials.AccessKeyId,
            secretAccessKey: response.Credentials.SecretAccessKey,
            sessionToken: response.Credentials.SessionToken,
        };
    }
}