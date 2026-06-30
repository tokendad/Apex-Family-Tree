import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PersonDetailPage from './PersonDetailPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));
vi.mock('@/components/Avatar/Avatar', () => ({
  default: () => null,
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: false, canDelete: false }),
}));

// Minimal person fixture
const stubPerson = {
  id: 'per-1',
  sex: 'F',
  is_living: 0,
  is_private: 0,
  birth_date: null,
  birth_place: null,
  death_date: null,
  death_place: null,
  photo_url: null,
  names: [{ given_name: 'Jane', surname: 'Doe', name_type: 'birth', is_primary: 1 }],
  events: [],
  notes: [],
  sources: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/relationships')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url.includes('/media')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url.includes('/sources')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    return Promise.resolve({ ok: true, json: async () => stubPerson });
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/people/per-1']}>
      <Routes>
        <Route path="/people/:id" element={<PersonDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PersonDetailPage — Add Family', () => {
  it('renders Add Family only inside the Actions menu', async () => {
    mockOpenModal.mockResolvedValue({ action: 'cancelled' });
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Jane Doe' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /add family/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /actions/i }));

    expect(screen.getByRole('menuitem', { name: /add family/i })).toBeInTheDocument();
  });

  it('opens FamilyEditor pre-populated with current person as spouse1', async () => {
    mockOpenModal.mockResolvedValue({ action: 'cancelled' });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /add family/i }));
    expect(mockOpenModal).toHaveBeenCalledWith('FamilyEditor', {
      mode: 'create',
      defaults: { spouse1_id: 'per-1' },
    });
  });

  it('navigates to new family on created result', async () => {
    mockOpenModal.mockResolvedValue({
      action: 'created',
      entityType: 'family',
      entity: {
        id: 'f-789',
        spouse1_id: 'per-1',
        spouse2_id: null,
        spouse1: null,
        spouse2: null,
        marriage_date: null,
        marriage_place: null,
      },
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /add family/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/families/f-789'));
  });
});
