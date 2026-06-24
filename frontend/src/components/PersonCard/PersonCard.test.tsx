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

// ─── formatDates logic ────────────────────────────────────────────────────────

describe('formatDates via PersonCard rendering', () => {
  it('both birth and death year known → "YYYY – YYYY"', () => {
    render(
      <PersonCard
        node={makeNode({ birth_date: '1942-03-15', death_date: '2009-11-20', is_living: false })}
      />,
    );
    expect(screen.getByText('1942 – 2009')).toBeDefined();
  });

  it('birth only, is_living = false → "b. YYYY"', () => {
    render(
      <PersonCard
        node={makeNode({ birth_date: '1955-06-01', death_date: null, is_living: false })}
      />,
    );
    expect(screen.getByText('b. 1955')).toBeDefined();
  });

  it('death only → "d. YYYY"', () => {
    render(
      <PersonCard
        node={makeNode({ birth_date: null, death_date: '2001-09-11', is_living: false })}
      />,
    );
    expect(screen.getByText('d. 2001')).toBeDefined();
  });

  it('is_living = true, birth year known → "b. YYYY –" (trailing en-dash)', () => {
    render(
      <PersonCard
        node={makeNode({ birth_date: '1985-04-22', death_date: null, is_living: true })}
      />,
    );
    expect(screen.getByText('b. 1985 –')).toBeDefined();
  });

  it('is_living = true, no birth year → date span hidden (visibility: hidden)', () => {
    render(
      <PersonCard
        node={makeNode({ birth_date: null, death_date: null, is_living: true })}
      />,
    );
    // The span must exist in the DOM but be visibility:hidden
    const datesSpan = document.querySelector('[style*="visibility: hidden"]');
    expect(datesSpan).not.toBeNull();
  });

  it('neither year available → date span hidden (visibility: hidden)', () => {
    render(
      <PersonCard
        node={makeNode({ birth_date: null, death_date: null, is_living: false })}
      />,
    );
    const datesSpan = document.querySelector('[style*="visibility: hidden"]');
    expect(datesSpan).not.toBeNull();
  });

  it('does NOT infer living from absence of death date — uses boolean field', () => {
    // is_living = false, no death date → "b. YYYY" (not "b. YYYY –")
    render(
      <PersonCard
        node={makeNode({ birth_date: '1960-01-01', death_date: null, is_living: false })}
      />,
    );
    expect(screen.getByText('b. 1960')).toBeDefined();
    expect(screen.queryByText('b. 1960 –')).toBeNull();
  });
});

// ─── Sex icon ─────────────────────────────────────────────────────────────────

describe('Sex icon', () => {
  it('renders ♂ for male (sex = M)', () => {
    render(<PersonCard node={makeNode({ sex: 'M' })} />);
    expect(screen.getByText('♂')).toBeDefined();
  });

  it('renders ♀ for female (sex = F)', () => {
    render(<PersonCard node={makeNode({ sex: 'F' })} />);
    expect(screen.getByText('♀')).toBeDefined();
  });

  it('does not render sex icon for sex = X', () => {
    render(<PersonCard node={makeNode({ sex: 'X' })} />);
    expect(screen.queryByText('♂')).toBeNull();
    expect(screen.queryByText('♀')).toBeNull();
  });

  it('does not render sex icon for sex = U', () => {
    render(<PersonCard node={makeNode({ sex: 'U' })} />);
    expect(screen.queryByText('♂')).toBeNull();
    expect(screen.queryByText('♀')).toBeNull();
  });

  it('sex icon is aria-hidden', () => {
    render(<PersonCard node={makeNode({ sex: 'M' })} />);
    const icon = screen.getByText('♂');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('sex icon renders even when isHome is true (no conflict after HOME moves to top-left)', () => {
    render(<PersonCard node={makeNode({ sex: 'F' })} isHome />);
    expect(screen.getByText('♀')).toBeDefined();
    expect(screen.getByText('HOME')).toBeDefined();
  });
});

// ─── HOME badge position ──────────────────────────────────────────────────────

describe('HOME badge', () => {
  it('shows HOME badge when isHome=true', () => {
    render(<PersonCard node={makeNode()} isHome />);
    expect(screen.getByText('HOME')).toBeDefined();
  });

  it('does not show HOME badge when isHome=false', () => {
    render(<PersonCard node={makeNode()} />);
    expect(screen.queryByText('HOME')).toBeNull();
  });

  it('HOME badge has top-left position via CSS class (not right)', () => {
    render(<PersonCard node={makeNode()} isHome />);
    const badge = screen.getByText('HOME');
    // The CSS module class should have left positioning; verify computed style
    // In jsdom, CSS modules are identity-mapped so we check the class name is applied
    expect(badge.className).toContain('homeBadge');
    // Also verify no inline right style was applied
    expect(badge.style.right).toBe('');
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

describe('Accessibility', () => {
  it('card container has role="button"', () => {
    render(<PersonCard node={makeNode()} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDefined();
  });

  it('card container has tabIndex=0', () => {
    render(<PersonCard node={makeNode()} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('tabindex')).toBe('0');
  });

  it('aria-label includes name and date when both known', () => {
    render(
      <PersonCard
        node={makeNode({ birth_date: '1942-01-01', death_date: '2009-12-31', is_living: false })}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('Alice Smith, 1942 – 2009');
  });

  it('aria-label includes "b. YYYY –" for living person with birth year', () => {
    render(
      <PersonCard
        node={makeNode({ birth_date: '1985-04-22', death_date: null, is_living: true })}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('Alice Smith, b. 1985 –');
  });

  it('aria-label is just the name when no dates', () => {
    render(
      <PersonCard
        node={makeNode({ birth_date: null, death_date: null, is_living: false })}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('Alice Smith');
  });

  it('aria-label "b. YYYY" for non-living with birth only', () => {
    render(
      <PersonCard
        node={makeNode({ birth_date: '1950-06-15', death_date: null, is_living: false })}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('Alice Smith, b. 1950');
  });
});

// ─── Existing tests ───────────────────────────────────────────────────────────

describe('PersonCard basics', () => {
  it('renders name visible', () => {
    render(<PersonCard node={makeNode()} />);
    expect(screen.getByText('Alice Smith')).toBeDefined();
  });

  it('renders initials avatar when no photo', () => {
    render(<PersonCard node={makeNode()} />);
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

  it('exported constants match expected values', () => {
    expect(CARD_WIDTH).toBe(220);
    expect(CARD_HEIGHT).toBe(80);
  });
});
