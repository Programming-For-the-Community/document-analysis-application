// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';

import * as home from '../../renderer/handlers/home/projects';
import * as signInHandlers from '../../renderer/handlers/login/signIn';
import * as signUpHandlers from '../../renderer/handlers/login/signUp';
import * as docs from '../../renderer/handlers/project/documents';
import * as graph from '../../renderer/handlers/project/graph';
import * as search from '../../renderer/handlers/project/search';
import * as share from '../../renderer/handlers/project/share';
import { HOME_ERRORS } from '../../constants/renderer/home';
import { LOGIN_ERRORS } from '../../constants/renderer/login';
import { PROJECT_ERRORS } from '../../constants/renderer/project/errors';
import { makeDoc } from '../helpers';
import { installElectronApi } from './electron-api';

let api: ReturnType<typeof installElectronApi>;
const project = { id: 'p', name: 'P', documentCount: 0, lastModified: '', role: 'OWNER' as const };
const node = { data: { id: 'Jane:Person', label: 'Jane', type: 'Person', docCount: 2 } };
const edge = { data: { id: 'e', source: 'a', target: 'b', label: 'X' } };

beforeEach(() => {
  api = installElectronApi();
});

describe('home handlers', () => {
  it('loads projects', async () => {
    api.projects.list
      .mockResolvedValueOnce({ success: true, projects: [project] })
      .mockResolvedValueOnce({ success: false, error: 'denied' })
      .mockResolvedValueOnce({ success: true });

    await expect(home.loadProjects()).resolves.toEqual({ projects: [project], error: null });
    await expect(home.loadProjects()).resolves.toEqual({ error: 'denied' });
    await expect(home.loadProjects()).resolves.toEqual({ error: HOME_ERRORS.PROJECT_LOAD_FAILURE });
  });

  it('renames and deletes projects', async () => {
    api.projects.rename
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });
    api.projects.delete
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'nope' })
      .mockResolvedValueOnce({ success: false });

    await expect(home.renameProject('p', 'n')).resolves.toEqual({ error: null });
    await expect(home.renameProject('p', 'n')).resolves.toEqual({
      error: HOME_ERRORS.PROJECT_RENAME_FAILURE,
    });
    await expect(home.deleteProject('p')).resolves.toEqual({ error: null });
    await expect(home.deleteProject('p')).resolves.toEqual({ error: 'nope' });
    await expect(home.deleteProject('p')).resolves.toEqual({
      error: HOME_ERRORS.PROJECT_DELETE_FAILURE,
    });
  });

  it('creates projects', async () => {
    api.projects.create
      .mockResolvedValueOnce({ success: true, project })
      .mockResolvedValueOnce({ success: false, error: 'exists' })
      .mockResolvedValueOnce({ success: true });

    await expect(home.createProject('P')).resolves.toEqual({ project, error: null });
    await expect(home.createProject('P')).resolves.toEqual({ error: 'exists' });
    await expect(home.createProject('P')).resolves.toEqual({
      error: HOME_ERRORS.PROJECT_CREATION_FAILURE,
    });
  });
});

describe('login handlers', () => {
  it('validates sign-in fields', () => {
    expect(signInHandlers.validateSignIn('', 'pw')).toBe(LOGIN_ERRORS.MISSING_CREDENTIALS);
    expect(signInHandlers.validateSignIn('alice', '')).toBe(LOGIN_ERRORS.MISSING_CREDENTIALS);
    expect(signInHandlers.validateSignIn('alice', 'pw')).toBeNull();
  });

  it('validates sign-up fields', () => {
    expect(signUpHandlers.validateSignUp('a', 'pw', '')).toBe(LOGIN_ERRORS.MISSING_SIGNUP_FIELDS);
    expect(signUpHandlers.validateSignUp('a', 'password1', 'password2')).toBe(
      LOGIN_ERRORS.PASSWORDS_DO_NOT_MATCH
    );
    expect(signUpHandlers.validateSignUp('a', 'short', 'short')).toBe(
      LOGIN_ERRORS.PASSWORD_TOO_SHORT
    );
    expect(signUpHandlers.validateSignUp('a', 'longenough', 'longenough')).toBeNull();
  });

  it('signs in and signs up', async () => {
    api.auth.start
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'bad' })
      .mockResolvedValueOnce({ success: false });
    api.auth.signup
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });

    await expect(signInHandlers.signIn('a', 'b')).resolves.toEqual({ error: null });
    expect(api.auth.start).toHaveBeenCalledWith({ username: 'a', password: 'b' });
    await expect(signInHandlers.signIn('a', 'b')).resolves.toEqual({ error: 'bad' });
    await expect(signInHandlers.signIn('a', 'b')).resolves.toEqual({
      error: LOGIN_ERRORS.SIGNIN_FAILURE,
    });
    await expect(signUpHandlers.signUp('a', 'b')).resolves.toEqual({ error: null });
    await expect(signUpHandlers.signUp('a', 'b')).resolves.toEqual({
      error: LOGIN_ERRORS.SIGNUP_FAILURE,
    });
  });
});

