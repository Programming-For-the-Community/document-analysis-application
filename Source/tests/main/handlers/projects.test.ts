import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerProjectHandlers } from '../../../main/handlers/projects';
import { AWS_DYNAMODB } from '../../../classes/aws/dynamodb';
import { AWS_COGNITO } from '../../../classes/aws/cognito';
import { AWS_S3 } from '../../../classes/aws/s3';
import { Neo4J } from '../../../classes/neo4j';
import { Qdrant } from '../../../classes/qdrant';
import { ProjectRole } from '../../../types/app';
import { CognitoAuthResult } from '../../../types/aws';
import { Logger } from '../../../utils/logger';
import { makeConfig, makeTokens } from '../../helpers';
import { invoke } from '../../mocks/electron';

const config = makeConfig();
const ME = 'user-sub';
// An AWS SDK error — its message must never reach the UI
const awsError = () =>
  Object.assign(new Error('User: arn:aws:sts::123 is not authorized'), { $metadata: {} });

let appConfig: typeof config | null;
let tokens: CognitoAuthResult | null;

// Role lookups keyed by user sub (the caller is ME)
function roles(byUser: Record<string, ProjectRole | null>) {
  vi.spyOn(AWS_DYNAMODB, 'getProjectRole').mockImplementation(async (sub) => byUser[sub] ?? null);
}

beforeEach(() => {
  appConfig = config;
  tokens = makeTokens(ME);
  registerProjectHandlers(
    () => appConfig,
    () => tokens
  );
});

describe('project:list', () => {
  it('lists the caller’s projects', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listProjectsForUser').mockResolvedValue([]);
    await expect(invoke('project:list')).resolves.toEqual({ success: true, projects: [] });
    expect(AWS_DYNAMODB.listProjectsForUser).toHaveBeenCalledWith(ME, config.dynamoDB);
  });

  it('hides AWS error details', async () => {
    vi.spyOn(AWS_DYNAMODB, 'listProjectsForUser').mockRejectedValue(awsError());
    await expect(invoke('project:list')).resolves.toEqual({
      success: false,
      error: 'Failed to load projects',
    });
  });
});

describe('project:create', () => {
  it('creates a project with a trimmed name', async () => {
    const project = {
      id: 'p',
      name: 'New',
      documentCount: 0,
      lastModified: '',
      role: 'OWNER' as const,
    };
    vi.spyOn(AWS_DYNAMODB, 'createProject').mockResolvedValue(project);

    await expect(invoke('project:create', '  New  ')).resolves.toEqual({ success: true, project });
    expect(AWS_DYNAMODB.createProject).toHaveBeenCalledWith('New', ME, config.dynamoDB);
  });

  it('requires a name', async () => {
    await expect(invoke('project:create', '  ')).resolves.toEqual({
      success: false,
      error: 'Project name is required',
    });
    await expect(invoke('project:create', undefined)).resolves.toMatchObject({ success: false });
  });

  it('passes through application errors but hides AWS ones', async () => {
    vi.spyOn(AWS_DYNAMODB, 'createProject')
      .mockRejectedValueOnce(new Error('A project named "New" already exists.'))
      .mockRejectedValueOnce(awsError());

    await expect(invoke('project:create', 'New')).resolves.toEqual({
      success: false,
      error: 'A project named "New" already exists.',
    });
    await expect(invoke('project:create', 'New')).resolves.toEqual({
      success: false,
      error: 'Failed to create project',
    });
  });
});

describe('project:rename', () => {
  it('lets the owner rename', async () => {
    roles({ [ME]: 'OWNER' });
    vi.spyOn(AWS_DYNAMODB, 'renameProject').mockResolvedValue();

    await expect(invoke('project:rename', 'p', ' Renamed ')).resolves.toEqual({ success: true });
    expect(AWS_DYNAMODB.renameProject).toHaveBeenCalledWith('p', 'Renamed', ME, config.dynamoDB);
  });

  it('refuses non-owners and empty names', async () => {
    roles({ [ME]: 'EDIT' });
    await expect(invoke('project:rename', 'p', 'x')).resolves.toEqual({
      success: false,
      error: 'Only the project owner can rename this project',
    });
    await expect(invoke('project:rename', 'p', '')).resolves.toEqual({
      success: false,
      error: 'Project name is required',
    });
  });

  it('reports failures', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getProjectRole').mockRejectedValue(awsError());
    await expect(invoke('project:rename', 'p', 'x')).resolves.toEqual({
      success: false,
      error: 'Failed to rename project',
    });
  });
});

