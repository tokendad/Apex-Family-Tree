import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTreeData } from './useTreeData';
import { useCanvasStore } from '@/stores/canvasStore';

const person = (id: string) => ({
  id, given_name: id, middle_name: null, surname: 'Test', sex: 'U' as const,
  birth_date: null, death_date: null, is_living: false, is_private: false, photo_url: null,
});

/** What the API returns. An unrooted call names the real home person. */
function respondWith(homePersonId: string | null, ids: string[] = ['home', 'other']) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ persons: ids.map(person), families: [], home_person_id: homePersonId }),
  });
}

const urlOf = (mock: ReturnType<typeof vi.fn>, call = 0) => String(mock.mock.calls[call][0]);

beforeEach(() => {
  useCanvasStore.setState({
    nodes: [], families: [], connectors: [],
    homePersonId: null, treeRootId: null, selectedPersonId: null,
    generations: 4, isLoading: false,
  });
});

describe('useTreeData — which tree it asks for', () => {
  it('asks for the home tree when no root is set, and records who home is', async () => {
    const fetchMock = respondWith('walter');
    global.fetch = fetchMock as unknown as typeof fetch;

    renderHook(() => useTreeData());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(urlOf(fetchMock)).toBe('/api/v1/tree?generations=4');
    await waitFor(() => expect(useCanvasStore.getState().homePersonId).toBe('walter'));
  });

  it('asks for the tree around the root once one is set', async () => {
    global.fetch = respondWith('walter') as unknown as typeof fetch;
    renderHook(() => useTreeData());
    await waitFor(() => expect(useCanvasStore.getState().homePersonId).toBe('walter'));

    const rooted = respondWith('george');
    global.fetch = rooted as unknown as typeof fetch;
    act(() => useCanvasStore.getState().setTreeRootId('george'));

    await waitFor(() => expect(rooted).toHaveBeenCalled());
    expect(urlOf(rooted)).toBe('/api/v1/tree/george?generations=4');
  });

  it('does not let a rooted request reassign the home person', async () => {
    global.fetch = respondWith('walter') as unknown as typeof fetch;
    renderHook(() => useTreeData());
    await waitFor(() => expect(useCanvasStore.getState().homePersonId).toBe('walter'));

    // GET /tree/:personId echoes the id it was given back as home_person_id.
    // Believing it would quietly move home to whoever was last clicked.
    global.fetch = respondWith('george', ['george', 'kin']) as unknown as typeof fetch;
    act(() => useCanvasStore.getState().setTreeRootId('george'));

    await waitFor(() => expect(useCanvasStore.getState().nodes.length).toBeGreaterThan(0));
    expect(useCanvasStore.getState().homePersonId).toBe('walter');
  });

  it('carries the depth through to the request', async () => {
    const fetchMock = respondWith('walter');
    global.fetch = fetchMock as unknown as typeof fetch;
    useCanvasStore.setState({ generations: 9 });

    renderHook(() => useTreeData());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(urlOf(fetchMock)).toBe('/api/v1/tree?generations=9');
  });

  it('ignores a slow earlier response that lands after a newer one', async () => {
    let releaseFirst: (value: unknown) => void = () => {};
    const slowFirst = new Promise((resolve) => { releaseFirst = resolve; });

    global.fetch = vi.fn()
      .mockImplementationOnce(async () => {
        await slowFirst;
        return { ok: true, json: async () => ({ persons: [person('stale')], families: [], home_person_id: 'walter' }) };
      })
      .mockImplementationOnce(async () => ({
        ok: true, json: async () => ({ persons: [person('fresh')], families: [], home_person_id: 'fresh' }),
      })) as unknown as typeof fetch;

    renderHook(() => useTreeData());
    act(() => useCanvasStore.getState().setTreeRootId('fresh'));

    await waitFor(() => expect(useCanvasStore.getState().nodes.some((n) => n.person.id === 'fresh')).toBe(true));

    // The first request now completes, far too late to be the answer.
    await act(async () => { releaseFirst(null); await Promise.resolve(); });

    expect(useCanvasStore.getState().nodes.some((n) => n.person.id === 'stale')).toBe(false);
    expect(useCanvasStore.getState().nodes.some((n) => n.person.id === 'fresh')).toBe(true);
  });
});
