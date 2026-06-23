import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PeoplePage from './PeoplePage';

// Mock heavy dependencies not under test
vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));
vi.mock('@/components/Avatar/Avatar', () => ({
  default: ({ name }: { name: string }) => <span>{name}</span>,
}));

// Mock permissions — canCreate = true so the button renders
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true }),
}));

// Mock searchStore
vi.mock('@/stores/searchStore', () => ({
  useSearchStore: Object.assign(
    vi.fn(() => ({ globalQuery: '', setTotalCount: vi.fn() })),
    { getState: () => ({ globalQuery: '' }) }
  ),
  hasActiveFilters: () => false,
  filtersToParams: () => new URLSearchParams(),
}));

// Mock fetch to return an empty list
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ people: [], next_cursor: null, total_count: 0 }),
  });
});

// Capture the openModal mock so tests can resolve it
const mockOpenModal = vi.fn();
vi.mock('@/components/modals/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('PeoplePage — Add Person', () => {
  it('opens PersonEditor modal instead of navigating to /people/new', async () => {
    mockOpenModal.mockResolvedValue({ action: 'cancelled' });
    render(<PeoplePage />, { wrapper: MemoryRouter });

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add person/i }));
    expect(mockOpenModal).toHaveBeenCalledWith('PersonEditor', { mode: 'create' });
    expect(mockNavigate).not.toHaveBeenCalledWith('/people/new');
  });

  it('navigates to person detail on created result', async () => {
    mockOpenModal.mockResolvedValue({
      action: 'created',
      entityType: 'person',
      entity: {
        id: 'p-123',
        given_name: 'Ada',
        surname: 'Lovelace',
        birth_date: null,
        death_date: null,
        photo_url: null,
      },
    });
    render(<PeoplePage />, { wrapper: MemoryRouter });

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add person/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/people/p-123'));
  });
});
