import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StoryDetailPage from './StoryDetailPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: true, canDelete: false }),
}));

/* The narrator picker loads the person it was given; this page's job here is
   the three id boxes it replaced, not PersonPicker's own behaviour. */
vi.mock('@/components/entity-pickers/PersonPicker', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <div data-testid="person-picker">{label}</div>,
}));

const story = {
  id: 'st-1',
  title: 'The crossing',
  summary: null,
  privacy_level: 'family',
  story_type: 'memory',
  body_markdown: 'They sailed in the spring.',
  narrator_person_id: 'p-1',
  narrator_title: 'Edith Marlow',
  date_text: null,
  notes: null,
  connected_objects: [
    { relationship_id: 'r-1', object_id: 'art-1', object_type: 'artifact', title: 'Passenger manifest', summary: null },
  ],
};

const searchResults = [
  { id: 'art-1', object_type: 'artifact', title: 'Passenger manifest', summary: null },
  { id: 'art-2', object_type: 'artifact', title: 'Passage ticket', summary: null },
  { id: 'col-1', object_type: 'collection', title: 'Passage papers', summary: null },
];

let posted: { url: string; body: unknown } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  posted = null;
  global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted = { url: String(url), body: JSON.parse(String(init.body)) };
      return Promise.resolve({ ok: true, json: async () => ({ id: 'new' }) });
    }
    if (String(url).includes('/api/v1/search')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: searchResults }) });
    }
    return Promise.resolve({ ok: true, json: async () => story });
  });
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/stories/st-1']}>
      <Routes>
        <Route path="/stories/:id" element={<StoryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('StoryDetailPage — the three id boxes', () => {
  it('connects an object by searching for it', async () => {
    renderPage();
    await screen.findByText('The crossing');

    fireEvent.change(await screen.findByLabelText('Object'), { target: { value: 'passage' } });
    fireEvent.click(await screen.findByRole('option', { name: /Passage ticket/ }));
    fireEvent.click(screen.getByRole('button', { name: /connect object/i }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.url).toContain('/api/v1/stories/st-1/connections');
    expect(posted!.body).toEqual({ object_id: 'art-2' });
  });

  it('adds the story to a collection chosen by title, and searches collections only', async () => {
    renderPage();
    await screen.findByText('The crossing');

    fireEvent.change(await screen.findByLabelText('Collection'), { target: { value: 'passage' } });
    expect(await screen.findByRole('option', { name: /Passage papers/ })).toBeInTheDocument();
    /* Both artifacts match the same search term; only the collection belongs
       in this control. */
    expect(screen.queryByRole('option', { name: /Passage ticket/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /Passage papers/ }));
    fireEvent.change(screen.getByPlaceholderText('Caption'), { target: { value: 'The ticket' } });
    fireEvent.click(screen.getByRole('button', { name: /add story to collection/i }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.url).toContain('/api/v1/collections/col-1/items');
    expect(posted!.body).toEqual({ item_object_id: 'st-1', caption: 'The ticket' });
  });

  it('names the narrator rather than asking for a person id', async () => {
    renderPage();
    await screen.findByText('The crossing');

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(await screen.findByTestId('person-picker')).toHaveTextContent('Narrator');
    expect(screen.queryByText(/Narrator Person ID/i)).not.toBeInTheDocument();
  });

  it('asks for no archive-object id anywhere', async () => {
    renderPage();
    await screen.findByText('The crossing');

    expect(screen.queryByPlaceholderText(/archive object ID/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Collection ID/i)).not.toBeInTheDocument();
  });
});
