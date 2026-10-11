import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MediaPage from './MediaPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: true, canDelete: false }),
}));

/* The tree the picker searches. Deliberately not in alphabetical order, and
   the match is not the first row -- a list would have shown Alan first. */
const searchResults = [
  { id: 'per-9', given_name: 'Alan Paul', surname: 'Higgins', birth_date: null, death_date: null },
  { id: 'per-3', given_name: 'Rachel Ann', surname: 'LeFort', birth_date: null, death_date: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/people?q=')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: searchResults }) });
    }
    if (url.includes('/people/per-3')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'per-3', given_name: 'Rachel Ann', surname: 'LeFort' }),
      });
    }
    if (url.includes('/families') || url.includes('/events') || url.includes('/media')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
  });
});

function openUploadDialog() {
  render(
    <MemoryRouter>
      <MediaPage />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: /upload media/i }));
}

describe('MediaPage — linking an upload to a person', () => {
  /* The dropdown listed every person in whatever order the API returned, so
     there was nothing to type into and no order to scan. */
  it('offers a search box rather than a list of every person', async () => {
    openUploadDialog();

    expect(await screen.findByText(/link to person/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select a person/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /person/i })).not.toBeInTheDocument();
  });

  /* The whole point: type a few letters, get the person. */
  it('finds a person by typing part of their name', async () => {
    openUploadDialog();

    fireEvent.click(await screen.findByRole('button', { name: /select a person/i }));
    fireEvent.change(screen.getByPlaceholderText(/search for a person/i), {
      target: { value: 'Rach' },
    });

    const hit = await screen.findByText('Rachel Ann LeFort', {}, { timeout: 3000 });
    fireEvent.click(hit);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /rachel ann lefort/i })).toBeInTheDocument(),
    );
  });

  /* The search runs against the server, so it is not capped at the first 500
     people the way the prefetched list was. */
  it('searches the server instead of prefetching the whole tree', async () => {
    openUploadDialog();

    await screen.findByRole('button', { name: /select a person/i });
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/people?limit=500'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /select a person/i }));
    fireEvent.change(screen.getByPlaceholderText(/search for a person/i), {
      target: { value: 'Rach' },
    });

    await waitFor(() => {
      const after = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
      expect(after.some((u) => u.includes('/people?q=Rach'))).toBe(true);
    });
  });
});
