import { create } from 'zustand';
import type { ModalConfig, ModalResult } from './modalTypes';

interface ModalState {
  stack: ModalConfig[];
  push: (config: Omit<ModalConfig, 'id'>) => string;
  pop: (id: string, result: ModalResult<unknown>) => void;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure HTTP contexts where randomUUID is unavailable
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export const useModalStore = create<ModalState>((set, get) => ({
  stack: [],

  push: (config) => {
    const id = generateId();
    set((s) => ({ stack: [...s.stack, { ...config, id }] }));
    return id;
  },

  pop: (id, result) => {
    const entry = get().stack.find((m) => m.id === id);
    entry?.resolve(result);
    set((s) => ({ stack: s.stack.filter((m) => m.id !== id) }));
  },
}));
