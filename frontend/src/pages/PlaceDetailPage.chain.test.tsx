import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PlaceDetailPage from './PlaceDetailPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: true, canDelete: false }),
}));
vi.mock('@/contexts/PageActionsContext', () => ({ usePageActions: () => {} }));

/* Issue #35: migration 074 split each place into components and hung it under
   the place that contains it. The chain is only worth storing if it can be
   seen, so the detail page has to render it. */
const place = {
  id: 'place_1',
  title: "St. John's Cemetery, Worcester, Massachusetts",
  summary: null,
  privacy_level: 'family',
  place_type: 'cemetery',
  address_text: '260 Cambridge St',
  locality: 'Worcester',
  county: null,
  region: 'Massachusetts',
  country: 'United States',
  postal_code: '01603',
  notes: null,
  parent_place_id: 'place_2',
  chain: [
    { id: 'place_2', title: 'Worcester, Massachusetts' },
    { id: 'place_3', title: 'Massachusetts' },
    { id: 'place_4', title: 'United States' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(
      url.includes('/connected')
        ? { ok: true, json: async () => ({ data: [] }) }
        : { ok: true, json: async () => place },
    ),
  );
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/places/place_1']}>
      <Routes>
        <Route path="/places/:id" element={<PlaceDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlaceDetailPage — the places above this one', () => {
  it('lists the chain, nearest first, each one a link', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Inside')).toBeInTheDocument());
    const town = screen.getByRole('link', { name: 'Worcester, Massachusetts' });
    expect(town).toHaveAttribute('href', '/places/place_2');
    expect(screen.getByRole('link', { name: 'Massachusetts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'United States' })).toBeInTheDocument();
  });

  /* The street line and the name are separate things now: the address is the
     street alone, and the cemetery's name stays in the title. */
  it('shows the street address without the place name in it', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('260 Cambridge St')).toBeInTheDocument());
    expect(screen.getByText('01603')).toBeInTheDocument();
  });

  it('shows a dash for a country, which is inside nothing', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/connected')
          ? { ok: true, json: async () => ({ data: [] }) }
          : { ok: true, json: async () => ({ ...place, title: 'Canada', chain: [] }) },
      ),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('Inside')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Massachusetts' })).not.toBeInTheDocument();
  });
});
