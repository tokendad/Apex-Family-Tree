import { useEffect, useState, useCallback } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { layoutTree } from '@/utils/treeLayout';
import type { TreePerson, TreeFamily } from '@/stores/canvasStore';

interface UseTreeDataOptions {
  rootPersonId?: string | null;
}

interface TreeApiResponse {
  persons: TreePerson[];
  families: TreeFamily[];
  home_person_id: string | null;
}

export function useTreeData(options: UseTreeDataOptions = {}) {
  const {
    generations,
    setNodes,
    setFamilies,
    setConnectors,
    setLoading,
  } = useCanvasStore();

  const [error, setError] = useState<string | null>(null);
  const [rootId, setRootId] = useState<string | null>(options.rootPersonId ?? null);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const endpoint = rootId
        ? `/api/v1/tree/${rootId}?generations=${generations}`
        : `/api/v1/tree?generations=${generations}`;

      const res = await fetch(endpoint, { credentials: 'include' });

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
      setFamilies(data.families);

      const effectiveRoot = rootId ?? data.home_person_id;
      if (!effectiveRoot) {
        setRootId(data.persons[0]?.id ?? null);
      } else {
        setRootId(effectiveRoot);
      }

      const { nodes, connectors } = layoutTree({
        persons: data.persons,
        families: data.families,
        rootPersonId: effectiveRoot ?? data.persons[0]?.id ?? null,
      });

      setNodes(nodes);
      setConnectors(connectors);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      // On error, show empty state rather than stale data
      setNodes([]);
      setFamilies([]);
      setConnectors([]);
    } finally {
      setLoading(false);
    }
  }, [rootId, generations, setNodes, setFamilies, setConnectors, setLoading]);

  useEffect(() => {
    void fetchTree();
  }, [fetchTree]);

  return { error, refetch: fetchTree, rootId, setRootId };
}
