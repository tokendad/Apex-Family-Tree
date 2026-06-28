import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarriageEditor from './MarriageEditor';
import { useModalStore } from '@/components/modals/modalStore';

vi.mock('@/components/entity-pickers/PersonPicker', () => ({
  default: ({
    label,
    onSelect,
  }: {
    label?: string;
    onSelect: (p: { id: string; displayName: string }) => void;
    onClear?: () => void;
  }) => (
    <button
      type="button"
      data-testid={`pick-${label?.toLowerCase().replace(/\s/g, '-')}`}
      onClick={() => onSelect({ id: 'p2', displayName: 'Jane Doe' })}
    >
      Pick {label}
    </button>
  ),
}));

const noop = () => {};

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MarriageEditor', () => {
  it('creates a family when a spouse is selected', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/families/person/p2/active')) {
        return {
          ok: true,
          json: async () => ({ activeMarriages: [] }),
        } as Response;
      }
      if (url === '/api/v1/families') {
        return {
          ok: true,
          json: async () => ({ id: 'f1' }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const onClose = vi.fn();
    render(<MarriageEditor personId="p1" personName="John Smith" modalId="m1" onClose={onClose} />);

    fireEvent.click(screen.getByTestId('pick-spouse'));
    fireEvent.change(screen.getByLabelText(/Marriage Date/i), { target: { value: '14 Jun 1910' } });
    fireEvent.change(screen.getByLabelText(/Marriage Place/i), { target: { value: 'Boston, MA' } });
    fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: 'Ceremony at the chapel' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'created', entityType: 'marriage' })
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/families',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"marriage_description":"Ceremony at the chapel"'),
      })
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/events/people/p1/events'))).toBe(false);
  });

  it('falls back to a person event when no spouse is selected', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'e1' }),
    } as Response);

    const onClose = vi.fn();
    render(<MarriageEditor personId="p1" personName="John Smith" modalId="m1" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/Marriage Date/i), { target: { value: '14 Jun 1910' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'created', entityType: 'marriage' })
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/events/people/p1/events',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"event_type":"marriage"'),
      })
    );
  });
});
