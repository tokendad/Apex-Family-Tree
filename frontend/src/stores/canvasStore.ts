import { create } from 'zustand';

export interface TreePerson {
  id: string;
  displayName?: string | null;
  display_name?: string | null;
  given_name: string | null;
  middle_name?: string | null;
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

const CARD_WIDTH = 240;
const CARD_HEIGHT = 140;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;

interface CanvasState {
  // Data
  nodes: TreeNode[];
  families: TreeFamily[];
  connectors: ConnectorLine[];

  // View state — camera model
  zoom: number;
  cameraX: number;
  cameraY: number;
  homePersonId: string | null;
  selectedPersonId: string | null;
  hoveredPersonId: string | null;
  contextMenuPosition: { x: number; y: number; personId: string } | null;
  isLoading: boolean;
  generations: number;
  highlightedPersonIds: Set<string>;

  // Actions
  setNodes: (nodes: TreeNode[]) => void;
  setFamilies: (families: TreeFamily[]) => void;
  setConnectors: (connectors: ConnectorLine[]) => void;
  setZoom: (zoom: number) => void;
  setCamera: (x: number, y: number) => void;
  setHomePersonId: (id: string | null) => void;
  centerOnPerson: (personId: string) => void;
  fitToScreen: (viewportW: number, viewportH: number) => void;
  setSelectedPerson: (id: string | null) => void;
  setHoveredPerson: (id: string | null) => void;
  setContextMenu: (pos: { x: number; y: number; personId: string } | null) => void;
  setLoading: (loading: boolean) => void;
  setGenerations: (gen: number) => void;
  setHighlightedPersonIds: (ids: Set<string>) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  families: [],
  connectors: [],
  zoom: 1,
  cameraX: 0,
  cameraY: 0,
  homePersonId: null,
  selectedPersonId: null,
  hoveredPersonId: null,
  contextMenuPosition: null,
  isLoading: false,
  generations: 4,
  highlightedPersonIds: new Set<string>(),

  setNodes: (nodes) => set({ nodes }),
  setFamilies: (families) => set({ families }),
  setConnectors: (connectors) => set({ connectors }),
  setZoom: (zoom) => set({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),
  setCamera: (cameraX, cameraY) => set({ cameraX, cameraY }),
  setHomePersonId: (homePersonId) => set({ homePersonId }),

  centerOnPerson: (personId) => {
    const node = get().nodes.find((n) => n.person.id === personId);
    if (!node) return;
    set({
      cameraX: node.x + CARD_WIDTH / 2,
      cameraY: node.y + CARD_HEIGHT / 2,
      zoom: 1,
    });
  },

  fitToScreen: (viewportW, viewportH) => {
    const s = get();
    if (s.nodes.length === 0) return;
    const padding = 100;
    const xs = s.nodes.map((n) => n.x);
    const ys = s.nodes.map((n) => n.y);
    const minX = Math.min(...xs) - padding;
    const minY = Math.min(...ys) - padding;
    const maxX = Math.max(...xs) + CARD_WIDTH + padding;
    const maxY = Math.max(...ys) + CARD_HEIGHT + padding;
    const treeW = maxX - minX;
    const treeH = maxY - minY;
    const fitZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(viewportW / treeW, viewportH / treeH)));
    set({
      zoom: fitZoom,
      cameraX: (minX + maxX) / 2,
      cameraY: (minY + maxY) / 2,
    });
  },

  setSelectedPerson: (selectedPersonId) => set({ selectedPersonId, contextMenuPosition: null }),
  setHoveredPerson: (hoveredPersonId) => set({ hoveredPersonId }),
  setContextMenu: (contextMenuPosition) => set({ contextMenuPosition }),
  setLoading: (isLoading) => set({ isLoading }),
  setGenerations: (generations) => set({ generations }),
  setHighlightedPersonIds: (highlightedPersonIds) => set({ highlightedPersonIds }),
  zoomIn: () => set((s) => ({ zoom: Math.min(MAX_ZOOM, s.zoom * 1.2) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(MIN_ZOOM, s.zoom / 1.2) })),

  resetView: () => {
    const s = get();
    const homeNode = s.nodes.find((n) => n.person.id === s.homePersonId);
    if (homeNode) {
      set({ zoom: 1, cameraX: homeNode.x + CARD_WIDTH / 2, cameraY: homeNode.y + CARD_HEIGHT / 2 });
    } else {
      set({ zoom: 1, cameraX: 0, cameraY: 0 });
    }
  },
}));
