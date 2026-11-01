import { useEffect, useState, useCallback, useRef } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { layoutTree } from '@/utils/treeLayout';
import type { TreePerson, TreeFamily } from '@/stores/canvasStore';

interface TreeApiResponse {
  persons: TreePerson[];
  families: TreeFamily[];
  home_person_id: string | null;
}

export function useTreeData() {
  const {
    generations,
    treeRootId,
    setNodes,
    setFamilies,
    setConnectors,
    setLoading,
  } = useCanvasStore();

  const [error, setError] = useState<string | null>(null);

  /**
   * Re-rooting fires a new request on every selection, and a wide tree takes
   * longer to build than a narrow one -- so an earlier, slower response can
   * land after a later one and paint the tree the user has already navigated
   * away from. Only the newest request is allowed to write.
   */
  const requestRef = useRef(0);

  const fetchTree = useCallback(async () => {
    const requestId = ++requestRef.current;
    const isCurrent = () => requestRef.current === requestId;

    setLoading(true);
    setError(null);

    try {
      // No root means "wherever home is"; the server resolves it and tells us
      // who that was. A rooted request is the same tree walked from someone
      // else, which is how a person far from home gets a full neighbourhood
      // instead of the thin edge of the walk from home.
      const endpoint = treeRootId
        ? `/api/v1/tree/${treeRootId}?generations=${generations}`
        : `/api/v1/tree?generations=${generations}`;

      const res = await fetch(endpoint, { credentials: 'include' });
      if (!isCurrent()) return;

      if (!res.ok) {
        if (res.status === 404) {
          // No tree data yet — show empty state
          setNodes([]);
          setFamilies([]);
          setConnectors([]);
          return;
        }
        throw new Error(`Failed to fetch tree data: ${res.statusText}`);
      }

      const data: TreeApiResponse = await res.json();
      if (!isCurrent()) return;

      setFamilies(data.families);

      const store = useCanvasStore.getState();

      /* Which cards carry an unsettled-claim mark (#52). Its own request,
         because the tree walk is about descent and knows nothing about claims.
         Failing is not fatal: the tree draws and the marks are simply absent,
         which is the honest outcome when we cannot tell. */
      fetch('/api/v1/claims/unsettled-subjects', { credentials: 'include' })
        .then(response => (response.ok ? response.json() : null))
        .then((json: { data: string[] } | null) => {
          if (!isCurrent() || !json) return;
          store.setUnsettledPersonIds(new Set(json.data ?? []));
        })
        .catch(() => { /* marks stay absent */ });

      /* Only an unrooted response carries the real home person. GET
         /tree/:personId echoes the id it was given back as home_person_id, so
         trusting it on a rooted request would quietly reassign home to
         whoever was last clicked -- and the house button would then return
         to that person instead of the one the user chose. */
      if (!treeRootId && data.home_person_id) {
        store.setHomePersonId(data.home_person_id);
      }

      const effectiveRoot = treeRootId ?? data.home_person_id ?? data.persons[0]?.id ?? null;

      const { nodes, connectors } = layoutTree({
        persons: data.persons,
        families: data.families,
        rootPersonId: effectiveRoot,
      });

      setNodes(nodes);
      setConnectors(connectors);

      if (effectiveRoot) store.centerOnPerson(effectiveRoot);
    } catch (err) {
      if (!isCurrent()) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      // On error, show empty state rather than stale data
      setNodes([]);
      setFamilies([]);
      setConnectors([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [treeRootId, generations, setNodes, setFamilies, setConnectors, setLoading]);

  useEffect(() => {
    void fetchTree();
  }, [fetchTree]);

  return { error, refetch: fetchTree, rootId: treeRootId };
}