describe('project:delete', () => {
  beforeEach(() => {
    vi.spyOn(AWS_DYNAMODB, 'deleteProject').mockResolvedValue('user-sub/p/');
    vi.spyOn(AWS_S3, 'deleteProjectObjects').mockResolvedValue();
    vi.spyOn(Neo4J, 'deleteProject').mockResolvedValue();
    vi.spyOn(Qdrant, 'deleteProject').mockResolvedValue();
  });

  it('removes the project from every store', async () => {
    roles({ [ME]: 'OWNER' });

    await expect(invoke('project:delete', 'p')).resolves.toEqual({ success: true });

    expect(AWS_S3.deleteProjectObjects).toHaveBeenCalledWith('user-sub/p/', config.s3);
    expect(Neo4J.deleteProject).toHaveBeenCalledWith('p');
    expect(Qdrant.deleteProject).toHaveBeenCalledWith('p');
  });

  it('treats local store cleanup as non-fatal', async () => {
    roles({ [ME]: 'OWNER' });
    vi.spyOn(Neo4J, 'deleteProject').mockRejectedValue(new Error('neo4j down'));
    vi.spyOn(Qdrant, 'deleteProject').mockRejectedValue('qdrant down');

    await expect(invoke('project:delete', 'p')).resolves.toEqual({ success: true });
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Qdrant cleanup failed (non-fatal): qdrant down')
    );
  });

  it('refuses non-owners and reports failures', async () => {
    roles({ [ME]: 'EDIT' });
    await expect(invoke('project:delete', 'p')).resolves.toEqual({
      success: false,
      error: 'Only the project owner can delete this project',
    });

    roles({ [ME]: 'OWNER' });
    vi.spyOn(AWS_DYNAMODB, 'deleteProject').mockRejectedValue(new Error('Project not found'));
    await expect(invoke('project:delete', 'p')).resolves.toEqual({
      success: false,
      error: 'Project not found',
    });
  });
});

describe('project:get-role', () => {
  it('defaults to VIEW', async () => {
    roles({ [ME]: 'EDIT' });
    await expect(invoke('project:get-role', 'p')).resolves.toEqual({ success: true, role: 'EDIT' });
    roles({});
    await expect(invoke('project:get-role', 'p')).resolves.toEqual({ success: true, role: 'VIEW' });
  });

  it('reports failures', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getProjectRole').mockRejectedValue(awsError());
    await expect(invoke('project:get-role', 'p')).resolves.toEqual({
      success: false,
      error: 'Failed to get project role',
    });
  });
});

describe('project:share', () => {
  beforeEach(() => {
    vi.spyOn(AWS_COGNITO, 'findUserByUsername').mockResolvedValue({
      sub: 'bob-sub',
      username: 'bob',
    });
    vi.spyOn(AWS_DYNAMODB, 'shareProject').mockResolvedValue();
  });

  it('shares with another user', async () => {
    roles({ [ME]: 'OWNER' });

    await expect(invoke('project:share', 'p', 'bob', 'EDIT')).resolves.toEqual({ success: true });
    expect(AWS_DYNAMODB.shareProject).toHaveBeenCalledWith(
      'p',
      'bob-sub',
      'bob',
      'EDIT',
      config.dynamoDB
    );
  });

  it('lets editors share view-only', async () => {
    roles({ [ME]: 'EDIT' });
    await expect(invoke('project:share', 'p', 'bob', 'VIEW')).resolves.toEqual({ success: true });
    await expect(invoke('project:share', 'p', 'bob', 'EDIT')).resolves.toEqual({
      success: false,
      error: 'You can only share projects in view mode',
    });
  });

  it.each([
    ['a viewer', { [ME]: 'VIEW' }, 'Not authorized to share this project'],
    ['a non-member', {}, 'Not authorized to share this project'],
    ['the owner as target', { [ME]: 'EDIT', 'bob-sub': 'OWNER' }, 'This user is the project owner'],
    [
      'an existing member',
      { [ME]: 'OWNER', 'bob-sub': 'VIEW' },
      '"bob" already has access to this project',
    ],
  ] as const)('refuses %s', async (_label, byUser, error) => {
    roles(byUser);
    await expect(invoke('project:share', 'p', 'bob', 'VIEW')).resolves.toEqual({
      success: false,
      error,
    });
  });

  it('refuses unknown users and yourself', async () => {
    roles({ [ME]: 'OWNER' });
    vi.spyOn(AWS_COGNITO, 'findUserByUsername')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sub: ME, username: 'alice' });

    await expect(invoke('project:share', 'p', 'ghost', 'VIEW')).resolves.toEqual({
      success: false,
      error: 'User "ghost" not found',
    });
    await expect(invoke('project:share', 'p', 'alice', 'VIEW')).resolves.toEqual({
      success: false,
      error: 'Cannot share a project with yourself',
    });
  });

  it('reports failures', async () => {
    roles({ [ME]: 'OWNER' });
    vi.spyOn(AWS_DYNAMODB, 'shareProject').mockRejectedValue(awsError());
    await expect(invoke('project:share', 'p', 'bob', 'VIEW')).resolves.toEqual({
      success: false,
      error: 'Failed to share project',
    });
  });
});

