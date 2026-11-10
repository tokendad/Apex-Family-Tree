import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiAssistantPanel from './AiAssistantPanel';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

function jsonOk(body: unknown) {
  return Promise.resolve({ ok: true, json: async () => body });
}
function jsonErr(status: number, body: unknown) {
  return Promise.resolve({ ok: false, status, json: async () => body });
}

describe('AiAssistantPanel', () => {
  it('renders a clear error on the turn when extraction fails (e.g. no API key configured)', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/intake' && (!init || init.method === undefined)) return jsonOk({ items: [] });
      if (url === '/api/v1/intake' && init?.method === 'POST') return jsonOk({ intakeItemId: 'item-1' });
      if (url === '/api/v1/intake/item-1') {
        return jsonOk({ item: { id: 'item-1', source_text: 'John Smith.', status: 'failed', created_at: '2026-01-01' }, error: 'No LLM API key is configured.' });
      }
      return jsonErr(404, {});
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<AiAssistantPanel />);
    const input = screen.getByPlaceholderText(/paste research text/i);
    await userEvent.type(input, 'John Smith.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await vi.advanceTimersByTimeAsync(2000);

    expect(await screen.findByText('No LLM API key is configured.')).toBeInTheDocument();
  });

  it('shows proposal cards once extraction succeeds, and lets the reviewer accept and commit', async () => {
    const proposal = {
      id: 'prop-1',
      intake_item_id: 'item-2',
      proposal_type: 'fact',
      payload: { citations: [{ quote: 'John Smith was a sailor', citationStatus: 'verified' }], statement: 'John Smith was a sailor.', subjectRef: 'person_1' },
      confidence: null,
      decision: null,
      edited_payload: null,
      committed_object_id: null,
    };
    let decided = false;

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/intake' && (!init || init.method === undefined)) return jsonOk({ items: [] });
      if (url === '/api/v1/intake' && init?.method === 'POST') return jsonOk({ intakeItemId: 'item-2' });
      if (url === '/api/v1/intake/item-2') return jsonOk({ item: { id: 'item-2', source_text: 'John Smith was a sailor.', status: 'awaiting_review', created_at: '2026-01-01' }, error: null });
      if (url === '/api/v1/intake/item-2/proposals' && (!init || init.method === undefined)) {
        return jsonOk({ proposals: [{ ...proposal, decision: decided ? 'accept' : null }], conflicts: [] });
      }
      if (url === '/api/v1/intake/item-2/proposals/prop-1' && init?.method === 'POST') {
        decided = true;
        return jsonOk({ proposal: { ...proposal, decision: 'accept' } });
      }
      if (url === '/api/v1/intake/item-2/commit' && init?.method === 'POST') {
        return jsonOk({ committed: 1, conflicts: 0 });
      }
      return jsonErr(404, {});
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<AiAssistantPanel />);
    const input = screen.getByPlaceholderText(/paste research text/i);
    await userEvent.type(input, 'John Smith was a sailor.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.advanceTimersByTimeAsync(2000);

    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    const commitButton = await screen.findByRole('button', { name: /commit accepted/i });
    await userEvent.click(commitButton);

    expect(await screen.findByText('Committed to the tree.')).toBeInTheDocument();
  });

  it('does not duplicate the turn when resubmitting identical text returns the same intake item id', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/intake' && (!init || init.method === undefined)) return jsonOk({ items: [] });
      if (url === '/api/v1/intake' && init?.method === 'POST') return jsonOk({ intakeItemId: 'item-3' });
      if (url === '/api/v1/intake/item-3') {
        return jsonOk({ item: { id: 'item-3', source_text: 'Same text.', status: 'awaiting_review', created_at: '2026-01-01' }, error: null });
      }
      if (url === '/api/v1/intake/item-3/proposals') return jsonOk({ proposals: [], conflicts: [] });
      return jsonErr(404, {});
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<AiAssistantPanel />);
    const input = screen.getByPlaceholderText(/paste research text/i);

    await userEvent.type(input, 'Same text.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => expect(screen.getAllByText('Same text.')).toHaveLength(1));

    await userEvent.type(input, 'Same text.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.advanceTimersByTimeAsync(2000);

    expect(screen.getAllByText('Same text.')).toHaveLength(1);
  });
});
