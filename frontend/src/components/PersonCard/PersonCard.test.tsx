import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PersonCard from './PersonCard';
import type { TreeNode } from '@/stores/canvasStore';
import { CARD_WIDTH, CARD_HEIGHT } from '@/constants/card';

// Mock canvasStore
vi.mock('@/stores/canvasStore', () => ({
  useCanvasStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      selectedPersonId: null,
      hoveredPersonId: null,
      highlightedPersonIds: new Set<string>(),
      setSelectedPerson: vi.fn(),
      setHoveredPerson: vi.fn(),
      setContextMenu: vi.fn(),
    };
    if (selector) return selector(state);
    return state;
  }),
}));

// Mock entityDisplay
vi.mock('@/utils/entityDisplay', () => ({
  getPersonDisplayName: (person: { given_name: string | null; surname: string | null }) =>
    [person.given_name, person.surname].filter(Boolean).join(' ') || 'Unknown',
}));

function makeNode(overrides: Partial<TreeNode['person']> = {}): TreeNode {
  return {
    x: 0,
    y: 0,
    generation: 0,
    person: {
      id: 'p1',
      given_name: 'Alice',
      surname: 'Smith',
      sex: 'F',
      birth_date: '1980-01-01',
      death_date: null,
      is_living: true,
      is_private: false,
      photo_url: null,
      ...overrides,
    },
  };
}

describe('PersonCard', () => {
  it('renders name visible', () => {
    render(<PersonCard node={makeNode()} />);
    expect(screen.getByText('Alice Smith')).toBeDefined();
  });

  it('renders initials avatar when no photo', () => {
    render(<PersonCard node={makeNode()} />);
    // Initials: A + S
    expect(screen.getByText('AS')).toBeDefined();
  });

  it('renders photo img when photo_url is set', () => {
    render(<PersonCard node={makeNode({ photo_url: 'http://example.com/photo.jpg' })} />);
    const img = document.querySelector('img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain('photo.jpg');
  });

  it('foreignObject has correct dimensions from shared constants', () => {
    render(<PersonCard node={makeNode()} />);
    const fo = document.querySelector('foreignObject');
    expect(fo).not.toBeNull();
    expect(fo!.getAttribute('width')).toBe(String(CARD_WIDTH));
    expect(fo!.getAttribute('height')).toBe(String(CARD_HEIGHT));
  });

  it('shows birth year for living person', () => {
    render(<PersonCard node={makeNode()} />);
    expect(screen.getByText('b. 1980')).toBeDefined();
  });

  it('shows HOME badge when isHome=true', () => {
    render(<PersonCard node={makeNode()} isHome />);
    expect(screen.getByText('HOME')).toBeDefined();
  });

  it('exported constants match expected values', () => {
    expect(CARD_WIDTH).toBe(220);
    expect(CARD_HEIGHT).toBe(80);
  });
});
