// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocuments } from '../../renderer/hooks/project/useDocuments';
import { useDocumentText } from '../../renderer/hooks/project/useDocumentText';
import { useGraph } from '../../renderer/hooks/project/useGraph';
import { useNodeDetail } from '../../renderer/hooks/project/useNodeDetail';
import { useProjectInit } from '../../renderer/hooks/project/useProjectInit';
import { useSearch } from '../../renderer/hooks/project/useSearch';
import { useShareProject } from '../../renderer/hooks/project/useShareProject';
import { PROJECT_ERRORS } from '../../constants/renderer/project/errors';
import { makeDoc } from '../helpers';
import { emit, installElectronApi, listenerCount } from './electron-api';

let api: ReturnType<typeof installElectronApi>;
const node = { data: { id: 'Jane:Person', label: 'Jane', type: 'Person', docCount: 2 } };

beforeEach(() => {
  api = installElectronApi();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDocuments', () => {
  const file = { name: 'a.pdf', path: '/a.pdf', size: 1 };

  beforeEach(() => {
    api.documents.list.mockResolvedValue({
      success: true,
      documents: [makeDoc({ documentId: 'a' }), makeDoc({ documentId: 'b' })],
    });
  });

  async function renderDocuments(projectId = 'proj-1') {
    const hook = renderHook(() => useDocuments(projectId));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  }

  it('does nothing without a project', () => {
    const { result } = renderHook(() => useDocuments(''));
    expect(api.documents.list).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    expect(listenerCount('document:status')).toBe(0);
  });

  it('loads documents and treats a failed load as empty', async () => {
    const { result } = await renderDocuments();
    expect(result.current.documents.map((d) => d.documentId)).toEqual(['a', 'b']);

    api.documents.list.mockResolvedValue({ success: false });
    await act(() => result.current.reload());
    expect(result.current.documents).toEqual([]);
  });

  it('applies pushed status updates and removals for this project only', async () => {
    const { result, unmount } = await renderDocuments();

    act(() => {
      emit('document:status', { projectId: 'proj-1', documentId: 'a', status: 'PROCESSING' });
      emit('document:status', { projectId: 'other', documentId: 'b', status: 'FAILED' });
      emit('document:removed', { projectId: 'other', documentId: 'a' });
      emit('document:removed', { projectId: 'proj-1', documentId: 'b' });
    });

    expect(result.current.documents).toEqual([
      expect.objectContaining({ documentId: 'a', processingStatus: 'PROCESSING' }),
    ]);

    unmount();
    expect(listenerCount('document:status')).toBe(0);
    expect(listenerCount('document:added')).toBe(0);
    expect(listenerCount('document:removed')).toBe(0);
  });

  it('reloads when another device adds a document to this project', async () => {
    await renderDocuments();

    act(() => emit('document:added', makeDoc({ projectId: 'other' })));
    expect(api.documents.list).toHaveBeenCalledTimes(1);

    act(() => emit('document:added', makeDoc()));
    await waitFor(() => expect(api.documents.list).toHaveBeenCalledTimes(2));
  });

  it('uploads files and reports full and partial failures', async () => {
    const { result } = await renderDocuments();

    await act(() => result.current.upload([]));
    expect(api.documents.upload).not.toHaveBeenCalled();

    api.documents.upload.mockResolvedValueOnce({ success: true, failed: [] });
    await act(() => result.current.upload([file, file]));
    expect(result.current.uploadError).toBeNull();
    expect(result.current.uploadStatus).toBeNull();

    api.documents.upload.mockResolvedValueOnce({
      success: true,
      failed: [{ name: 'x.exe', error: 'Unsupported' }],
    });
    await act(() => result.current.upload([file]));
    expect(result.current.uploadError).toBe('Could not upload x.exe: Unsupported');

    api.documents.upload.mockResolvedValueOnce({ success: false, error: 'Not authorized' });
    await act(() => result.current.upload([file]));
    expect(result.current.uploadError).toBe('Not authorized');

    act(() => result.current.clearUploadError());
    expect(result.current.uploadError).toBeNull();
  });

  it('shows upload progress while uploading', async () => {
    const { result } = await renderDocuments();
    let finish!: (v: { success: boolean }) => void;
    api.documents.upload.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.upload([file]);
    });
    expect(result.current.uploadStatus).toBe('Uploading 1 file…');

    await act(async () => {
      finish({ success: true });
      await pending;
    });
    expect(result.current.uploadStatus).toBeNull();
  });

  it('removes and retries documents', async () => {
    const { result } = await renderDocuments();
    api.documents.delete
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'denied' });
    api.documents.retryGraph
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'busy' });

    await act(async () => expect(await result.current.remove('a')).toBe(true));
    expect(result.current.documents.map((d) => d.documentId)).toEqual(['b']);
    await act(async () => expect(await result.current.remove('b')).toBe(false));
    expect(result.current.uploadError).toBe('denied');

    await act(async () => expect(await result.current.retry('b')).toBe(true));
    await act(async () => expect(await result.current.retry('b')).toBe(false));
    expect(result.current.uploadError).toBe('busy');
  });
});

