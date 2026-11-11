import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiAssistantPanel from './AiAssistantPanel';

let currentRole: 'admin' | 'editor' = 'editor';

vi.mock('@/contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'user@example.test', display_name: 'Test User', role: currentRole } }),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  currentRole = 'editor';
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

  it('submits an attached file as multipart FormData, with no explicit Content-Type, and renders unconfirmed_image citations', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fake-preview'), revokeObjectURL: vi.fn() });

    const proposal = {
      id: 'prop-file-1',
      intake_item_id: 'item-file-1',
      proposal_type: 'fact',
      payload: { citations: [{ quote: 'transcribed from the photo', citationStatus: 'unconfirmed_image' }], statement: 'Shown in the photo.', subjectRef: 'person_1' },
      confidence: null,
      decision: null,
      edited_payload: null,
      committed_object_id: null,
    };

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/intake' && (!init || init.method === undefined)) return jsonOk({ items: [] });
      if (url === '/api/v1/intake' && init?.method === 'POST') return jsonOk({ intakeItemId: 'item-file-1' });
      if (url === '/api/v1/intake/item-file-1') {
        return jsonOk({
          item: {
            id: 'item-file-1', source_text: '', status: 'awaiting_review', created_at: '2026-01-01',
            source_file_path: null, source_file_mime_type: 'image/jpeg', source_file_original_name: 'photo.jpg',
          },
          error: null,
        });
      }
      if (url === '/api/v1/intake/item-file-1/proposals') return jsonOk({ proposals: [proposal], conflicts: [] });
      return jsonErr(404, {});
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<AiAssistantPanel />);
    const file = new File(['fake-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, file);

    expect(screen.getByText(/photo\.jpg/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.advanceTimersByTimeAsync(2000);

    const submitCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/v1/intake' && (init as RequestInit)?.method === 'POST');
    expect(submitCall![1].body).toBeInstanceOf(FormData);
    expect((submitCall![1] as RequestInit).headers).toBeUndefined();

    expect(await screen.findByText(/from image, verify against the source/i)).toBeInTheDocument();
  });

  it('hides the Scan for Suggestions button for a non-admin', async () => {
    fetchMock.mockImplementation(() => jsonOk({ items: [] }));
    render(<AiAssistantPanel />);
    await screen.findByText(/paste research text below/i);
    expect(screen.queryByRole('button', { name: /scan for suggestions/i })).not.toBeInTheDocument();
  });

  it('tells the admin when a scan finds nothing new, rather than silently doing nothing', async () => {
    currentRole = 'admin';
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/intake' && (!init || init.method === undefined)) return jsonOk({ items: [] });
      if (url === '/api/v1/intake/scan-suggestions' && init?.method === 'POST') return jsonOk({ queued: 0 });
      return jsonErr(404, {});
    });

    render(<AiAssistantPanel />);
    await userEvent.click(await screen.findByRole('button', { name: /scan for suggestions/i }));

    expect(await screen.findByText(/nothing new to scan/i)).toBeInTheDocument();
  });

  it('shows the Scan for Suggestions button for an admin, and renders a suggested turn distinctly', async () => {
    currentRole = 'admin';
    const proposal = {
      id: 'prop-sugg-1',
      intake_item_id: 'item-sugg-1',
      proposal_type: 'fact',
      payload: { citations: [{ quote: 'John Smith was a sailor', citationStatus: 'verified' }], statement: 'John Smith was a sailor.', subjectRef: 'person_1' },
      confidence: null,
      decision: null,
      edited_payload: null,
      committed_object_id: null,
    };
    let scanned = false;

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/intake' && (!init || init.method === undefined)) {
        return jsonOk({
          items: scanned
            ? [{
                id: 'item-sugg-1', source_text: 'John Smith was a sailor.', status: 'awaiting_review', created_at: '2026-01-01',
                source_file_path: null, source_file_mime_type: null, source_file_original_name: null,
                source_artifact_id: 'artifact-1', trigger: 'suggested',
              }]
            : [],
        });
      }
      if (url === '/api/v1/intake/scan-suggestions' && init?.method === 'POST') {
        scanned = true;
        return jsonOk({ queued: 1 });
      }
      if (url === '/api/v1/intake/item-sugg-1/proposals') return jsonOk({ proposals: [proposal], conflicts: [] });
      return jsonErr(404, {});
    });

    render(<AiAssistantPanel />);
    const scanButton = await screen.findByRole('button', { name: /scan for suggestions/i });
    await userEvent.click(scanButton);

    expect(await screen.findByText('🔍 Suggested')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /from this artifact/i })).toHaveAttribute('href', '/artifacts/artifact-1');
    expect(await screen.findByText('John Smith was a sailor.')).toBeInTheDocument();
  });
});