describe('document handlers', () => {
  it('loads documents', async () => {
    api.documents.list
      .mockResolvedValueOnce({ success: true, documents: [makeDoc()] })
      .mockResolvedValueOnce({ success: false, error: 'x' })
      .mockResolvedValueOnce({ success: true });

    await expect(docs.loadDocuments('p')).resolves.toEqual({ documents: [makeDoc()], error: null });
    await expect(docs.loadDocuments('p')).resolves.toEqual({ error: 'x' });
    await expect(docs.loadDocuments('p')).resolves.toEqual({
      error: PROJECT_ERRORS.DOC_LOAD_FAILURE,
    });
  });

  it('groups partial upload failures by reason', async () => {
    api.documents.upload.mockResolvedValue({
      success: true,
      failed: [
        { name: 'a.exe', error: 'Unsupported' },
        { name: 'b.exe', error: 'Unsupported' },
        { name: 'c.exe', error: 'Unsupported' },
        { name: 'd.exe', error: 'Unsupported' },
        { name: 'e.exe', error: 'Unsupported' },
        { name: 'dup.pdf', error: 'Duplicate' },
      ],
    });

    await expect(docs.uploadFiles('p', [])).resolves.toEqual({
      error: null,
      partialErrors: [
        'Could not upload a.exe, b.exe, c.exe and 2 more: Unsupported',
        'Could not upload dup.pdf: Duplicate',
      ],
    });
  });

  it('reports whole-upload results', async () => {
    api.documents.upload
      .mockResolvedValueOnce({ success: true, failed: [] })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'denied' })
      .mockResolvedValueOnce({ success: false });

    await expect(docs.uploadFiles('p', [])).resolves.toEqual({ error: null, partialErrors: [] });
    await expect(docs.uploadFiles('p', [])).resolves.toEqual({ error: null, partialErrors: [] });
    await expect(docs.uploadFiles('p', [])).resolves.toEqual({
      error: 'denied',
      partialErrors: [],
    });
    await expect(docs.uploadFiles('p', [])).resolves.toEqual({
      error: PROJECT_ERRORS.DOC_UPLOAD_FAILURE,
      partialErrors: [],
    });
  });

  it('deletes documents and retries graphs', async () => {
    api.documents.delete
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });
    api.documents.retryGraph
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'busy' })
      .mockResolvedValueOnce({ success: false });

    await expect(docs.deleteDocument('p', 'd')).resolves.toEqual({ error: null });
    await expect(docs.deleteDocument('p', 'd')).resolves.toEqual({
      error: PROJECT_ERRORS.DOC_DELETE_FAILURE,
    });
    await expect(docs.retryGraph('p', 'd')).resolves.toEqual({ error: null });
    await expect(docs.retryGraph('p', 'd')).resolves.toEqual({ error: 'busy' });
    await expect(docs.retryGraph('p', 'd')).resolves.toEqual({
      error: PROJECT_ERRORS.GRAPH_RETRY_FAILURE,
    });
  });
});

describe('graph handlers', () => {
  it('syncs then loads the graph', async () => {
    api.graph.syncProject.mockResolvedValue({ success: true });
    api.graph.getProjectGraph
      .mockResolvedValueOnce({ success: true, nodes: [node], edges: [edge] })
      .mockResolvedValueOnce({ success: true, nodes: [], edges: [] });

    await expect(graph.syncAndLoadGraph('p', 2)).resolves.toEqual({
      nodes: [node],
      edges: [edge],
      error: null,
      hasSyncedData: true,
    });
    expect(api.graph.syncProject).toHaveBeenCalledWith('p');
    await expect(graph.syncAndLoadGraph('p', 2)).resolves.toEqual({
      error: null,
      hasSyncedData: true,
    });
  });

  it('reports a failed sync', async () => {
    api.graph.syncProject.mockRejectedValue(new Error('ipc'));
    await expect(graph.syncAndLoadGraph('p', 2)).resolves.toEqual({
      error: PROJECT_ERRORS.GRAPH_RELOAD_FAILURE,
      hasSyncedData: false,
    });
  });

  it('reloads with a new filter', async () => {
    api.graph.getProjectGraph
      .mockResolvedValueOnce({ success: true, nodes: [node], edges: [edge] })
      .mockResolvedValueOnce({ success: false })
      .mockRejectedValueOnce(new Error('ipc'));

    await expect(graph.loadGraphWithFilter('p', 3)).resolves.toEqual({
      nodes: [node],
      edges: [edge],
      error: null,
    });
    await expect(graph.loadGraphWithFilter('p', 3)).resolves.toEqual({ error: null });
    await expect(graph.loadGraphWithFilter('p', 3)).resolves.toEqual({
      error: PROJECT_ERRORS.GRAPH_RELOAD_FAILURE,
    });
  });

  it('fetches node detail', async () => {
    api.graph.getNodeDetail
      .mockResolvedValueOnce({ success: true, connections: [], documents: [] })
      .mockResolvedValueOnce({ success: false, error: 'offline' })
      .mockResolvedValueOnce({ success: false });

    await expect(graph.fetchNodeDetail('p', 'n', 't')).resolves.toEqual({
      connections: [],
      documents: [],
      error: null,
    });
    await expect(graph.fetchNodeDetail('p', 'n', 't')).resolves.toEqual({ error: 'offline' });
    await expect(graph.fetchNodeDetail('p', 'n', 't')).resolves.toEqual({
      error: PROJECT_ERRORS.FAILED_TO_LOAD_NODE_DETAIL,
    });
  });
});

