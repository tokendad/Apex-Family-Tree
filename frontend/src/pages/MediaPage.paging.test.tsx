import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MediaPage from './MediaPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: false, canEdit: false, canDelete: false }),
}));

/**
 * A stand-in for the browser's IntersectionObserver that reports every target
 * as visible, the way the real one does when the gallery is too short to fill
 * its stretched grid -- the case the sentinel exists for.
 */
let observers: unknown[] = [];

class FakeIntersectionObserver {
  private cb: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    observers.push(this);
  }
  observe(target: Element) {
    // The real observer delivers an initial callback for a visible target.
    this.cb(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {
    observers = observers.filter((o) => o !== this);
  }
  unobserve() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = '';
  thresholds = [];
}

function item(id: string) {
  return { id, title: `Item ${id}`, filename: `${id}.jpg`, mime_type: 'image/jpeg' };
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MediaPage — paging', () => {
  it('keeps pulling pages until the gallery runs out', async () => {
    const pages = [
      { media: [item('m1')], next_cursor: 'c1' },
      { media: [item('m2')], next_cursor: 'c2' },
      { media: [item('m3')], next_cursor: null },
    ];
    let call = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/media?')) {
        return Promise.resolve({ ok: true, json: async () => pages[call++] });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    });

    render(<MediaPage />, { wrapper: MemoryRouter });

    // All three pages arrive without anyone clicking "Load more".
    await waitFor(() => expect(call).toBe(3), { timeout: 3000 });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument(),
    );
  });

  it('stops after a failed page instead of retrying forever', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/media?')) {
        call++;
        if (call === 1) {
          return Promise.resolve({ ok: true, json: async () => ({ media: [item('m1')], next_cursor: 'c1' }) });
        }
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    });

    render(<MediaPage />, { wrapper: MemoryRouter });

    await waitFor(() => expect(call).toBeGreaterThanOrEqual(2), { timeout: 3000 });
    const after = call;
    await new Promise((r) => setTimeout(r, 100));
    expect(call).toBe(after);
  });
});
