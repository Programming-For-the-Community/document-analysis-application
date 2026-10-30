// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectivity } from '../../renderer/hooks/useConnectivity';
import { useTheme } from '../../renderer/hooks/useTheme';
import { useUpdate } from '../../renderer/hooks/useUpdate';
import { useUser } from '../../renderer/hooks/useUser';
import { useSignIn } from '../../renderer/hooks/login/useSignIn';
import { useSignUp } from '../../renderer/hooks/login/useSignUp';
import { useDeleteProject } from '../../renderer/hooks/home/useDeleteProject';
import { useNewProject } from '../../renderer/hooks/home/useNewProject';
import { useProjects } from '../../renderer/hooks/home/useProjects';
import { useRenameProject } from '../../renderer/hooks/home/useRenameProject';
import { HOME_ERRORS } from '../../constants/renderer/home';
import { LOGIN_ERRORS } from '../../constants/renderer/login';
import { makeIdToken } from '../helpers';
import { emit, installElectronApi, listenerCount } from './electron-api';

let api: ReturnType<typeof installElectronApi>;
const project = { id: 'p', name: 'P', documentCount: 0, lastModified: '', role: 'OWNER' as const };

beforeEach(() => {
  api = installElectronApi();
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
});

describe('useConnectivity', () => {
  it('loads the status and follows updates until unmounted', async () => {
    api.connectivity.get.mockResolvedValue({ neo4j: 'connected', qdrant: 'disconnected' });
    const { result, unmount } = renderHook(() => useConnectivity());

    await waitFor(() => expect(result.current.neo4j).toBe('connected'));
    act(() => emit('connectivity', { neo4j: 'connected', qdrant: 'connected' }));
    expect(result.current.qdrant).toBe('connected');

    unmount();
    expect(listenerCount('connectivity')).toBe(0);
  });
});

describe('useUpdate', () => {
  it('tracks update state and starts the install', async () => {
    api.updates.getStatus.mockResolvedValue({ status: 'available', version: '2.0.0' });
    const { result } = renderHook(() => useUpdate());

    await waitFor(() => expect(result.current.state.status).toBe('available'));
    act(() => emit('update', { status: 'downloading', version: '2.0.0', percent: 40 }));
    expect(result.current.state).toMatchObject({ percent: 40 });

    result.current.install();
    expect(api.updates.install).toHaveBeenCalled();
  });
});

describe('useTheme', () => {
  it('starts from the cached theme and applies it', () => {
    localStorage.setItem('doc-analysis-theme', 'parchment');
    api.preferences.getTheme.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('parchment');
    expect(document.documentElement.dataset['theme']).toBe('parchment');
  });

  it('adopts the server-side preference', async () => {
    api.preferences.getTheme.mockResolvedValue({ success: true, value: 'parchment' });
    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(result.current.theme).toBe('parchment'));
    expect(localStorage.getItem('doc-analysis-theme')).toBe('parchment');
  });

  it('keeps the cached theme when the server agrees or is unreachable', async () => {
    api.preferences.getTheme.mockResolvedValueOnce({ success: true, value: 'slate' });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(api.preferences.getTheme).toHaveBeenCalled());
    expect(result.current.theme).toBe('slate');
    expect(localStorage.getItem('doc-analysis-theme')).toBeNull();

    api.preferences.getTheme.mockRejectedValueOnce(new Error('ipc'));
    const second = renderHook(() => useTheme());
    await waitFor(() => expect(api.preferences.getTheme).toHaveBeenCalledTimes(2));
    expect(second.result.current.theme).toBe('slate');
  });

  it('toggles, caching and syncing the choice', async () => {
    api.preferences.getTheme.mockResolvedValue({ success: true, value: null });
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('parchment');
    expect(api.preferences.setTheme).toHaveBeenCalledWith('parchment');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('slate');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    expect(localStorage.getItem('doc-analysis-theme')).toBe('slate');
  });
});

describe('useUser', () => {
  it('shows the signed-in username', async () => {
    api.auth.getTokens.mockResolvedValue({ idToken: makeIdToken({ 'cognito:username': 'alice' }) });
    const { result } = renderHook(() => useUser());
    await waitFor(() => expect(result.current.username).toBe('alice'));
  });

  it('logs out when there is no session', async () => {
    api.auth.getTokens.mockResolvedValue(null);
    renderHook(() => useUser());
    await waitFor(() => expect(api.auth.logout).toHaveBeenCalled());
  });
});

describe('useSignIn', () => {
  it('validates before calling the main process', async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useSignIn(setError));

    await act(() => result.current.handleSignIn());

    expect(setError).toHaveBeenLastCalledWith(LOGIN_ERRORS.MISSING_CREDENTIALS);
    expect(api.auth.start).not.toHaveBeenCalled();
  });

  it('signs in, re-enabling the form on failure', async () => {
    api.auth.start
      .mockResolvedValueOnce({ success: false, error: 'Wrong password' })
      .mockResolvedValueOnce({ success: true });
    const setError = vi.fn();
    const { result } = renderHook(() => useSignIn(setError));
    act(() => {
      result.current.setUsername('alice');
      result.current.setPassword('pw');
    });

    await act(() => result.current.handleSignIn());
    expect(setError).toHaveBeenLastCalledWith('Wrong password');
    expect(result.current.signingIn).toBe(false);

    await act(() => result.current.handleSignIn());
    expect(result.current.signingIn).toBe(true);
    expect(api.auth.start).toHaveBeenLastCalledWith({ username: 'alice', password: 'pw' });
  });
});

