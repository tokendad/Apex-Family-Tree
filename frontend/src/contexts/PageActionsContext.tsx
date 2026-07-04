import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ContextActionItem } from '@/components/archive-object/ContextActionsMenu';

interface PageActionsValue {
  title: string;
  actions: ContextActionItem[];
}

interface PageActionsApi extends PageActionsValue {
  setPageActions: (value: PageActionsValue) => void;
  clearPageActions: () => void;
}

const PageActionsContext = createContext<PageActionsApi | null>(null);

export const PageActionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [value, setValue] = useState<PageActionsValue>({ title: '', actions: [] });
  const api = useMemo<PageActionsApi>(
    () => ({
      ...value,
      setPageActions: setValue,
      clearPageActions: () => setValue({ title: '', actions: [] }),
    }),
    [value],
  );
  return <PageActionsContext.Provider value={api}>{children}</PageActionsContext.Provider>;
};

export function usePageActionsValue(): PageActionsValue {
  const ctx = useContext(PageActionsContext);
  return ctx ?? { title: '', actions: [] };
}

/** Register this page's context actions in the global topbar Actions menu. */
export function usePageActions(title: string, actions: ContextActionItem[]): void {
  const ctx = useContext(PageActionsContext);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const setPageActions = ctx?.setPageActions;
  const clearPageActions = ctx?.clearPageActions;
  // Re-register only when the visible shape changes; handlers stay fresh via the ref.
  const shape = actions
    .map((a) => `${a.id}:${a.label}:${a.group ?? 'create'}:${a.disabled ? 1 : 0}`)
    .join('|');
  useEffect(() => {
    if (!setPageActions || !clearPageActions) return;
    setPageActions({ title, actions: actionsRef.current });
    return () => clearPageActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, shape]);
}