describe('project:unshare', () => {
  beforeEach(() => {
    vi.spyOn(AWS_DYNAMODB, 'unshareProject').mockResolvedValue();
  });

  it('lets the owner remove a member and members remove themselves', async () => {
    roles({ [ME]: 'OWNER', 'bob-sub': 'VIEW' });
    await expect(invoke('project:unshare', 'p', 'bob-sub')).resolves.toEqual({ success: true });

    roles({ [ME]: 'VIEW' });
    await expect(invoke('project:unshare', 'p', ME)).resolves.toEqual({ success: true });
    expect(AWS_DYNAMODB.unshareProject).toHaveBeenLastCalledWith('p', ME, config.dynamoDB);
  });

  it.each([
    ['a non-member caller', {}, 'bob-sub', 'Not authorized'],
    [
      'an editor removing someone else',
      { [ME]: 'EDIT', 'bob-sub': 'VIEW' },
      'bob-sub',
      'Not authorized to remove this user',
    ],
    [
      'removing the owner',
      { [ME]: 'OWNER', 'bob-sub': 'OWNER' },
      'bob-sub',
      'Cannot remove the project owner',
    ],
    [
      'a user without access',
      { [ME]: 'OWNER' },
      'bob-sub',
      'User does not have access to this project',
    ],
  ] as const)('refuses %s', async (_label, byUser, target, error) => {
    roles(byUser);
    await expect(invoke('project:unshare', 'p', target)).resolves.toEqual({
      success: false,
      error,
    });
  });

  it('reports failures', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getProjectRole').mockRejectedValue(awsError());
    await expect(invoke('project:unshare', 'p', 'x')).resolves.toEqual({
      success: false,
      error: 'Failed to remove access',
    });
  });
});

describe('project:list-members', () => {
  it('lists members for anyone with access', async () => {
    roles({ [ME]: 'VIEW' });
    vi.spyOn(AWS_DYNAMODB, 'listProjectMembers').mockResolvedValue([
      { userSub: 's', username: 'bob', role: 'VIEW' },
    ]);

    await expect(invoke('project:list-members', 'p')).resolves.toEqual({
      success: true,
      members: [{ userSub: 's', username: 'bob', role: 'VIEW' }],
    });
  });

  it('refuses non-members and reports failures', async () => {
    roles({});
    await expect(invoke('project:list-members', 'p')).resolves.toEqual({
      success: false,
      error: 'Not authorized',
    });

    vi.spyOn(AWS_DYNAMODB, 'getProjectRole').mockRejectedValue(awsError());
    await expect(invoke('project:list-members', 'p')).resolves.toEqual({
      success: false,
      error: 'Failed to list members',
    });
  });
});

describe('project:search-users', () => {
  it('searches by trimmed prefix, skipping empty input', async () => {
    vi.spyOn(AWS_COGNITO, 'searchUsersByPrefix').mockResolvedValue(['bob']);

    await expect(invoke('project:search-users', ' bo ')).resolves.toEqual({
      success: true,
      usernames: ['bob'],
    });
    await expect(invoke('project:search-users', '  ')).resolves.toEqual({
      success: true,
      usernames: [],
    });
    await expect(invoke('project:search-users', '')).resolves.toEqual({
      success: true,
      usernames: [],
    });
    expect(AWS_COGNITO.searchUsersByPrefix).toHaveBeenCalledTimes(1);
    expect(AWS_COGNITO.searchUsersByPrefix).toHaveBeenCalledWith('bo', config.cognito);
  });

  it('reports failures', async () => {
    vi.spyOn(AWS_COGNITO, 'searchUsersByPrefix').mockRejectedValue(awsError());
    await expect(invoke('project:search-users', 'b')).resolves.toEqual({
      success: false,
      error: 'User search is temporarily unavailable',
    });
  });
});

