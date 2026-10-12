import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import EventsPage from './EventsPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));
/* The real picker is a search box; here it just needs to be able to hand the
   page a person, because the create handler refuses to post without one.
   Built with createElement rather than JSX: a vi.mock factory is hoisted above
   the imports, so the JSX runtime is not in scope inside it yet. */
vi.mock('@/components/entity-pickers/PersonPicker', async () => {
  const React = await import('react');
  return {
    default: ({ onSelect }: { onSelect: (p: { id: string }) => void }) =>
      React.createElement(
        'button',
        { type: 'button', onClick: () => onSelect({ id: 'p1' }) },
        'pick person',
      ),
  };
});
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: true, canDelete: false }),
}));

/* Issue #35: the plot used to be part of event_place, so it rendered for free.
   Once it moved to its own column, a surface that forgot it would silently
   stop showing where someone is buried. */
const events = [
  {
    id: 'e1', person_id: 'p1', family_id: null, event_type: 'burial',
    event_date: '14 MAR 1962',
    event_place: "St. John's Cemetery, Worcester, Massachusetts",
    plot: 'Lot 482 (Shrine of the Holy Family)',
    description: null,
  },
  {
    id: 'e2', person_id: 'p1', family_id: null, event_type: 'birth',
    event_date: '1922', event_place: 'Massachusetts', plot: null, description: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: events }) });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <EventsPage />
    </MemoryRouter>,
  );
}

describe('EventsPage — the burial plot', () => {
  it('shows the plot next to the cemetery', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Burial')).toBeInTheDocument());
    expect(screen.getByText("St. John's Cemetery, Worcester, Massachusetts")).toBeInTheDocument();
    expect(screen.getByText('Lot 482 (Shrine of the Holy Family)')).toBeInTheDocument();
  });

  it('offers a plot field when creating an event', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Burial')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /new event/i }));

    expect(screen.getByText('Plot')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/garden of heritage/i)).toBeInTheDocument();
  });

  it('sends the plot it was given', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Burial')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /new event/i }));
    // Queried by text, not by role name: the picker sits inside a <label>,
    // and a <button> is labelable, so its accessible name is "Person".
    fireEvent.click(screen.getByText('pick person'));
    fireEvent.change(screen.getByPlaceholderText(/garden of heritage/i), {
      target: { value: 'Lot 237 Grave 4' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create event/i }));

    await waitFor(() => {
      const post = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
        .find((call) => call[1]?.method === 'POST');
      expect(post).toBeDefined();
      expect(JSON.parse(String(post![1].body)).plot).toBe('Lot 237 Grave 4');
    });
  });
});
