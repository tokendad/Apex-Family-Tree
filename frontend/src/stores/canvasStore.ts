import { create } from 'zustand';

export interface TreePerson {
  id: string;
  given_name: string | null;
  surname: string | null;
  sex: 'M' | 'F' | 'X' | 'U';
  birth_date: string | null;
  death_date: string | null;
  is_living: boolean;
  is_private: boolean;
  photo_url: string | null;
}

export interface TreeFamily {
  id: string;
  spouse1_id: string | null;
  spouse2_id: string | null;
  children_ids: string[];
  marriage_date: string | null;
}

export interface TreeNode {
  person: TreePerson;
  x: number;
  y: number;
  generation: number;
}

export interface ConnectorLine {
  id: string;
  type: 'parent-child' | 'spouse' | 'sibling';
  from: { x: number; y: number };
  to: { x: number; y: number };
  midPoint?: { x: number; y: number };
}

interface CanvasState {
  // Data
  nodes: TreeNode[];
  families: TreeFamily[];
  connectors: ConnectorLine[];

  // View state
  zoom: number;
  panX: number;
  panY: number;
  selectedPersonId: string | null;
  hoveredPersonId: string | null;
  contextMenuPosition: { x: number; y: number; personId: string } | null;
  isLoading: boolean;
  generations: number;

  // Actions
  setNodes: (nodes: TreeNode[]) => void;
  setFamilies: (families: TreeFamily[]) => void;
  setConnectors: (connectors: ConnectorLine[]) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setSelectedPerson: (id: string | null) => void;
  setHoveredPerson: (id: string | null) => void;
  setContextMenu: (pos: { x: number; y: number; personId: string } | null) => void;
  setLoading: (loading: boolean) => void;
  setGenerations: (gen: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  nodes: [],
  families: [],
  connectors: [],
  zoom: 1,
  panX: 0,
  panY: 0,
  selectedPersonId: null,
  hoveredPersonId: null,
  contextMenuPosition: null,
  isLoading: false,
  generations: 4,

  setNodes: (nodes) => set({ nodes }),
  setFamilies: (families) => set({ families }),
  setConnectors: (connectors) => set({ connectors }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(2, zoom)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  setSelectedPerson: (selectedPersonId) => set({ selectedPersonId, contextMenuPosition: null }),
  setHoveredPerson: (hoveredPersonId) => set({ hoveredPersonId }),
  setContextMenu: (contextMenuPosition) => set({ contextMenuPosition }),
  setLoading: (isLoading) => set({ isLoading }),
  setGenerations: (generations) => set({ generations }),
  zoomIn: () => set((s) => ({ zoom: Math.min(2, s.zoom + 0.1) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(0.5, s.zoom - 0.1) })),
  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),
}));
