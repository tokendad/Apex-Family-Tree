import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArtifactsPage from './ArtifactsPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true }),
}));

vi.mock('@/stores/searchStore', () => ({
  useSearchStore: Object.assign(
    vi.fn((selector: (state: { globalQuery: string }) => unknown) => selector({ globalQuery: '' })),
    { getState: () => ({ globalQuery: '' }) }
  ),
}));

const TYPES = [
  { id: 'artifact_type_uncategorized', name: 'Uncategorized' },
  { id: 'artifact_type_photo', name: 'Photo' },
  { id: 'artifact_type_document', name: 'Document' },
];

const TYPE_COUNTS = [
  { id: 'artifact_type_uncategorized', name: 'Uncategorized', icon: 'help-circle', sort_order: 0, count: 2 },
  { id: 'artifact_type_photo', name: 'Photo', icon: 'image', sort_order: 10, count: 0 },
  { id: 'artifact_type_document', name: 'Document', icon: 'file-text', sort_order: 30, count: 0 },
];

function artifact(id: string, title: string) {
  return {
    id,
    title,
    summary: null,
    privacy_level: 'family',
    artifact_type_id: 'artifact_type_uncategorized',
    artifact_type_name: 'Uncategorized',
    evidence_classification_id: null,
    evidence_classification_name: null,
    original_date_text: null,
    creator_text: null,
    physical_location: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/artifacts/types')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: TYPES }) });
    }
    if (url.includes('/artifacts/type-counts')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: TYPE_COUNTS }) });
    }
    if (url.includes('/evidence-classifications')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    }
    if (init?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => ({ updated: 2 }) });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ data: [artifact('a-1', 'Scan One'), artifact('a-2', 'Scan Two')] }),
    });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

function listUrls() {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes('/api/v1/artifacts?'));
}

describe('ArtifactsPage type filter', () => {
  it('shows a chip per type with its count, including empty types', async () => {
    render(<ArtifactsPage />, { wrapper: MemoryRouter });

    const group = await screen.findByRole('group', { name: /filter artifacts by type/i });

    // Empty types stay visible rather than disappearing — that is what tells
    // the user which buckets still need filling.
    expect(within(group).getByRole('button', { name: /Uncategorized 2/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /Photo 0/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /Document 0/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /All 2/ })).toBeInTheDocument();
  });

  it('requests only the chosen type when a chip is clicked', async () => {
    render(<ArtifactsPage />, { wrapper: MemoryRouter });
    const group = await screen.findByRole('group', { name: /filter artifacts by type/i });

    await userEvent.click(within(group).getByRole('button', { name: /Photo 0/ }));

    await waitFor(() => {
      expect(listUrls().some((url) => url.includes('type=artifact_type_photo'))).toBe(true);
    });
  });

  it('marks the active chip as pressed', async () => {
    render(<ArtifactsPage />, { wrapper: MemoryRouter });
    const group = await screen.findByRole('group', { name: /filter artifacts by type/i });

    expect(within(group).getByRole('button', { name: /All 2/ })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(group).getByRole('button', { name: /Uncategorized 2/ }));

    await waitFor(() => {
      expect(within(group).getByRole('button', { name: /Uncategorized 2/ })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});

describe('ArtifactsPage bulk re-type', () => {
  it('sends the selected ids and chosen type', async () => {
    render(<ArtifactsPage />, { wrapper: MemoryRouter });
    await screen.findByText('Scan One');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Scan One' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Scan Two' }));
    await userEvent.selectOptions(screen.getByLabelText('Change type to'), 'artifact_type_document');
    await userEvent.click(screen.getByRole('button', { name: /Apply to 2/ }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH');
      expect(patch).toBeTruthy();
      expect(String(patch?.[0])).toBe('/api/v1/artifacts/bulk-type');
      expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({
        ids: ['a-1', 'a-2'],
        artifact_type_id: 'artifact_type_document',
      });
    });
  });

  it('selects and clears every shown artifact at once', async () => {
    render(<ArtifactsPage />, { wrapper: MemoryRouter });
    await screen.findByText('Scan One');

    // The checkbox carries an explicit aria-label, which takes precedence over
    // the adjacent count text as its accessible name.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all shown artifacts' }));
    expect(await screen.findByText('2 selected')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Clear selection' }));
    await waitFor(() => expect(screen.queryByText('2 selected')).not.toBeInTheDocument());
  });

  it('keeps Apply disabled until a target type is chosen', async () => {
    render(<ArtifactsPage />, { wrapper: MemoryRouter });
    await screen.findByText('Scan One');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Scan One' }));

    expect(screen.getByRole('button', { name: /Apply to 1/ })).toBeDisabled();
  });

  it('drops the selection when the type filter changes', async () => {
    render(<ArtifactsPage />, { wrapper: MemoryRouter });
    await screen.findByText('Scan One');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Scan One' }));
    expect(await screen.findByText('1 selected')).toBeInTheDocument();

    const group = screen.getByRole('group', { name: /filter artifacts by type/i });
    await userEvent.click(within(group).getByRole('button', { name: /Photo 0/ }));

    // Acting on rows that have scrolled out of the current filter would be a
    // surprise, so the selection is dropped rather than carried over.
    await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
  });
});