describe('useDocumentText', () => {
  it('opens a document’s full text', async () => {
    api.documents.getText
      .mockResolvedValueOnce({ success: true, text: 'Full text' })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: false, error: 'gone' });
    const { result } = renderHook(() => useDocumentText('p'));

    await act(() => result.current.open('d', 'a.pdf'));
    expect(result.current).toMatchObject({
      isOpen: true,
      documentName: 'a.pdf',
      text: 'Full text',
      loading: false,
    });

    await act(() => result.current.open('d', 'a.pdf'));
    expect(result.current.error).toBe(PROJECT_ERRORS.FULL_TEXT_UNAVIALABLE);
    await act(() => result.current.open('d', 'a.pdf'));
    expect(result.current.error).toBe('gone');

    act(() => result.current.close());
    expect(result.current).toMatchObject({ isOpen: false, error: null });
  });
});

describe('useNodeDetail', () => {
  it('opens an entity’s connections and documents', async () => {
    api.graph.getNodeDetail
      .mockResolvedValueOnce({
        success: true,
        connections: [{ otherName: 'Acme' }],
        documents: [{ documentId: 'd', documentName: 'a' }],
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'offline' });
    const { result } = renderHook(() => useNodeDetail('p'));

    await act(() => result.current.open('Jane', 'Person'));
    expect(result.current).toMatchObject({
      isOpen: true,
      entityName: 'Jane',
      entityType: 'Person',
      loading: false,
    });
    expect(result.current.documents).toEqual([{ documentId: 'd', documentName: 'a' }]);

    await act(() => result.current.open('Jane', 'Person'));
    expect(result.current.connections).toEqual([]);

    await act(() => result.current.open('Jane', 'Person'));
    expect(result.current.error).toBe('offline');

    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });
});

describe('useSearch', () => {
  it('searches the project with the trimmed query', async () => {
    api.search.query
      .mockResolvedValueOnce({
        success: true,
        answer: 'Answer',
        citations: [{ documentName: 'a', excerpt: 'x', score: 1 }],
      })
      .mockResolvedValueOnce({ success: false, error: 'offline' });
    const { result } = renderHook(() => useSearch('p'));

    await act(() => result.current.search());
    expect(api.search.query).not.toHaveBeenCalled();

    act(() => result.current.setQuery('  who?  '));
    await act(() => result.current.search());
    expect(api.search.query).toHaveBeenCalledWith('p', 'who?');
    expect(result.current.answer).toBe('Answer');
    expect(result.current.citations).toHaveLength(1);

    await act(() => result.current.search());
    expect(result.current.error).toBe('offline');
    expect(result.current.answer).toBe('Answer');
  });

  it('needs a project', async () => {
    const { result } = renderHook(() => useSearch(''));
    act(() => result.current.setQuery('q'));
    await act(() => result.current.search());
    expect(api.search.query).not.toHaveBeenCalled();
  });
});

