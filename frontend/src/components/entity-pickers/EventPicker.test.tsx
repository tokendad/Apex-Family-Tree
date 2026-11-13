import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventPicker from './EventPicker';

const events = [
  {
    id: 'e1',
    event_type: 'wake',
    event_date: '12 Jun 2010',
    event_place: 'Lefort Funeral Home',
    person: { given_name: 'Raymond', middle_name: 'Earl', surname: 'LeFort' },
    family: null,
  },
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  global.fetch = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(
      url.includes('?q=')
        ? { ok: true, json: async () => ({ data: events }) }
        : { ok: true, json: async () => events[0] },
    ),
  );
});

afterEach(() => vi.useRealTimers());

/* Issue: the Connections tab listed every event in the tree as "Type - date",
   with no way to tell two people's wakes apart once the tree had more than a
   handful of them. */
describe('EventPicker', () => {
  it('finds an event by name and reports the one that was picked', async () => {
    const onSelect = vi.fn();
    render(<EventPicker value={null} onSelect={onSelect} onClear={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /select an event/i }));
    fireEvent.change(screen.getByLabelText('Search for an event'), {
      target: { value: 'lefort' },
    });
    await vi.advanceTimersByTimeAsync(400);

    const option = await screen.findByRole('option', { name: /Wake.*Raymond Earl LeFort/s });
    fireEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
    expect(screen.getByRole('button', { name: /Wake.*Raymond Earl LeFort/s })).toBeInTheDocument();
  });

  it('searches the server rather than listing everything', async () => {
    render(<EventPicker value={null} onSelect={() => {}} onClear={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /select an event/i }));
    fireEvent.change(screen.getByLabelText('Search for an event'), {
      target: { value: 'lefort wake' },
    });
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0]));
      expect(calls.some(url => url.includes('/api/v1/events?q=lefort%20wake'))).toBe(true);
      expect(calls.some(url => url.includes('limit=500'))).toBe(false);
    });
  });

  it('waits for a second character before searching', async () => {
    render(<EventPicker value={null} onSelect={() => {}} onClear={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /select an event/i }));
    fireEvent.change(screen.getByLabelText('Search for an event'), { target: { value: 'l' } });
    await vi.advanceTimersByTimeAsync(400);

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('names the event it was handed by id, including who it belongs to', async () => {
    render(<EventPicker value="e1" onSelect={() => {}} onClear={() => {}} />);

    expect(await screen.findByText(/Wake/)).toBeInTheDocument();
    expect(screen.getByText(/Raymond Earl LeFort/)).toBeInTheDocument();
    expect(screen.getByText(/12 Jun 2010/)).toBeInTheDocument();
  });

  it('can be cleared', async () => {
    const onClear = vi.fn();
    render(<EventPicker value="e1" onSelect={() => {}} onClear={onClear} />);

    await screen.findByText(/Wake/);
    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));

    expect(onClear).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /select an event/i })).toBeInTheDocument();
  });
});
