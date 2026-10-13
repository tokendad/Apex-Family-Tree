import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FamilyDetailPage from './FamilyDetailPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: true, canDelete: false }),
}));
vi.mock('@/contexts/PageActionsContext', () => ({ usePageActions: () => {} }));

const openModal = vi.fn().mockResolvedValue({ action: 'closed' });
vi.mock('@/components/modals/useModal', () => ({ useModal: () => ({ openModal }) }));

const family = {
  id: 'fam-1',
  spouse1: { id: 'p1', given_name: 'Walter', surname: 'Higgins', suffix: 'Sr' },
  spouse2: { id: 'p2', displayName: 'Rita Cyr', given_name: 'Rita', surname: 'Cyr' },
  marriage_date: '1945-06-02',
  marriage_place: null,
  divorce_date: null,
  divorce_place: null,
  children: [],
  events: [
    { id: 'ev-marriage', event_type: 'marriage', event_date: '1945-06-02', event_date_sort_key: 19450602, event_place: null, plot: null, description: null, source_url: null, source_url_checked_at: null },
  ],
};

/* Photographs of the household rather than of one occasion: the ones that
   have several of them in it and belong to no particular day. */
const media = [
  { id: 'm1', filename: 'christmas-1962.jpg', original_filename: 'christmas-1962.jpg', title: 'Christmas 1962' },
  { id: 'm2', filename: 'back-porch.jpg', original_filename: 'back-porch.jpg', title: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/media/families/fam-1/media')) {
      return Promise.resolve({ ok: true, json: async () => media });
    }
    if (url.includes('/families/fam-1')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => family });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) });
  });
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/families/fam-1']}>
      <Routes>
        <Route path="/families/:id" element={<FamilyDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('FamilyDetailPage — media', () => {
  /* family_media was writable from the media gallery and displayed nowhere:
     linking a photograph to a family put it somewhere it could not be seen. */
  it('has a Media tab counting what is attached', async () => {
    renderPage();

    const tab = await screen.findByRole('tab', { name: /media/i });
    await waitFor(() => expect(tab).toHaveTextContent('2'));
  });

  it('names each photograph, falling back to the filename', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: /media/i }));

    expect(await screen.findByText('Christmas 1962')).toBeInTheDocument();
    expect(screen.getByText('back-porch.jpg')).toBeInTheDocument();
  });

  it('opens one when it is clicked', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /media/i }));

    fireEvent.click(await screen.findByText('Christmas 1962'));

    await waitFor(() =>
      expect(openModal).toHaveBeenCalledWith('MediaEditor', expect.objectContaining({ mediaId: 'm1' })),
    );
  });

  /* A wedding photograph belongs to the wedding, and the way to it from here
     is the event's own name. */
  it('links the marriage to its own page', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: /timeline/i }));

    const link = await screen.findByRole('link', { name: 'Marriage' });
    expect(link).toHaveAttribute('href', '/events/ev-marriage');
  });
});
