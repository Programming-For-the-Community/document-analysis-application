import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

import { AWS_COGNITO } from '../../../classes/aws/cognito';
import { clientOf, resolveClientCredentials, stubStsCredentials } from '../../helpers';

const cognito = mockClient(CognitoIdentityProviderClient);
const config = { userPoolId: 'pool', clientId: 'client' };
const fullTokens = { AccessToken: 'a', IdToken: 'i', RefreshToken: 'r' };

describe('AWS_COGNITO', () => {
  beforeEach(() => {
    cognito.reset();
    stubStsCredentials();
    AWS_COGNITO.init();
  });

  it('sources credentials from the assumed role', async () => {
    await expect(resolveClientCredentials(clientOf(AWS_COGNITO))).resolves.toMatchObject({
      accessKeyId: 'AKIA',
    });
  });

  describe('authenticate', () => {
    it('returns the token set', async () => {
      cognito.on(AdminInitiateAuthCommand).resolves({ AuthenticationResult: fullTokens });

      await expect(AWS_COGNITO.authenticate('alice', 'pw', config)).resolves.toEqual({
        accessToken: 'a',
        idToken: 'i',
        refreshToken: 'r',
      });
      expect(cognito.commandCalls(AdminInitiateAuthCommand)[0]!.args[0].input).toMatchObject({
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: 'alice', PASSWORD: 'pw' },
      });
    });

    it('returns false when tokens are missing', async () => {
      cognito.on(AdminInitiateAuthCommand).resolves({ AuthenticationResult: { AccessToken: 'a' } });
      await expect(AWS_COGNITO.authenticate('alice', 'pw', config)).resolves.toBe(false);
    });
  });

  it('registers a user with a permanent password, then signs in', async () => {
    cognito.on(AdminCreateUserCommand).resolves({});
    cognito.on(AdminSetUserPasswordCommand).resolves({});
    cognito.on(AdminInitiateAuthCommand).resolves({ AuthenticationResult: fullTokens });

    await expect(AWS_COGNITO.register('bob', 'pw', config)).resolves.toMatchObject({
      idToken: 'i',
    });
    expect(cognito.commandCalls(AdminCreateUserCommand)[0]!.args[0].input).toMatchObject({
      Username: 'bob',
      MessageAction: 'SUPPRESS',
    });
    expect(cognito.commandCalls(AdminSetUserPasswordCommand)[0]!.args[0].input.Permanent).toBe(
      true
    );
  });

  describe('findUserByUsername', () => {
    it('returns the sub and canonical username', async () => {
      cognito.on(AdminGetUserCommand).resolves({
        Username: 'Bob',
        UserAttributes: [
          { Name: 'email', Value: 'x' },
          { Name: 'sub', Value: 'sub-1' },
        ],
      });
      await expect(AWS_COGNITO.findUserByUsername('bob', config)).resolves.toEqual({
        sub: 'sub-1',
        username: 'Bob',
      });
    });

    it('falls back to the requested username', async () => {
      cognito.on(AdminGetUserCommand).resolves({ UserAttributes: [{ Name: 'sub', Value: 's' }] });
      await expect(AWS_COGNITO.findUserByUsername('bob', config)).resolves.toEqual({
        sub: 's',
        username: 'bob',
      });
    });

    it('returns null without a sub attribute', async () => {
      cognito.on(AdminGetUserCommand).resolves({});
      await expect(AWS_COGNITO.findUserByUsername('bob', config)).resolves.toBeNull();
    });

    it('returns null for an unknown user', async () => {
      cognito
        .on(AdminGetUserCommand)
        .rejects(Object.assign(new Error('nope'), { name: 'UserNotFoundException' }));
      await expect(AWS_COGNITO.findUserByUsername('bob', config)).resolves.toBeNull();
    });

    it('rethrows other errors', async () => {
      cognito.on(AdminGetUserCommand).rejects(new Error('throttled'));
      await expect(AWS_COGNITO.findUserByUsername('bob', config)).rejects.toThrow('throttled');
    });
  });

  describe('searchUsersByPrefix', () => {
    it('returns nothing for an empty prefix without calling Cognito', async () => {
      await expect(AWS_COGNITO.searchUsersByPrefix('', config)).resolves.toEqual([]);
      expect(cognito.calls()).toHaveLength(0);
    });

    it('returns matching usernames', async () => {
      cognito
        .on(ListUsersCommand)
        .resolves({ Users: [{ Username: 'bob' }, {}, { Username: 'bobby' }] });

      await expect(AWS_COGNITO.searchUsersByPrefix('bo', config)).resolves.toEqual([
        'bob',
        'bobby',
      ]);
      expect(cognito.commandCalls(ListUsersCommand)[0]!.args[0].input.Filter).toBe(
        'username ^= "bo"'
      );
    });

    it('handles a response with no users', async () => {
      cognito.on(ListUsersCommand).resolves({});
      await expect(AWS_COGNITO.searchUsersByPrefix('bo', config)).resolves.toEqual([]);
    });
  });

  describe('refreshTokens', () => {
    it('keeps the existing refresh token', async () => {
      cognito
        .on(AdminInitiateAuthCommand)
        .resolves({ AuthenticationResult: { AccessToken: 'a2', IdToken: 'i2' } });

      await expect(AWS_COGNITO.refreshTokens('r', config)).resolves.toEqual({
        accessToken: 'a2',
        idToken: 'i2',
        refreshToken: 'r',
      });
    });

    it('returns null for an incomplete response', async () => {
      cognito.on(AdminInitiateAuthCommand).resolves({});
      await expect(AWS_COGNITO.refreshTokens('r', config)).resolves.toBeNull();
    });
  });
});
