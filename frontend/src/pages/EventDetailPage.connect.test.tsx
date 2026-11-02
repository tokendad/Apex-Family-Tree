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
vi.mock('@/components/modals/useModal', () => ({
  useModal: () => ({ openModal: vi.fn().mockResolvedValue({ action: 'closed' }) }),
}));

/* Connecting a place to an event used to mean typing the place's archive-object
   id into a text box. The id is not something a reader has, and a wrong one
   posted a relationship that failed with no message on the page. */
const event = {
  id: 'ev-1',
  event_type: 'burial',
  event_date: '1990-12-01',
  event_place: null,
  plot: null,
  description: null,
  source_url: null,
  source_url_checked_at: null,
  person: { id: 'p1', given_name: 'Alfred', surname: 'Marlow' },
  family: null,
};

const searchResults = [
  { id: 'pl-1', object_type: 'place', title: 'Hollybrook Cemetery', summary: null },
  { id: 'art-1', object_type: 'artifact', title: 'Hollybrook burial card', summary: null },
];

let posted: { url: string; body: unknown } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  posted = null;
  global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted = { url: String(url), body: JSON.parse(String(init.body)) };
      return Promise.resolve({ ok: true, json: async () => ({ id: 'rel-1' }) });
    }
    if (String(url).includes('/api/v1/search')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: searchResults }) });
    }
    if (String(url).includes('/media/')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (String(url).includes('/connected')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    }
    return Promise.resolve({ ok: true, json: async () => event });
  });
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/events/ev-1']}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('EventDetailPage — connecting an object', () => {
  it('offers a picker for each kind rather than three id boxes', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /connection/i }));

    expect(await screen.findByText('Place')).toBeInTheDocument();
    expect(screen.getByText('Artifact')).toBeInTheDocument();
    expect(screen.getByText('Person')).toBeInTheDocument();
    /* The fields these replaced. */
    expect(screen.queryByPlaceholderText(/Place ID/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Artifact ID/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Person ID/i)).not.toBeInTheDocument();
  });

  it('will not connect until something is chosen, then posts that object id', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /connection/i }));

    const button = await screen.findByRole('button', { name: 'Connect Place' });
    expect(button).toBeDisabled();

    /* The place picker searches places only, so the artifact in the same result
       set must not be offered here. */
    /* Found by its label, which only works because each picker's input carries
       an id of its own -- three on this page would otherwise collide. */
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'holly' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /Hollybrook Cemetery/ })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: /burial card/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /Hollybrook Cemetery/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect Place' }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.url).toContain('/api/v1/relationships');
    expect(posted!.body).toMatchObject({
      relationship_type_code: 'occurred_at',
      members: [
        { object_id: 'ev-1', role: 'event' },
        { object_id: 'pl-1', role: 'place' },
      ],
    });
  });
});
