import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TreeIssuesPage from './TreeIssuesPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children, sidebar }: { children: React.ReactNode; sidebar?: React.ReactNode }) => (
    <div>
      {sidebar}
      {children}
    </div>
  ),
}));

vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));

const permissions = vi.hoisted(() => ({
  canEdit: true,
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => permissions,
}));

const issueResponse = {
  data: [
    {
      id: 'issue-1',
      type: 'multiple_active_marriages',
      severity: 'high',
      status: 'open',
      title: 'John Doe has 2 active marriages',
      summary: 'This person appears in more than one family with no divorce date recorded.',
      primary_entity_type: 'person',
      primary_entity_id: 'p1',
      related_entities_json: JSON.stringify([{ type: 'family', id: 'fam-a', label: 'John and Jane' }]),
      fingerprint: 'multiple-active-marriages:p1',
      detected_at: '2026-06-25 17:00:00.000',
      last_seen_at: '2026-06-25 17:00:00.000',
      resolved_at: null,
      dismissed_at: null,
      note: null,
    },
  ],
  next_cursor: null,
};

const summaryResponse = {
  open: 1,
  bySeverity: { high: 1, medium: 0, low: 0 },
  byType: { multiple_active_marriages: 1 },
  lastScanAt: '2026-06-25 17:00:00.000',
};

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/summary')) {
      return new Response(JSON.stringify(summaryResponse), { status: 200 });
    }
    if (url.includes('/scan')) {
      return new Response(JSON.stringify({ detected: 1, created: 0, updated: 1, reopened: 0, dismissed: 0, open: 1 }), { status: 200 });
    }
    if (init?.method === 'PATCH') {
      return new Response(JSON.stringify({ ...issueResponse.data[0], status: 'resolved' }), { status: 200 });
    }
    return new Response(JSON.stringify(issueResponse), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('TreeIssuesPage', () => {
  beforeEach(() => {
    permissions.canEdit = true;
    vi.restoreAllMocks();
    mockFetch();
  });

  it('renders the issue dashboard with affected record links', async () => {
    render(<TreeIssuesPage />, { wrapper: MemoryRouter });

    expect(await screen.findByRole('heading', { name: 'Tree Issues' })).toBeInTheDocument();
    expect(screen.getByText('1 open')).toBeInTheDocument();
    expect(screen.getByText('John Doe has 2 active marriages')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open affected person/i })).toHaveAttribute('href', '/people/p1');
    expect(screen.getByRole('link', { name: /john and jane/i })).toHaveAttribute('href', '/families/fam-a');
  });

  it('shows scan controls only to editors', async () => {
    permissions.canEdit = false;

    render(<TreeIssuesPage />, { wrapper: MemoryRouter });

    await screen.findByText('John Doe has 2 active marriages');
    expect(screen.queryByRole('button', { name: /scan tree/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resolve/i })).not.toBeInTheDocument();
  });

  it('lets editors scan and refresh issue data', async () => {
    const fetchMock = mockFetch();
    render(<TreeIssuesPage />, { wrapper: MemoryRouter });

    const scanButton = await screen.findByRole('button', { name: /scan tree/i });
    fireEvent.click(scanButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/tools/tree-issues/scan', expect.objectContaining({ method: 'POST' })));
  });
});
