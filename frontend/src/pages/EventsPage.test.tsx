import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import EventsPage from './EventsPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));
vi.mock('@/components/entity-pickers/PersonPicker', () => ({ default: () => null }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: true, canDelete: false }),
}));

const events = [
  { id: 'e1', person_id: 'p1', family_id: null, event_type: 'birth', event_date: '5 JAN 1922', event_place: 'Massachusetts', description: null },
  { id: 'e2', person_id: 'p1', family_id: null, event_type: 'occupation', event_date: '1982', event_place: null, description: 'Segment Treater' },
  { id: 'e3', person_id: 'p1', family_id: null, event_type: 'residence', event_date: '1930', event_place: 'Worcester', description: null },
  { id: 'e4', person_id: null, family_id: 'f1', event_type: 'marriage', event_date: '6 JUN 1945', event_place: null, description: null },
  { id: 'e5', person_id: 'p2', family_id: null, event_type: 'military_service', event_date: '1942', event_place: null, description: null },
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

describe('EventsPage — events and attributes in one index', () => {
  it('labels each card by kind and uses human type names', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Birth')).toBeInTheDocument());

    // Raw keys used to leak through: "occupation", "military".
    expect(screen.getByText('Occupation')).toBeInTheDocument();
    expect(screen.getByText('Military Service')).toBeInTheDocument();

    expect(screen.getAllByText('Attribute')).toHaveLength(2); // occupation, residence
    expect(screen.getAllByText('Event')).toHaveLength(3); // birth, marriage, military
  });

  it('counts each kind in the filter chips', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'All (5)' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Events (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Facts & Attributes (2)' })).toBeInTheDocument();
  });

  it('filters to attributes only', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Facts & Attributes (2)' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Facts & Attributes (2)' }));

    expect(screen.getByText('Occupation')).toBeInTheDocument();
    expect(screen.getByText('Residence')).toBeInTheDocument();
    expect(screen.queryByText('Birth')).not.toBeInTheDocument();
    expect(screen.queryByText('Marriage')).not.toBeInTheDocument();
  });

  it('filters to events only', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Events (3)' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Events (3)' }));

    expect(screen.getByText('Birth')).toBeInTheDocument();
    expect(screen.getByText('Marriage')).toBeInTheDocument();
    expect(screen.queryByText('Occupation')).not.toBeInTheDocument();
    expect(screen.queryByText('Residence')).not.toBeInTheDocument();
  });

  it('marks the active filter for assistive tech', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'All (5)' })).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'All (5)' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Events (3)' }));
    expect(screen.getByRole('button', { name: 'Events (3)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All (5)' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('groups the create form type picker into events and attributes', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Birth')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /new event/i }));

    const select = screen.getByRole('combobox');
    const groups = within(select).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('label'))).toEqual(['Events', 'Facts & Attributes']);
  });
});
