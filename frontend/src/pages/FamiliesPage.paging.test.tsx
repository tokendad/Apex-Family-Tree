import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import FamiliesPage from './FamiliesPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: false }) }));
vi.mock('@/components/modals/useModal', () => ({ useModal: () => ({ openModal: vi.fn() }) }));
vi.mock('@/stores/searchStore', () => ({
  useSearchStore: Object.assign(
    vi.fn(() => ''),
    { getState: () => ({ globalQuery: '' }) },
  ),
}));

/**
 * A stand-in for the browser's IntersectionObserver that reports every target
 * as visible, the way the real one does when the list is too short to fill
 * the grid. That is the case the sentinel exists for: 20 of 74 families left
 * the page looking finished, with "Load more" stranded below the fold.
 */
let observers: { cb: IntersectionObserverCallback; targets: Element[] }[] = [];

class FakeIntersectionObserver {
  private entry: { cb: IntersectionObserverCallback; targets: Element[] };
  constructor(cb: IntersectionObserverCallback) {
    this.entry = { cb, targets: [] };
    observers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.targets.push(target);
    // The real observer delivers an initial callback for a visible target.
    this.entry.cb(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {
    observers = observers.filter((o) => o !== this.entry);
  }
  unobserve() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = '';
  thresholds = [];
}

function family(id: string) {
  return { id, spouse1_id: null, spouse2_id: null, marriage_date: null, spouse1: null, spouse2: null };
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FamiliesPage — paging', () => {
  it('keeps pulling pages until the archive runs out', async () => {
    const pages = [
      { families: [family('f1')], next_cursor: 'c1' },
      { families: [family('f2')], next_cursor: 'c2' },
      { families: [family('f3')], next_cursor: undefined },
    ];
    let call = 0;
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => pages[call++] }),
    );

    render(<FamiliesPage />, { wrapper: MemoryRouter });

    // All three pages arrive without anyone clicking "Load more".
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument(),
    );
    expect(call).toBe(3);
  });

  it('stops after a failed page instead of retrying forever', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) {
        return Promise.resolve({ ok: true, json: async () => ({ families: [family('f1')], next_cursor: 'c1' }) });
      }
      return Promise.resolve({ ok: false, status: 500 });
    });

    render(<FamiliesPage />, { wrapper: MemoryRouter });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const after = call;
    await new Promise((r) => setTimeout(r, 50));
    expect(call).toBe(after);
  });
});
