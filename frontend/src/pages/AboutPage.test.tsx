import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AboutPage from './AboutPage';

vi.mock('@/contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'w@e.test', display_name: 'Wes', role: 'admin' },
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const INSTANCE = {
  instance_name: 'The Lefort Archive',
  instance_timezone: 'America/New_York',
  gedcom_default_version: '5.5.1',
};

function mockApi({ fail = false } = {}) {
  vi.stubGlobal('fetch', vi.fn(async () =>
    (fail
      ? { ok: false, status: 500, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => INSTANCE }) as Response,
  ));
}

const renderPage = () => render(<MemoryRouter><AboutPage /></MemoryRouter>);

beforeEach(() => {
  vi.stubGlobal('__APP_VERSION__', '2.6.1');
  vi.stubGlobal('__APP_REPOSITORY__', 'https://github.com/tokendad/Apex-Family-Tree');
  vi.stubGlobal('__APP_LICENSE__', 'MIT');
});
afterEach(() => vi.unstubAllGlobals());

describe('AboutPage', () => {
  it('shows the four things the issue asked for', async () => {
    mockApi();
    renderPage();

    expect(screen.getByText('2.6.1')).toBeInTheDocument();
    expect(screen.getByText(/MIT licence/i)).toBeInTheDocument();
    expect(screen.getByText(/Apex Family Tree Contributors/)).toBeInTheDocument();

    const repo = screen.getByRole('link', { name: /github\.com\/tokendad/i });
    expect(repo).toHaveAttribute('href', 'https://github.com/tokendad/Apex-Family-Tree');
    expect(repo).toHaveAttribute('rel', expect.stringContaining('noopener'));

    expect(await screen.findByText('The Lefort Archive')).toBeInTheDocument();
  });

  it('names this instance rather than the product', async () => {
    mockApi();
    renderPage();

    expect(await screen.findByText('The Lefort Archive')).toBeInTheDocument();
    expect(screen.getByText('America/New_York')).toBeInTheDocument();
  });

  /* The version, licence and source link need nothing from the server. Losing
     the instance lookup must not cost the page. */
  it('still renders when the instance lookup fails', async () => {
    mockApi({ fail: true });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/settings could not be read/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('2.6.1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /github\.com\/tokendad/i })).toBeInTheDocument();
    // Falls back to the stock name rather than showing an empty row.
    expect(screen.getByText('Apex Family Tree')).toBeInTheDocument();
  });

  it('no longer shows the Coming Soon placeholder', async () => {
    mockApi();
    renderPage();

    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('points at the other two Help pages', async () => {
    mockApi();
    renderPage();

    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/faq');
    expect(screen.getByRole('link', { name: 'Glossary' })).toHaveAttribute('href', '/glossary');
  });
});
