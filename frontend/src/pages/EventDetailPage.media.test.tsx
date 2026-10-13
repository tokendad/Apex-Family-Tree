import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EventDetailPage from './EventDetailPage';

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

/* Walter Higgins Sr's wake: twenty photographs, attached through event_media,
   which nothing on this page read. The event reported no connections and
   showed none of them. */
const event = {
  id: 'ev-wake',
  event_type: 'wake',
  event_date: '1990-11-29',
  event_place: null,
  plot: null,
  description: 'Walter Higgins SR Wake',
  source_url: null,
  source_url_checked_at: null,
  person: { id: 'p1', given_name: 'Walter', surname: 'Higgins', suffix: 'Sr' },
  family: null,
};

const media = [
  { id: 'm1', filename: 'Higgins Brothers.jpeg', original_filename: 'Higgins Brothers.jpeg', title: null, mime_type: 'image/jpeg' },
  { id: 'm2', filename: 'Cyr Sisters.jpeg', original_filename: 'Cyr Sisters.jpeg', title: 'Cyr Sisters', mime_type: 'image/jpeg' },
];

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/media/events/ev-wake/media')) {
      return Promise.resolve({ ok: true, json: async () => media });
    }
    if (url.includes('/connected')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    }
    return Promise.resolve({ ok: true, json: async () => event });
  });
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/events/ev-wake']}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('EventDetailPage — the media attached to an event', () => {
  it('has a Media tab counting what is attached', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('tab', { name: /media/i })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /media/i })).toHaveTextContent('2');
  });

  it('shows each photograph, named', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: /media/i }));

    expect(await screen.findByText('Cyr Sisters')).toBeInTheDocument();
    // No title of its own, so the filename stands in.
    expect(screen.getByText('Higgins Brothers.jpeg')).toBeInTheDocument();
  });

  it('opens a photograph when it is clicked', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /media/i }));

    fireEvent.click(await screen.findByText('Cyr Sisters'));

    await waitFor(() =>
      expect(openModal).toHaveBeenCalledWith('MediaEditor', expect.objectContaining({ mediaId: 'm2' })),
    );
  });

  /* The tab read "0" for an event with twenty photographs on it, because it
     counted only the archive relationship graph. Media is a connection too,
     whichever table holds it. */
  it('counts media as connections rather than reporting none', async () => {
    renderPage();

    const tab = await screen.findByRole('tab', { name: /connections/i });
    expect(tab).toHaveTextContent('2');

    fireEvent.click(tab);
    expect(screen.queryByText(/no relationships connected yet/i)).not.toBeInTheDocument();
  });
});
