import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ThemePage from './ThemePage';
import { THEME_CACHE_KEY } from '@/utils/theme';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => <nav /> }));

let settings: Record<string, unknown>;
let patched: Array<Record<string, unknown>>;

function mockApi(options?: { settingsFail?: boolean; patchFail?: boolean }) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/users/me/settings') && init?.method === 'PATCH') {
      patched.push(JSON.parse(init.body as string) as Record<string, unknown>);
      return Promise.resolve({ ok: !options?.patchFail, json: () => Promise.resolve({ settings }) } as Response);
    }
    if (url.includes('/users/me/settings')) {
      return Promise.resolve({ ok: !options?.settingsFail, json: () => Promise.resolve({ settings }) } as Response);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }));
}

/** matchMedia is not implemented in jsdom. */
function mockPrefersDark(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

const renderPage = () => render(<ThemeProvider><ThemePage /></ThemeProvider>);
const theme = () => document.documentElement.getAttribute('data-theme');

beforeEach(() => {
  settings = {};
  patched = [];
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  mockPrefersDark(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ThemePage — night mode (#11)', () => {
  it('offers the three choices', async () => {
    mockApi();
    renderPage();

    expect(await screen.findByRole('radio', { name: /Match this device/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Light/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Night/ })).toBeInTheDocument();
  });

  it('applies night mode to the document and saves it to the account', async () => {
    mockApi();
    renderPage();

    fireEvent.click(await screen.findByRole('radio', { name: /Night/ }));

    expect(theme()).toBe('dark');
    // The account, not this browser, is where the choice belongs.
    await waitFor(() => expect(patched).toEqual([{ theme: 'dark' }]));
    // The cache exists only so the next load can paint dark immediately.
    expect(window.localStorage.getItem(THEME_CACHE_KEY)).toBe('dark');
  });

  it('starts from the choice already stored on the account', async () => {
    settings = { theme: 'dark' };
    mockApi();
    renderPage();

    await waitFor(() => expect(theme()).toBe('dark'));
    expect(await screen.findByRole('radio', { name: /Night/, checked: true })).toBeInTheDocument();
  });

  it('resolves "match this device" against the device', async () => {
    mockPrefersDark(true);
    settings = { theme: 'system' };
    mockApi();
    renderPage();

    await waitFor(() => expect(theme()).toBe('dark'));
    expect(await screen.findByText(/Matching this device, which is currently dark/)).toBeInTheDocument();
  });

  it('keeps the chosen theme and says so when the save fails', async () => {
    mockApi({ patchFail: true });
    renderPage();

    fireEvent.click(await screen.findByRole('radio', { name: /Night/ }));

    // Applied anyway: reverting what somebody just asked for is worse than
    // telling them it did not persist.
    expect(theme()).toBe('dark');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not save the theme/);
  });

  it('falls back to the cached choice when the account cannot be read', async () => {
    window.localStorage.setItem(THEME_CACHE_KEY, 'dark');
    mockApi({ settingsFail: true });

    await act(async () => { renderPage(); });

    expect(theme()).toBe('dark');
  });

  it('ignores a stored value that is not a theme', async () => {
    settings = { theme: 'midnight-purple' };
    mockApi();

    await act(async () => { renderPage(); });

    expect(theme()).toBe('light');
  });
});
