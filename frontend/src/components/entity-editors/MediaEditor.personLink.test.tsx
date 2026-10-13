import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MediaEditor from './MediaEditor';

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: true, canDelete: true }),
}));

vi.mock('@/components/MediaPersonTagger/MediaPersonTagger', () => ({ default: () => null }));

const item = {
  id: 'med-1',
  filename: 'portrait.jpg',
  original_filename: 'portrait.jpg',
  mime_type: 'image/jpeg',
  file_size: 1024,
  title: 'A portrait',
  description: null,
  date_taken: null,
  uploaded_by: 'user-1',
  is_external: 0,
  created_at: '2026-01-01T00:00:00Z',
};

/* Not in alphabetical order, and the match is not the first row. */
const searchResults = [
  { id: 'per-9', given_name: 'Alan Paul', surname: 'Higgins', birth_date: null, death_date: null },
  { id: 'per-3', given_name: 'Joan Ellen', surname: 'Higgins', birth_date: null, death_date: null },
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
        json: async () => ({ id: 'per-3', given_name: 'Joan Ellen', surname: 'Higgins' }),
      });
    }
    if (url.includes('/links')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ persons: [], families: [], events: [], sources: [] }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
  });
});

function renderEditor() {
  return render(
    <MediaEditor mediaId="med-1" initialItem={item} modalId="m1" onClose={vi.fn()} />,
  );
}

describe('MediaEditor — connecting a person', () => {
  /* The upload dialog got a search box; this one kept the dropdown of every
     person in insertion order, which is the same bug in the other half of
     the same job. */
  it('offers a search box rather than a list of every person', async () => {
    renderEditor();

    expect(await screen.findByRole('button', { name: /select a person/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: /select entity to link/i }),
    ).not.toBeInTheDocument();
  });

  it('finds a person by typing part of their name', async () => {
    renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: /select a person/i }));
    fireEvent.change(screen.getByPlaceholderText(/search for a person/i), {
      target: { value: 'Joan' },
    });

    fireEvent.click(await screen.findByText('Joan Ellen Higgins', {}, { timeout: 3000 }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /joan ellen higgins/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /^add$/i })).toBeEnabled();
  });

  /* Family, event and source have no picker yet, so they stay selects -- but
     switching to one must still give a usable control. */
  it('keeps a list for the link types that have no picker', async () => {
    renderEditor();

    await screen.findByRole('button', { name: /select a person/i });
    fireEvent.change(screen.getByRole('combobox', { name: /link type/i }), {
      target: { value: 'event' },
    });

    expect(screen.getByRole('combobox', { name: /select entity to link/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /select a person/i })).not.toBeInTheDocument();
  });

  /* A family used to be one of those lists, and it listed hex ids: the list
     endpoint returns the couple as spouse1/spouse2, so the label fell through
     to the id. It searches by name now, like a person. */
  it('searches for a family by name instead of listing ids', async () => {
    renderEditor();

    await screen.findByRole('button', { name: /select a person/i });
    fireEvent.change(screen.getByRole('combobox', { name: /link type/i }), {
      target: { value: 'family' },
    });

    expect(screen.getByRole('button', { name: /select a family/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /select entity to link/i })).not.toBeInTheDocument();
  });

  it('does not prefetch the whole tree', async () => {
    renderEditor();

    await screen.findByRole('button', { name: /select a person/i });
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/people?limit=500'))).toBe(false);
  });
});
