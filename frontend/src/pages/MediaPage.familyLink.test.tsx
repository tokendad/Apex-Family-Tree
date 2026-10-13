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

/* What the list endpoint actually returns: the couple under spouse1/spouse2,
   and nothing called display_name. The old dropdown read that missing field
   and fell back to the id, so every option was a hash. */
const familyResults = [
  {
    id: 'fam-7',
    spouse1: { given_name: 'Raymond', middle_name: 'Earl', surname: 'LeFort' },
    spouse2: { given_name: 'Eunice', middle_name: 'Louise', surname: 'Lagor' },
    marriage_date: '12 Jun 1948',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/families?q=')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: familyResults }) });
    }
    if (url.includes('/families/fam-7')) {
      return Promise.resolve({ ok: true, json: async () => familyResults[0] });
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

describe('MediaPage — linking an upload to a family', () => {
  it('offers a search box rather than a list of hashes', async () => {
    openUploadDialog();

    expect(await screen.findByText(/link to family/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select a family/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /family/i })).not.toBeInTheDocument();
  });

  it('finds a family by typing a name and shows the couple', async () => {
    openUploadDialog();

    fireEvent.click(await screen.findByRole('button', { name: /select a family/i }));
    fireEvent.change(screen.getByLabelText('Search for a family'), {
      target: { value: 'lefort' },
    });

    const hit = await screen.findByText(
      'Raymond Earl LeFort & Eunice Louise Lagor',
      {},
      { timeout: 3000 },
    );
    fireEvent.click(hit);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /raymond earl lefort & eunice louise lagor/i }),
      ).toBeInTheDocument(),
    );
  });

  /* The list it replaced was prefetched and capped at 500, in insertion
     order. Nothing is fetched until something is typed. */
  it('searches the server instead of prefetching every family', async () => {
    openUploadDialog();

    await screen.findByRole('button', { name: /select a family/i });
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/families?limit=500'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /select a family/i }));
    fireEvent.change(screen.getByLabelText('Search for a family'), {
      target: { value: 'lefort' },
    });

    await waitFor(() => {
      const after = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
      expect(after.some((u) => u.includes('/families?q=lefort'))).toBe(true);
    });
  });
});
