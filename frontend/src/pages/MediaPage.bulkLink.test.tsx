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
vi.mock('@/components/modals/useModal', () => ({ useModal: () => ({ openModal: vi.fn() }) }));

/* A folder of funeral photographs, which is what this was built for. */
const mediaItems = [
  { id: 'm1', filename: 'Higgins Brothers.jpeg', original_filename: 'Higgins Brothers.jpeg', title: 'Higgins Brothers', mime_type: 'image/jpeg', file_size: 1000, created_at: '2026-10-13' },
  { id: 'm2', filename: 'Cyr Sisters.jpeg', original_filename: 'Cyr Sisters.jpeg', title: 'Cyr Sisters', mime_type: 'image/jpeg', file_size: 1000, created_at: '2026-10-13' },
  { id: 'm3', filename: 'Funeral-0008.jpeg', original_filename: 'Funeral-0008.jpeg', title: null, mime_type: 'image/jpeg', file_size: 1000, created_at: '2026-10-13' },
];

const walter = {
  id: 'per-1',
  given_name: 'Walter',
  surname: 'Higgins',
  suffix: 'Sr',
  events: [
    { id: 'ev-wake', event_type: 'wake', event_date: '29 NOV 1990', event_place: 'Worcester, Massachusetts' },
    { id: 'ev-burial', event_type: 'burial', event_date: null, event_place: 'Worcester County Memorial Park, Paxton, Massachusetts' },
  ],
};

let posted: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  posted = [];
  global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && url.includes('/links/')) {
      posted.push(url);
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    if (url.includes('/people?q=')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [walter] }) });
    }
    if (url.includes('/people/per-1')) {
      return Promise.resolve({ ok: true, json: async () => walter });
    }
    if (url.includes('/api/v1/media?') || url.includes('/api/v1/media')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: mediaItems, next_cursor: null }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
  });
});

function renderGallery() {
  render(
    <MemoryRouter>
      <MediaPage />
    </MemoryRouter>,
  );
}

const enterSelectMode = async () => {
  await screen.findByRole('button', { name: /higgins brothers/i });
  fireEvent.click(screen.getByRole('button', { name: /^select$/i }));
};

describe('MediaPage — linking a folder of photographs at once', () => {
  it('is off until asked for, so a click still opens a photo', async () => {
    renderGallery();

    await screen.findByRole('button', { name: /view higgins brothers/i });
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
  });

  it('picks several photos out and counts them', async () => {
    renderGallery();
    await enterSelectMode();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Higgins Brothers' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cyr Sisters' }));

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Higgins Brothers' })).toBeChecked();
  });

  it('takes the whole page in one go, which is the point', async () => {
    renderGallery();
    await enterSelectMode();

    fireEvent.click(screen.getByRole('button', { name: /select all/i }));

    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  /* The case this was built for: every photo in the folder onto one event of
     one person, chosen once rather than eighteen times. */
  it('links every selected photo to the event that was chosen', async () => {
    renderGallery();
    await enterSelectMode();
    fireEvent.click(screen.getByRole('button', { name: /select all/i }));

    fireEvent.click(screen.getByRole('button', { name: /select a person/i }));
    fireEvent.change(screen.getByPlaceholderText(/search for a person/i), {
      target: { value: 'Higgins' },
    });
    fireEvent.click(await screen.findByText(/Walter Higgins Sr/, {}, { timeout: 3000 }));

    const attachTo = await screen.findByLabelText('Attach to');
    fireEvent.change(attachTo, { target: { value: 'ev-wake' } });
    fireEvent.click(screen.getByRole('button', { name: /link 3/i }));

    await waitFor(() => expect(posted).toHaveLength(3));
    expect(posted).toEqual([
      '/api/v1/media/m1/links/event/ev-wake',
      '/api/v1/media/m2/links/event/ev-wake',
      '/api/v1/media/m3/links/event/ev-wake',
    ]);
  });

  /* The subject itself is still a valid target -- a portrait belongs to the
     person, not to an event of theirs. */
  it('links to the person when no event is chosen', async () => {
    renderGallery();
    await enterSelectMode();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cyr Sisters' }));

    fireEvent.click(screen.getByRole('button', { name: /select a person/i }));
    fireEvent.change(screen.getByPlaceholderText(/search for a person/i), {
      target: { value: 'Higgins' },
    });
    fireEvent.click(await screen.findByText(/Walter Higgins Sr/, {}, { timeout: 3000 }));
    fireEvent.click(screen.getByRole('button', { name: /link 1/i }));

    await waitFor(() => expect(posted).toEqual(['/api/v1/media/m2/links/person/per-1']));
  });

  /* One photograph failing is not a reason to abandon the rest, and the user
     has to be told which number actually went through. */
  it('reports how many went through when one fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/links/')) {
        return Promise.resolve(url.includes('/m2/') ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => ({}) });
      }
      if (url.includes('/people?q=')) return Promise.resolve({ ok: true, json: async () => ({ data: [walter] }) });
      if (url.includes('/people/per-1')) return Promise.resolve({ ok: true, json: async () => walter });
      return Promise.resolve({ ok: true, json: async () => ({ data: mediaItems, next_cursor: null }) });
    });

    renderGallery();
    await enterSelectMode();
    fireEvent.click(screen.getByRole('button', { name: /select all/i }));
    fireEvent.click(screen.getByRole('button', { name: /select a person/i }));
    fireEvent.change(screen.getByPlaceholderText(/search for a person/i), {
      target: { value: 'Higgins' },
    });
    fireEvent.click(await screen.findByText(/Walter Higgins Sr/, {}, { timeout: 3000 }));
    fireEvent.click(screen.getByRole('button', { name: /link 3/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Linked 2 of 3');
  });
});