describe('useSignUp', () => {
  it('validates before calling the main process', async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useSignUp(setError));
    act(() => {
      result.current.setNewUsername('bob');
      result.current.setNewPassword('password1');
      result.current.setConfirmPassword('password2');
    });

    await act(() => result.current.handleSignUp());

    expect(setError).toHaveBeenLastCalledWith(LOGIN_ERRORS.PASSWORDS_DO_NOT_MATCH);
    expect(api.auth.signup).not.toHaveBeenCalled();
  });

  it('creates the account, re-enabling the form on failure', async () => {
    api.auth.signup
      .mockResolvedValueOnce({ success: false, error: 'Taken' })
      .mockResolvedValueOnce({ success: true });
    const setError = vi.fn();
    const { result } = renderHook(() => useSignUp(setError));
    act(() => {
      result.current.setNewUsername('bob');
      result.current.setNewPassword('password1');
      result.current.setConfirmPassword('password1');
    });

    await act(() => result.current.handleSignUp());
    expect(setError).toHaveBeenLastCalledWith('Taken');
    expect(result.current.creatingAccount).toBe(false);

    await act(() => result.current.handleSignUp());
    expect(result.current.creatingAccount).toBe(true);
  });
});

describe('useProjects', () => {
  it('loads projects on mount and on reload', async () => {
    api.projects.list
      .mockResolvedValueOnce({ success: true, projects: [project] })
      .mockResolvedValueOnce({ success: false, error: 'offline' });
    const { result } = renderHook(() => useProjects());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects).toEqual([project]);

    await act(() => result.current.reload());
    expect(result.current.error).toBe('offline');
    expect(result.current.projects).toEqual([project]);
  });
});

describe('useNewProject', () => {
  it('requires a name', async () => {
    const { result } = renderHook(() => useNewProject());
    act(() => result.current.open());

    await act(() => result.current.submit('  '));

    expect(result.current.error).toBe(HOME_ERRORS.PROJECT_NAME_MISSING);
    expect(api.projects.create).not.toHaveBeenCalled();
  });

  it('creates the project and opens it', async () => {
    api.projects.create.mockResolvedValue({ success: true, project });
    const { result } = renderHook(() => useNewProject());
    act(() => result.current.open());

    await act(() => result.current.submit(' P '));

    expect(api.projects.create).toHaveBeenCalledWith('P');
    expect(result.current.isOpen).toBe(false);
    expect(api.nav.openProject).toHaveBeenCalledWith({ id: 'p', name: 'P' });
  });

  it('keeps the dialog open on failure', async () => {
    api.projects.create.mockResolvedValue({ success: false, error: 'exists' });
    const { result } = renderHook(() => useNewProject());
    act(() => result.current.open());

    await act(() => result.current.submit('P'));

    expect(result.current.error).toBe('exists');
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.close());
    expect(result.current.error).toBeNull();
  });
});

describe('useRenameProject', () => {
  it('renames the chosen project and reloads', async () => {
    api.projects.rename.mockResolvedValue({ success: true });
    const reload = vi.fn();
    const { result } = renderHook(() => useRenameProject(reload));

    await act(() => result.current.submit('ignored without a project'));
    expect(api.projects.rename).not.toHaveBeenCalled();

    act(() => result.current.open('p', 'Old'));
    expect(result.current.projectName).toBe('Old');
    await act(() => result.current.submit(' New '));

    expect(api.projects.rename).toHaveBeenCalledWith('p', 'New');
    expect(reload).toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });

  it('shows validation and server errors', async () => {
    api.projects.rename.mockResolvedValue({ success: false, error: 'exists' });
    const reload = vi.fn();
    const { result } = renderHook(() => useRenameProject(reload));
    act(() => result.current.open('p', 'Old'));

    await act(() => result.current.submit(''));
    expect(result.current.error).toBe(HOME_ERRORS.PROJECT_NAME_MISSING);

    await act(() => result.current.submit('Taken'));
    expect(result.current.error).toBe('exists');
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('useDeleteProject', () => {
  it('deletes the chosen project and reloads', async () => {
    api.projects.delete.mockResolvedValue({ success: true });
    const reload = vi.fn();
    const { result } = renderHook(() => useDeleteProject(reload));

    await act(() => result.current.confirm());
    expect(api.projects.delete).not.toHaveBeenCalled();

    act(() => result.current.open('p', 'P'));
    await act(() => result.current.confirm());

    expect(api.projects.delete).toHaveBeenCalledWith('p');
    expect(reload).toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });

  it('shows the error and stays open on failure', async () => {
    api.projects.delete.mockResolvedValue({ success: false, error: 'not owner' });
    const { result } = renderHook(() => useDeleteProject(vi.fn()));
    act(() => result.current.open('p', 'P'));

    await act(() => result.current.confirm());

    expect(result.current.error).toBe('not owner');
    expect(result.current.isOpen).toBe(true);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
