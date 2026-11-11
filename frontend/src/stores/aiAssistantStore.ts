import { create } from 'zustand';

interface AiAssistantState {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

/** Not persisted -- the panel starts closed each session, same as it
 *  started before anyone opened it the first time. */
export const useAiAssistantStore = create<AiAssistantState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));
