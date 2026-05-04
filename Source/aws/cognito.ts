import {
  AdminInitiateAuthCommand,
  AdminInitiateAuthCommandOutput,
  AuthenticationResultType,
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';

import { AWS_STS } from './sts';
import { awsConfig } from '../main/config';
import { CognitoConfig } from '../interfaces/app';
import { CognitoAuthResult } from '../types/aws';

export class AWS_COGNITO {
  private static client: CognitoIdentityProviderClient;

  public static init(): void {
    this.client = new CognitoIdentityProviderClient({
      region: awsConfig.region,
      credentials: {
        accessKeyId: AWS_STS.credentials.accessKeyId,
        secretAccessKey: AWS_STS.credentials.secretAccessKey,
        sessionToken: AWS_STS.credentials.sessionToken,
      },
    });
  }

  public static async authenticate(
    username: string,
    password: string,
    config: CognitoConfig
  ): Promise<CognitoAuthResult> {
    const cmd: AdminInitiateAuthCommand = new AdminInitiateAuthCommand({
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      UserPoolId: config.userPoolId,
      ClientId: config.clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    });

    const response: AdminInitiateAuthCommandOutput = await this.client.send(cmd);

    const result: AuthenticationResultType | undefined = response.AuthenticationResult;

    if (!result || !result.AccessToken || !result.IdToken || !result.RefreshToken) {
      return false;
    }

    return {
      accessToken: result.AccessToken,
      idToken: result.IdToken,
      refreshToken: result.RefreshToken,
    };
  }

  public static async register(
    username: string,
    password: string,
    config: CognitoConfig
  ): Promise<CognitoAuthResult> {
    const createUserCmd = new AdminCreateUserCommand({
      UserPoolId: config.userPoolId,
      Username: username,
      TemporaryPassword: password,
      MessageAction: 'SUPPRESS',
    });

    await this.client.send(createUserCmd);

    const setUserPasswordCmd = new AdminSetUserPasswordCommand({
      UserPoolId: config.userPoolId,
      Username: username,
      Password: password,
      Permanent: true,
    });

    await this.client.send(setUserPasswordCmd);

    return await this.authenticate(username, password, config);
  }
}
