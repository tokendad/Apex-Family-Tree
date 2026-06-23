import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FamilyDetailPage from './FamilyDetailPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canEdit: true, canDelete: false }),
}));

// PersonPicker: just a stub that immediately calls onSelect with a fake person
vi.mock('@/components/entity-pickers/PersonPicker', () => ({
  default: ({
    label,
    onSelect,
  }: {
    label?: string;
    onSelect: (p: { id: string; given_name: string | null; surname: string | null; birth_date: string | null; death_date: string | null; photo_url: string | null }) => void;
  }) => (
    <button
      type="button"
      data-testid={`pick-${label?.toLowerCase().replace(/\s/g, '-')}`}
      onClick={() =>
        onSelect({
          id: 'p-999',
          given_name: 'Mary',
          surname: 'Smith',
          birth_date: null,
          death_date: null,
          photo_url: null,
        })
      }
    >
      {label ?? 'Pick person'}
    </button>
  ),
}));

const familyWithNoSpouse1 = {
  id: 'f-1',
  spouse1_id: null,
  spouse2_id: 's2',
  spouse1: null,
  spouse2: { id: 's2', given_name: 'John', surname: 'Doe' },
  marriage_date: null,
  marriage_place: null,
  divorce_date: null,
  divorce_place: null,
  children: [],
};

describe('FamilyDetailPage — spouse assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows PersonPicker for empty spouse1 slot when canEdit', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => familyWithNoSpouse1,
    });

    render(
      <MemoryRouter initialEntries={['/families/f-1']}>
        <Routes>
          <Route path="/families/:id" element={<FamilyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    expect(screen.getByTestId('pick-spouse-1')).toBeInTheDocument();
  });

  it('calls PUT /api/v1/families/:id with spouse1_id on selection', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      callCount += 1;
      if (callCount === 1) {
        // Initial GET
        return Promise.resolve({
          ok: true,
          json: async () => familyWithNoSpouse1,
        });
      }
      if ((options?.method ?? 'GET') === 'PUT') {
        // PUT to assign spouse
        const body = JSON.parse(options?.body as string);
        expect(body.spouse1_id).toBe('p-999');
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...familyWithNoSpouse1,
            spouse1_id: 'p-999',
            spouse1: { id: 'p-999', given_name: 'Mary', surname: 'Smith' },
          }),
        });
      }
      // Re-fetch after assign
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ...familyWithNoSpouse1,
          spouse1_id: 'p-999',
          spouse1: { id: 'p-999', given_name: 'Mary', surname: 'Smith' },
        }),
      });
    });

    render(
      <MemoryRouter initialEntries={['/families/f-1']}>
        <Routes>
          <Route path="/families/:id" element={<FamilyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('pick-spouse-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('pick-spouse-1'));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const putCall = calls.find(
        (c: any) => (c[1]?.method ?? 'GET') === 'PUT'
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse(putCall![1]!.body as string).spouse1_id).toBe('p-999');
    });
  });
});
