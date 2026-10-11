import { render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

const USER = { id: 'u1', email: 'test@example.com', display_name: 'Test', role: 'admin' };

function Probe() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p>loading</p>;
  return <p>{user ? `signed in as ${user.email}` : 'signed out'}</p>;
}

/** Counts calls per path so a test can assert how often the cookie was rotated. */
function mockFetch(handler: (path: string) => { status: number; body?: unknown }) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    calls.push(path);
    const { status, body } = handler(path);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return { calls, countOf: (path: string) => calls.filter((c) => c === path).length };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderSignedIn() {
  const mock = mockFetch((path) => {
    if (path === '/api/auth/me') return { status: 200, body: { user: USER } };
    if (path === '/api/auth/refresh') return { status: 200, body: { user: USER } };
    return { status: 404 };
  });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText(/signed in/)).toBeInTheDocument());
  return mock;
}

describe('AuthProvider session renewal', () => {
  /* The bug this guards: the access cookie lives 15 minutes, the silent refresh
     ran only on mount, and nothing renewed it afterwards. A page left open past
     15 minutes kept showing a signed-in user while every write 401'd. */
  it('renews the access cookie before it can expire on an idle page', async () => {
    const { countOf } = await renderSignedIn();
    expect(countOf('/api/auth/refresh')).toBe(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(ACCESS_TOKEN_LIFETIME_MS); });

    expect(countOf('/api/auth/refresh')).toBeGreaterThan(0);
  });

  it('keeps renewing for as long as the page stays open', async () => {
    const { countOf } = await renderSignedIn();

    await act(async () => { await vi.advanceTimersByTimeAsync(3 * ACCESS_TOKEN_LIFETIME_MS); });

    // Three token lifetimes must not pass on a single renewal.
    expect(countOf('/api/auth/refresh')).toBeGreaterThanOrEqual(3);
  });

  /* Timers are throttled or stopped in a backgrounded tab, so on a phone the
     interval alone never fires. Coming back to the tab has to renew. */
  it('renews when a backgrounded tab is brought back to the foreground', async () => {
    const { countOf } = await renderSignedIn();
    const before = countOf('/api/auth/refresh');

    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60 * 1000); });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(countOf('/api/auth/refresh')).toBeGreaterThan(before);
  });

  /* /api/auth/refresh rotates and deletes the old token row, so two overlapping
     calls sign the user out of every tab. Repeated foreground events must not
     stampede it. */
  it('does not stampede the rotating refresh endpoint', async () => {
    const { countOf } = await renderSignedIn();
    const before = countOf('/api/auth/refresh');

    await act(async () => {
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      }
      await Promise.resolve();
    });

    expect(countOf('/api/auth/refresh') - before).toBeLessThanOrEqual(1);
  });

  it('signs the user out when the refresh token is spent', async () => {
    mockFetch((path) => {
      if (path === '/api/auth/me') return { status: 401 };
      if (path === '/api/auth/refresh') return { status: 401 };
      return { status: 404 };
    });

    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText('signed out')).toBeInTheDocument());
  });

  /* A dropped connection is not a sign-out; the next tick should retry. */
  it('keeps the user signed in when a renewal fails on the network', async () => {
    let failRenewals = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/auth/refresh' && failRenewals) throw new Error('offline');
      return { ok: true, status: 200, json: async () => ({ user: USER }) } as Response;
    }));

    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText(/signed in/)).toBeInTheDocument());

    failRenewals = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(ACCESS_TOKEN_LIFETIME_MS); });

    expect(screen.getByText(/signed in/)).toBeInTheDocument();
  });

  it('does not renew when nobody is signed in', async () => {
    const { countOf } = mockFetch((path) => {
      if (path === '/api/auth/me') return { status: 401 };
      if (path === '/api/auth/refresh') return { status: 401 };
      return { status: 404 };
    });

    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('signed out')).toBeInTheDocument());
    const afterMount = countOf('/api/auth/refresh');

    await act(async () => { await vi.advanceTimersByTimeAsync(3 * ACCESS_TOKEN_LIFETIME_MS); });

    // Only the one attempt from mount; no interval for a signed-out visitor.
    expect(countOf('/api/auth/refresh')).toBe(afterMount);
  });
});