describe('search handler', () => {
  it('returns the answer and citations', async () => {
    api.search.query
      .mockResolvedValueOnce({
        success: true,
        answer: 'A',
        citations: [{ documentName: 'a', excerpt: 'x', score: 1 }],
      })
      .mockResolvedValueOnce({ success: true, answer: 'B' })
      .mockResolvedValueOnce({ success: true, answer: '' })
      .mockResolvedValueOnce({ success: false, error: 'offline' })
      .mockRejectedValueOnce(new Error('ipc'));

    await expect(search.searchDocuments('p', 'q')).resolves.toEqual({
      answer: 'A',
      citations: [{ documentName: 'a', excerpt: 'x', score: 1 }],
      error: null,
    });
    await expect(search.searchDocuments('p', 'q')).resolves.toEqual({
      answer: 'B',
      citations: [],
      error: null,
    });
    await expect(search.searchDocuments('p', 'q')).resolves.toEqual({
      error: PROJECT_ERRORS.SEARCH_FAILURE,
    });
    await expect(search.searchDocuments('p', 'q')).resolves.toEqual({ error: 'offline' });
    await expect(search.searchDocuments('p', 'q')).resolves.toEqual({
      error: PROJECT_ERRORS.UNEXPECTED_ERROR,
    });
  });
});

describe('share handlers', () => {
  const member = { userSub: 's', username: 'bob', role: 'VIEW' as const };

  it('loads members', async () => {
    api.projects.listMembers
      .mockResolvedValueOnce({ success: true, members: [member] })
      .mockResolvedValueOnce({ success: false, error: 'denied' })
      .mockResolvedValueOnce({ success: true });

    await expect(share.loadMembers('p')).resolves.toEqual({ members: [member], error: null });
    await expect(share.loadMembers('p')).resolves.toEqual({ error: 'denied' });
    await expect(share.loadMembers('p')).resolves.toEqual({
      error: PROJECT_ERRORS.SHARE_MEMEBER_RETREIVAL_FAILURE,
    });
  });

  it('shares, unshares and changes roles', async () => {
    api.projects.share
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });
    api.projects.unshare
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'owner' })
      .mockResolvedValueOnce({ success: false });
    api.projects.updateRole
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });

    await expect(share.shareUser('p', 'bob', 'VIEW')).resolves.toEqual({ error: null });
    await expect(share.shareUser('p', 'bob', 'VIEW')).resolves.toEqual({
      error: PROJECT_ERRORS.PROJECT_SHARE_FAILURE,
    });
    await expect(share.unshareUser('p', 's')).resolves.toEqual({ error: null });
    await expect(share.unshareUser('p', 's')).resolves.toEqual({ error: 'owner' });
    await expect(share.unshareUser('p', 's')).resolves.toEqual({
      error: PROJECT_ERRORS.PROJECT_UNSHARE_FAILURE,
    });
    await expect(share.updateMemberRole('p', 's', 'EDIT')).resolves.toEqual({ error: null });
    await expect(share.updateMemberRole('p', 's', 'EDIT')).resolves.toEqual({
      error: PROJECT_ERRORS.MEMBER_ROLE_UPDATE_FAILURE,
    });
  });

  it('searches users', async () => {
    api.projects.searchUsers
      .mockResolvedValueOnce({ success: true, usernames: ['bob'] })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });

    await expect(share.searchUsers('b')).resolves.toEqual(['bob']);
    await expect(share.searchUsers('b')).resolves.toEqual([]);
    await expect(share.searchUsers('b')).resolves.toEqual([]);
  });
});