describe('useProjectInit', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('reads the project from the URL and loads role and settings', async () => {
    window.history.replaceState(null, '', '/?id=p1&name=Acme');
    api.projects.getRole.mockResolvedValue({ success: true, role: 'EDIT' });
    api.projects.getSettings.mockResolvedValue({ success: true, minDocFilter: 4 });

    const { result } = renderHook(() => useProjectInit());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      projectId: 'p1',
      projectName: 'Acme',
      role: 'EDIT',
      minDocFilter: 4,
      loading: false,
    });
    expect(document.title).toBe('Acme — Document Analysis');
  });

  it('falls back to view-only and the default filter', async () => {
    window.history.replaceState(null, '', '/?id=p1');
    api.projects.getRole.mockResolvedValue({ success: false });
    api.projects.getSettings.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useProjectInit());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ projectName: 'Project', role: 'VIEW', minDocFilter: 2 });
  });

  it('waits without a project id', () => {
    const { result } = renderHook(() => useProjectInit());
    expect(result.current.loading).toBe(true);
    expect(api.projects.getRole).not.toHaveBeenCalled();
  });
});

describe('useGraph', () => {
  beforeEach(() => {
    api.graph.syncProject.mockResolvedValue({ success: true });
    api.graph.getProjectGraph.mockResolvedValue({ success: true, nodes: [node], edges: [] });
  });

  async function renderGraph(projectId = 'p') {
    const hook = renderHook(() => useGraph(projectId, 3));
    await waitFor(() => expect(hook.result.current.hasSyncedData).toBe(true));
    return hook;
  }

  it('syncs and loads the graph on mount', async () => {
    const { result } = await renderGraph();
    expect(result.current.nodes).toEqual([node]);
    expect(result.current.minDocs).toBe(3);
    expect(api.graph.getProjectGraph).toHaveBeenCalledWith('p', 3);
  });

  it('does nothing without a project', () => {
    renderHook(() => useGraph('', 2));
    expect(api.graph.syncProject).not.toHaveBeenCalled();
  });

  it('reloads once Neo4j comes back after starting disconnected', async () => {
    await renderGraph();
    await waitFor(() => expect(api.connectivity.get).toHaveBeenCalled());

    act(() => emit('connectivity', { neo4j: 'disconnected', qdrant: 'connected' }));
    expect(api.graph.syncProject).toHaveBeenCalledTimes(1);

    act(() => emit('connectivity', { neo4j: 'connected', qdrant: 'connected' }));
    await waitFor(() => expect(api.graph.syncProject).toHaveBeenCalledTimes(2));

    // Still connected — no further reloads
    act(() => emit('connectivity', { neo4j: 'connected', qdrant: 'disconnected' }));
    expect(api.graph.syncProject).toHaveBeenCalledTimes(2);
  });

  it('does not reload when Neo4j was already connected', async () => {
    api.connectivity.get.mockResolvedValue({ neo4j: 'connected', qdrant: 'connected' });
    const { unmount } = await renderGraph();
    await waitFor(() => expect(api.connectivity.get).toHaveBeenCalled());

    act(() => emit('connectivity', { neo4j: 'connected', qdrant: 'connected' }));

    expect(api.graph.syncProject).toHaveBeenCalledTimes(1);
    unmount();
    expect(listenerCount('connectivity')).toBe(0);
  });

  it('debounces filter changes, clamping to 2 and saving the setting', async () => {
    const { result } = await renderGraph();
    vi.useFakeTimers();

    act(() => result.current.handleMinDocsChange(Number.NaN));
    expect(result.current.minDocs).toBe(2);
    act(() => result.current.handleMinDocsChange(1));
    act(() => result.current.handleMinDocsChange(5));
    expect(result.current.minDocs).toBe(5);

    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(api.projects.setMinDocFilter).toHaveBeenCalledTimes(1);
    expect(api.projects.setMinDocFilter).toHaveBeenCalledWith('p', 5);
    expect(api.graph.getProjectGraph).toHaveBeenLastCalledWith('p', 5);
  });

  it('skips the filtered reload before any data has synced', async () => {
    api.graph.syncProject.mockRejectedValue(new Error('ipc'));
    const { result } = renderHook(() => useGraph('p', 2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    api.graph.getProjectGraph.mockClear();
    vi.useFakeTimers();

    act(() => result.current.handleMinDocsChange(4));
    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(api.graph.getProjectGraph).not.toHaveBeenCalledWith('p', 4);
    expect(result.current.nodes).toEqual([]);
  });

  it('toggles hidden entity types and view options', async () => {
    const { result } = await renderGraph();

    act(() => result.current.toggleHiddenType('Person'));
    expect([...result.current.hiddenTypes]).toEqual(['Person']);
    act(() => result.current.toggleHiddenType('Person'));
    expect(result.current.hiddenTypes.size).toBe(0);

    act(() => {
      result.current.setLayout('Hierarchy');
      result.current.setIsExpanded(true);
    });
    expect(result.current.layout).toBe('Hierarchy');
    expect(result.current.isExpanded).toBe(true);
  });
});

describe('useShareProject', () => {
  const member = { userSub: 'bob-sub', username: 'bob', role: 'VIEW' as const };

  beforeEach(() => {
    api.projects.listMembers.mockResolvedValue({ success: true, members: [member] });
  });

  async function openShare() {
    const hook = renderHook(() => useShareProject('p', 'OWNER'));
    act(() => hook.result.current.open());
    await waitFor(() => expect(hook.result.current.membersLoading).toBe(false));
    return hook;
  }

  it('opens with the member list', async () => {
    const { result } = await openShare();
    expect(result.current).toMatchObject({
      isOpen: true,
      members: [member],
      role: 'OWNER',
      shareRole: 'VIEW',
    });

    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it('treats a failed member load as empty', async () => {
    api.projects.listMembers.mockResolvedValue({ success: false });
    const { result } = await openShare();
    expect(result.current.members).toEqual([]);
  });

  it('shares with the entered user and refreshes members', async () => {
    api.projects.share
      .mockResolvedValueOnce({ success: false, error: 'not found' })
      .mockResolvedValueOnce({ success: true });
    const { result } = await openShare();

    await act(() => result.current.share());
    expect(result.current.error).toBe(PROJECT_ERRORS.MISSING_SHARE_USERNAME);

    act(() => {
      result.current.handleUsernameInput(' carol ');
      result.current.setShareRole('EDIT');
    });
    await act(() => result.current.share());
    expect(result.current.error).toBe('not found');

    await act(() => result.current.share());
    expect(api.projects.share).toHaveBeenLastCalledWith('p', 'carol', 'EDIT');
    expect(result.current.shareUsername).toBe('');
    await waitFor(() => expect(api.projects.listMembers).toHaveBeenCalledTimes(2));
  });

  it('removes members and changes their role', async () => {
    api.projects.unshare
      .mockResolvedValueOnce({ success: false, error: 'owner' })
      .mockResolvedValueOnce({ success: true });
    api.projects.updateRole
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'denied' });
    const { result } = await openShare();

    await act(async () => expect(await result.current.updateRole('bob-sub', 'EDIT')).toBe(true));
    expect(result.current.members[0]!.role).toBe('EDIT');
    await act(async () => expect(await result.current.updateRole('bob-sub', 'VIEW')).toBe(false));
    expect(result.current.error).toBe('denied');

    await act(() => result.current.removeMember('bob-sub'));
    expect(result.current.error).toBe('owner');
    expect(result.current.members).toHaveLength(1);
    await act(() => result.current.removeMember('bob-sub'));
    expect(result.current.members).toEqual([]);
  });

  it('debounces username suggestions', async () => {
    api.projects.searchUsers.mockResolvedValue({ success: true, usernames: ['bobby'] });
    const { result } = await openShare();
    vi.useFakeTimers();

    act(() => result.current.handleUsernameInput('b'));
    act(() => result.current.handleUsernameInput('bo'));
    await act(() => vi.advanceTimersByTimeAsync(250));

    expect(api.projects.searchUsers).toHaveBeenCalledTimes(1);
    expect(api.projects.searchUsers).toHaveBeenCalledWith('bo');
    expect(result.current.suggestions).toEqual(['bobby']);

    act(() => result.current.handleUsernameInput('  '));
    expect(result.current.suggestions).toEqual([]);
    act(() => result.current.setSuggestions(['x']));
    expect(result.current.suggestions).toEqual(['x']);
  });
});
