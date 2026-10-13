import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import FamilyPicker from './FamilyPicker';

const families = [
  {
    id: 'f1',
    spouse1: { given_name: 'Raymond', middle_name: 'Earl', surname: 'LeFort' },
    spouse2: { given_name: 'Eunice', middle_name: 'Louise', surname: 'Lagor' },
    marriage_date: '12 Jun 1948',
  },
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  global.fetch = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(
      url.includes('?q=')
        ? { ok: true, json: async () => ({ data: families }) }
        : { ok: true, json: async () => families[0] },
    ),
  );
});

afterEach(() => vi.useRealTimers());

/* Issue: the upload dialog listed every family by its hex id, because the list
   endpoint returns the couple as spouse1/spouse2 and the old label fell
   through to the id. */
describe('FamilyPicker', () => {
  it('finds a family by name and reports the one that was picked', async () => {
    const onSelect = vi.fn();
    render(<FamilyPicker value={null} onSelect={onSelect} onClear={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /select a family/i }));
    fireEvent.change(screen.getByLabelText('Search for a family'), {
      target: { value: 'lefort' },
    });
    await vi.advanceTimersByTimeAsync(400);

    const option = await screen.findByRole('option', { name: /Raymond Earl LeFort & Eunice Louise Lagor/ });
    fireEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }));
    // And the trigger now reads as the couple, not as a hash.
    expect(screen.getByRole('button', { name: /Raymond Earl LeFort & Eunice Louise Lagor/ }))
      .toBeInTheDocument();
  });

  it('searches the server rather than listing everything', async () => {
    render(<FamilyPicker value={null} onSelect={() => {}} onClear={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /select a family/i }));
    fireEvent.change(screen.getByLabelText('Search for a family'), {
      target: { value: 'lefort lagor' },
    });
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0]));
      expect(calls.some(url => url.includes('/api/v1/families?q=lefort%20lagor'))).toBe(true);
      expect(calls.some(url => url.includes('limit=500'))).toBe(false);
    });
  });

  it('waits for a second character before searching', async () => {
    render(<FamilyPicker value={null} onSelect={() => {}} onClear={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /select a family/i }));
    fireEvent.change(screen.getByLabelText('Search for a family'), { target: { value: 'l' } });
    await vi.advanceTimersByTimeAsync(400);

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('names the family it was handed by id', async () => {
    render(<FamilyPicker value="f1" onSelect={() => {}} onClear={() => {}} />);

    expect(await screen.findByText('Raymond Earl LeFort & Eunice Louise Lagor')).toBeInTheDocument();
    expect(screen.getByText(/m\. 12 Jun 1948/)).toBeInTheDocument();
  });

  it('can be cleared', async () => {
    const onClear = vi.fn();
    render(<FamilyPicker value="f1" onSelect={() => {}} onClear={onClear} />);

    await screen.findByText('Raymond Earl LeFort & Eunice Louise Lagor');
    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));

    expect(onClear).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /select a family/i })).toBeInTheDocument();
  });
});
