import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useModalStore } from '@/components/modals/modalStore';
import ModalManager from '@/components/modals/ModalManager';
import PersonPicker from './PersonPicker';

vi.mock('@/components/PersonSearch/PersonSearch', () => ({
  default: ({
    onCreateNew,
  }: {
    onSelect: (p: { id: string; given_name: string | null; surname: string | null; birth_date: string | null; death_date: string | null; photo_url: string | null }) => void;
    onCreateNew?: () => void;
    placeholder?: string;
  }) => (
    <button type="button" data-testid="create-new" onClick={onCreateNew}>
      Create New
    </button>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

describe('PersonPicker create-new workflow', () => {
  it('opens PersonEditor and selects the created person', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'p-new',
        sex: 'U',
        names: [{ given_name: 'Ada', surname: 'Lovelace', is_primary: 1 }],
      }),
    } as Response);

    const onSelect = vi.fn();
    render(
      <>
        <PersonPicker label="Spouse" defaultSearch="Ada" onSelect={onSelect} />
        <ModalManager />
      </>
    );

    fireEvent.click(screen.getByText('Select a person…'));
    fireEvent.click(screen.getByTestId('create-new'));

    expect(screen.getByRole('dialog')).toHaveTextContent('Add Person');
    expect(screen.getByLabelText('Given Name')).toHaveValue('Ada');

    fireEvent.change(screen.getByLabelText('Surname'), { target: { value: 'Lovelace' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'p-new',
          given_name: 'Ada',
          surname: 'Lovelace',
        })
      );
    });
  });
});
