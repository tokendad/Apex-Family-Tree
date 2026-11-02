import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const place = {
  id: 'pl-1',
  title: 'Hollybrook Cemetery',
  summary: null,
  privacy_level: 'family',
  place_type: 'cemetery',
  address_text: null,
  locality: null,
  county: null,
  region: null,
  country: null,
  postal_code: null,
  notes: null,
  parent_place_id: null,
  chain: [],
};

const connected = [
  { relationship_id: 'r-1', object_id: 'ev-1', object_type: 'event', title: 'Burial of Alfred Marlow', summary: null },
];

const searchResults = [
  { id: 'ev-1', object_type: 'event', title: 'Burial of Alfred Marlow', summary: null },
  { id: 'ev-2', object_type: 'event', title: 'Burial of Edith Marlow', summary: null },
];

let posted: { url: string; body: unknown } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  posted = null;
  global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted = { url: String(url), body: JSON.parse(String(init.body)) };
      return Promise.resolve({ ok: true, json: async () => ({ id: 'r-2' }) });
    }
    if (String(url).includes('/api/v1/search')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: searchResults }) });
    }
    if (String(url).includes('/connected')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: connected }) });
    }
    return Promise.resolve({ ok: true, json: async () => place });
  });
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/places/pl-1']}>
      <Routes>
        <Route path="/places/:id" element={<PlaceDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('PlaceDetailPage — connecting an event', () => {
  it('searches for the event instead of asking for its id', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /event/i }));

    expect(await screen.findByLabelText('Event')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/archive object ID/i)).not.toBeInTheDocument();
  });

  it('marks an event already connected rather than offering it twice', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /event/i }));

    fireEvent.change(await screen.findByLabelText('Event'), { target: { value: 'burial' } });

    const already = await screen.findByRole('option', { name: /Alfred Marlow/ });
    expect(already).toBeDisabled();
    expect(already).toHaveTextContent('already connected');
    expect(screen.getByRole('option', { name: /Edith Marlow/ })).not.toBeDisabled();
  });

  it('posts the chosen event, and only once it is chosen', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /event/i }));

    expect(await screen.findByRole('button', { name: /connect event/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Event'), { target: { value: 'burial' } });
    fireEvent.click(await screen.findByRole('option', { name: /Edith Marlow/ }));
    fireEvent.click(screen.getByRole('button', { name: /connect event/i }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.body).toMatchObject({
      relationship_type_code: 'occurred_at',
      members: [
        { object_id: 'ev-2', role: 'event' },
        { object_id: 'pl-1', role: 'place' },
      ],
    });
  });
});