describe('project settings', () => {
  it('reads settings', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getProjectSettings')
      .mockResolvedValueOnce({ minDocFilter: 3 })
      .mockRejectedValueOnce(new Error('x'));

    await expect(invoke('project:get-settings', 'p')).resolves.toEqual({
      success: true,
      minDocFilter: 3,
    });
    await expect(invoke('project:get-settings', 'p')).resolves.toEqual({
      success: false,
      error: 'Failed to load project settings',
    });
  });

  it('saves the min-doc filter for members only', async () => {
    vi.spyOn(AWS_DYNAMODB, 'setProjectMinDocFilter')
      .mockResolvedValueOnce()
      .mockRejectedValueOnce('x');
    roles({ [ME]: 'VIEW' });

    await expect(invoke('project:set-min-doc-filter', 'p', 4)).resolves.toEqual({ success: true });
    expect(AWS_DYNAMODB.setProjectMinDocFilter).toHaveBeenCalledWith('p', 4, config.dynamoDB);
    await expect(invoke('project:set-min-doc-filter', 'p', 4)).resolves.toEqual({
      success: false,
      error: 'Failed to save project settings',
    });

    roles({});
    await expect(invoke('project:set-min-doc-filter', 'p', 4)).resolves.toEqual({
      success: false,
      error: 'Not authorized',
    });
  });
});

describe('project:update-role', () => {
  beforeEach(() => {
    vi.spyOn(AWS_DYNAMODB, 'updateProjectRole').mockResolvedValue();
  });

  it('lets the owner change a member’s role', async () => {
    roles({ [ME]: 'OWNER', 'bob-sub': 'VIEW' });
    await expect(invoke('project:update-role', 'p', 'bob-sub', 'EDIT')).resolves.toEqual({
      success: true,
    });
    expect(AWS_DYNAMODB.updateProjectRole).toHaveBeenCalledWith(
      'p',
      'bob-sub',
      'EDIT',
      config.dynamoDB
    );
  });

  it.each([
    [
      'a non-owner caller',
      { [ME]: 'EDIT', 'bob-sub': 'VIEW' },
      'Only the project owner can change roles',
    ],
    [
      'the owner as target',
      { [ME]: 'OWNER', 'bob-sub': 'OWNER' },
      "Cannot change the owner's role",
    ],
    ['a user without access', { [ME]: 'OWNER' }, 'User does not have access to this project'],
  ] as const)('refuses %s', async (_label, byUser, error) => {
    roles(byUser);
    await expect(invoke('project:update-role', 'p', 'bob-sub', 'EDIT')).resolves.toEqual({
      success: false,
      error,
    });
  });

  it('reports failures', async () => {
    vi.spyOn(AWS_DYNAMODB, 'getProjectRole').mockRejectedValue(awsError());
    await expect(invoke('project:update-role', 'p', 'x', 'VIEW')).resolves.toEqual({
      success: false,
      error: 'Failed to update role',
    });
  });
});

it.each([
  ['project:list', []],
  ['project:create', ['x']],
  ['project:rename', ['p', 'x']],
  ['project:delete', ['p']],
  ['project:get-role', ['p']],
  ['project:share', ['p', 'bob', 'VIEW']],
  ['project:unshare', ['p', 's']],
  ['project:list-members', ['p']],
  ['project:search-users', ['b']],
  ['project:get-settings', ['p']],
  ['project:set-min-doc-filter', ['p', 2]],
  ['project:update-role', ['p', 's', 'VIEW']],
])('%s is unavailable until signed in', async (channel, args) => {
  const notReady = { success: false, error: 'App not ready' };
  appConfig = null;
  await expect(invoke(channel, ...args)).resolves.toEqual(notReady);
  appConfig = config;
  tokens = null;
  await expect(invoke(channel, ...args)).resolves.toEqual(notReady);
  tokens = true;
  await expect(invoke(channel, ...args)).resolves.toEqual(notReady);
});
