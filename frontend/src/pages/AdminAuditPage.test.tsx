import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAuditPage from './AdminAuditPage';

function entry(id: number, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    user_id: 'u1',
    action: 'update',
    entity_type: 'event',
    entity_id: `event-${id}`,
    old_values: JSON.stringify({ event_place: 'Culver City' }),
    new_values: JSON.stringify({ event_place: 'Las Vegas' }),
    ip_address: '203.0.113.9',
    created_at: '2026-10-11 12:00:00',
    user_email: 'wes@example.test',
    user_display_name: 'Wes',
    ...overrides,
  };
}

/** Records every audit request so a test can assert what was asked for. */
let requests: string[] = [];

function mockApi(pages: { data: unknown[]; next_cursor: string | null }[]) {
  let call = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/audit/facets')) {
      return { ok: true, status: 200, json: async () => ({ entityTypes: ['event'], actions: ['update'] }) } as Response;
    }
    requests.push(url);
    const page = pages[Math.min(call, pages.length - 1)];
    call += 1;
    return { ok: true, status: 200, json: async () => page } as Response;
  }));
}

beforeEach(() => { requests = []; });
afterEach(() => vi.unstubAllGlobals());

describe('AdminAuditPage', () => {
  it('shows the most recent 20 entries by default', async () => {
    mockApi([{ data: Array.from({ length: 20 }, (_, i) => entry(100 - i)), next_cursor: '81' }]);

    render(<AdminAuditPage />);

    await waitFor(() => expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(20));
    expect(requests[0]).toContain('limit=20');
    expect(requests[0]).not.toContain('cursor=');
  });

  it('expands an entry to show what changed, before and after', async () => {
    mockApi([{ data: [entry(1)], next_cursor: null }]);
    render(<AdminAuditPage />);

    await waitFor(() => expect(screen.getByText('event-1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { expanded: false }));

    const table = screen.getByRole('table');
    expect(within(table).getByText('event_place')).toBeInTheDocument();
    expect(within(table).getByText('Culver City')).toBeInTheDocument();
    expect(within(table).getByText('Las Vegas')).toBeInTheDocument();
  });

  it('appends the next page when asked for more', async () => {
    mockApi([
      { data: Array.from({ length: 20 }, (_, i) => entry(100 - i)), next_cursor: '81' },
      { data: Array.from({ length: 5 }, (_, i) => entry(80 - i)), next_cursor: null },
    ]);
    render(<AdminAuditPage />);

    await waitFor(() => expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(20));
    await userEvent.click(screen.getByRole('button', { name: /show 20 more/i }));

    await waitFor(() => expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(25));
    expect(requests[1]).toContain('cursor=81');
  });

  /* The trap: searching after loading more. Carrying the cursor would ask only
     for matches older than the last row already on screen, silently hiding
     every match above it. A new search must start a new list. */
  it('starts a fresh list when a search is run after loading more', async () => {
    mockApi([
      { data: Array.from({ length: 20 }, (_, i) => entry(100 - i)), next_cursor: '81' },
      { data: Array.from({ length: 5 }, (_, i) => entry(80 - i)), next_cursor: null },
      { data: [entry(42, { entity_id: 'match' })], next_cursor: null },
    ]);
    render(<AdminAuditPage />);

    await waitFor(() => expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(20));
    await userEvent.click(screen.getByRole('button', { name: /show 20 more/i }));
    await waitFor(() => expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(25));

    await userEvent.type(screen.getByRole('searchbox'), 'Walsh');

    await waitFor(() => expect(screen.getByText('match')).toBeInTheDocument());

    const searchRequest = requests[requests.length - 1];
    expect(searchRequest).toContain('q=Walsh');
    expect(searchRequest).not.toContain('cursor=');
    // Replaced, not appended: the 25 earlier rows are gone.
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(1);
  });

  it('drops the cursor when a filter changes too', async () => {
    mockApi([
      { data: Array.from({ length: 20 }, (_, i) => entry(100 - i)), next_cursor: '81' },
      { data: [entry(7)], next_cursor: null },
    ]);
    render(<AdminAuditPage />);

    await waitFor(() => expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(20));
    await userEvent.selectOptions(screen.getByLabelText('Filter by action'), 'update');

    await waitFor(() => expect(requests.length).toBeGreaterThan(1));
    const filtered = requests[requests.length - 1];
    expect(filtered).toContain('action=update');
    expect(filtered).not.toContain('cursor=');
  });

  it('hides system activity until asked for it', async () => {
    mockApi([{ data: [entry(1)], next_cursor: null }]);
    render(<AdminAuditPage />);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).not.toContain('include_system');

    await userEvent.click(screen.getByLabelText(/show system activity/i));

    await waitFor(() => expect(requests.length).toBeGreaterThan(1));
    expect(requests[requests.length - 1]).toContain('include_system=true');
  });

  it('explains an empty log rather than showing a blank page', async () => {
    mockApi([{ data: [], next_cursor: null }]);
    render(<AdminAuditPage />);

    await waitFor(() => expect(screen.getByText(/no changes recorded yet/i)).toBeInTheDocument());
  });

  /* The label rides under _meta precisely so it cannot be mistaken for a
     field that changed. Rendering it in the diff would show the log inventing
     an edit that nobody made. */
  it('names an entry from its metadata without showing it as a changed field', async () => {
    mockApi([{
      data: [entry(1, {
        old_values: JSON.stringify({ event_place: 'Culver City' }),
        new_values: JSON.stringify({ event_place: 'Las Vegas', _meta: { label: 'Marriage - 14 MAR 1983' } }),
      })],
      next_cursor: null,
    }]);
    render(<AdminAuditPage />);

    await waitFor(() => expect(screen.getByText('Marriage - 14 MAR 1983')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { expanded: false }));

    const table = screen.getByRole('table');
    expect(within(table).getByText('event_place')).toBeInTheDocument();
    expect(within(table).queryByText('_meta')).not.toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(2); // header plus the one real change
  });

  /* A delete entry outlives the record, so the name it carries is all there is. */
  it('names what was deleted, from the entry itself', async () => {
    mockApi([{
      data: [entry(1, {
        action: 'delete',
        entity_type: 'person',
        old_values: JSON.stringify({ id: 'p1', sex: 'F', notes: null }),
        new_values: JSON.stringify({ _meta: { label: 'Eunice Louise Lagor' } }),
      })],
      next_cursor: null,
    }]);
    render(<AdminAuditPage />);

    await waitFor(() => expect(screen.getByText('Eunice Louise Lagor')).toBeInTheDocument());
  });
});
