import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import FamiliesPage from './FamiliesPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true }),
}));

vi.mock('@/stores/searchStore', () => ({
  useSearchStore: Object.assign(
    vi.fn(() => ({ globalQuery: '' })),
    { getState: () => ({ globalQuery: '' }) }
  ),
}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ families: [], next_cursor: null }),
  });
});

const mockOpenModal = vi.fn();
vi.mock('@/components/modals/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('FamiliesPage — Add Family', () => {
  it('opens FamilyEditor modal instead of navigating to /families/new', async () => {
    mockOpenModal.mockResolvedValue({ action: 'cancelled' });
    render(<FamiliesPage />, { wrapper: MemoryRouter });

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add family/i }));
    expect(mockOpenModal).toHaveBeenCalledWith('FamilyEditor', { mode: 'create' });
    expect(mockNavigate).not.toHaveBeenCalledWith('/families/new');
  });

  it('navigates to family detail on created result', async () => {
    mockOpenModal.mockResolvedValue({
      action: 'created',
      entityType: 'family',
      entity: {
        id: 'f-456',
        spouse1_id: null,
        spouse2_id: null,
        spouse1: null,
        spouse2: null,
        marriage_date: null,
        marriage_place: null,
      },
    });
    render(<FamiliesPage />, { wrapper: MemoryRouter });

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add family/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/families/f-456'));
  });
});
