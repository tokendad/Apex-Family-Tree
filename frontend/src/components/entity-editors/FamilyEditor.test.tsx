import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useModalStore } from '@/components/modals/modalStore';
import FamilyEditor from './FamilyEditor';

vi.mock('@/components/entity-pickers/PersonPicker', () => ({
  default: ({
    label,
    onSelect,
  }: {
    label?: string;
    value?: string | null;
    onSelect: (p: { id: string; given_name: string | null; surname: string | null; birth_date: string | null; death_date: string | null; photo_url: string | null }) => void;
    onClear?: () => void;
  }) => (
    <div>
      <span>{label}</span>
      <button
        data-testid={`pick-${label?.toLowerCase().replace(/\s/g, '-')}`}
        onClick={() =>
          onSelect({ id: 'p1', given_name: 'Mary', surname: 'Johnson', birth_date: null, death_date: null, photo_url: null })
        }
      >
        Pick {label}
      </button>
    </div>
  ),
}));

const noop = () => {};

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FamilyEditor', () => {
  it('renders a dialog with spouse pickers', () => {
    render(<FamilyEditor mode="create" modalId="m1" onClose={noop} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Add Family')).toBeInTheDocument();
    expect(screen.getByText('Spouse 1')).toBeInTheDocument();
    expect(screen.getByText('Spouse 2')).toBeInTheDocument();
  });

  it('calls onClose with cancelled when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<FamilyEditor mode="create" modalId="m1" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledWith({ action: 'cancelled' });
  });

  it('saves family with selected spouses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'f1',
        spouse1_id: 'p1',
        spouse2_id: null,
        marriage_date: null,
        marriage_place: null,
      }),
    } as Response);
    const onClose = vi.fn();
    render(<FamilyEditor mode="create" modalId="m1" onClose={onClose} />);

    await waitFor(() => {
      fireEvent.click(screen.getByTestId('pick-spouse-1'));
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'created', entityType: 'family' })
      );
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/families',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"spouse1_id":"p1"'),
      })
    );
  });

  it('shows an error when save fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Failed to create family' }),
    } as Response);
    render(<FamilyEditor mode="create" modalId="m1" onClose={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to create family');
    });
  });
});
