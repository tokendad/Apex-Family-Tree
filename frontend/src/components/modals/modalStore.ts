import { create } from 'zustand';
import type { ModalConfig, ModalResult } from './modalTypes';

interface ModalState {
  stack: ModalConfig[];
  push: (config: Omit<ModalConfig, 'id'>) => string;
  pop: (id: string, result: ModalResult<unknown>) => void;
}

export const useModalStore = create<ModalState>((set, get) => ({
  stack: [],

  push: (config) => {
    const id = crypto.randomUUID();
    set((s) => ({ stack: [...s.stack, { ...config, id }] }));
    return id;
  },

  pop: (id, result) => {
    const entry = get().stack.find((m) => m.id === id);
    entry?.resolve(result);
    set((s) => ({ stack: s.stack.filter((m) => m.id !== id) }));
  },
}));
