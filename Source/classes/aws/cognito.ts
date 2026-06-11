import {
  AdminInitiateAuthCommand,
  AdminInitiateAuthCommandOutput,
  AuthenticationResultType,
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

import { AWS_STS } from './sts';
import { Logger } from '../../utils/logger';
import { awsConfig } from '../../main/config';
import { CognitoAuthResult } from '../../types/aws';
import { CognitoConfig } from '../../interfaces/config';
import { CognitoCredentials } from '../../interfaces/aws';

export class AWS_COGNITO {
  // Client is created inside init() rather than as a static field initializer because
  // it needs STS credentials that aren't available until AWS_STS.init() has completed.
  private static client: CognitoIdentityProviderClient;

  public static init(): void {
    this.client = new CognitoIdentityProviderClient({
      region: awsConfig.region,
      credentials: async () => {
        await AWS_STS.maybeRefresh();
        return {
          accessKeyId: AWS_STS.credentials.accessKeyId,
          secretAccessKey: AWS_STS.credentials.secretAccessKey,
          sessionToken: AWS_STS.credentials.sessionToken,
        };
      },
    });

    Logger.debug(`Cognito client initialized (region: ${awsConfig.region})`);
  }

  public static async authenticate(
    username: string,
    password: string,
    config: CognitoConfig
  ): Promise<CognitoAuthResult> {
    Logger.info(`Authenticating user: "${username}" (password: ********)`);

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
      Logger.warn(`Authentication response for "${username}" was missing tokens`);
      return false;
    }

    Logger.info(`User "${username}" authenticated successfully`);

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
    Logger.info(`Registering new user: "${username}"`);

    // AdminCreateUser creates the account with a temporary password and sends no
    // invite email (SUPPRESS). AdminSetUserPassword immediately promotes it to a
    // permanent password so the user isn't forced through a change-password flow.
    await this.client.send(
      new AdminCreateUserCommand({
        UserPoolId: config.userPoolId,
        Username: username,
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS',
      })
    );

    Logger.debug(
      `Cognito user "${username}" created — setting permanent password (password: ********)`
    );

    await this.client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: config.userPoolId,
        Username: username,
        Password: password,
        Permanent: true,
      })
    );

    Logger.debug(`Permanent password set for "${username}" — proceeding to sign in`);

    return await this.authenticate(username, password, config);
  }

  public static async findUserByUsername(
    username: string,
    config: CognitoConfig
  ): Promise<{ sub: string; username: string } | null> {
    try {
      const response = await this.client.send(
        new AdminGetUserCommand({
          UserPoolId: config.userPoolId,
          Username: username,
        })
      );
      const sub = response.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
      if (!sub) return null;
      return { sub, username: response.Username ?? username };
    } catch (err) {
      if (err instanceof Error && err.name === 'UserNotFoundException') return null;
      throw err;
    }
  }

  public static async searchUsersByPrefix(
    prefix: string,
    config: CognitoConfig
  ): Promise<string[]> {
    if (!prefix) return [];
    const result = await this.client.send(
      new ListUsersCommand({
        UserPoolId: config.userPoolId,
        Filter: `username ^= "${prefix}"`,
        Limit: 10,
      })
    );
    return (result.Users ?? []).map((u) => u.Username).filter((u): u is string => !!u);
  }

  public static async refreshTokens(
    refreshToken: string,
    config: CognitoConfig
  ): Promise<CognitoCredentials | null> {
    const response = await this.client.send(
      new AdminInitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        UserPoolId: config.userPoolId,
        ClientId: config.clientId,
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      })
    );
    const result: AuthenticationResultType | undefined = response.AuthenticationResult;
    if (!result?.AccessToken || !result.IdToken) {
      Logger.warn('Cognito token refresh returned incomplete tokens');
      return null;
    }
    Logger.info('Cognito tokens refreshed successfully');
    return {
      accessToken: result.AccessToken,
      idToken: result.IdToken,
      refreshToken, // Cognito does not rotate the refresh token on REFRESH_TOKEN_AUTH
    };
  }
}
