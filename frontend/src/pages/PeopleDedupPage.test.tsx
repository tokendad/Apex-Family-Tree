import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PeopleDedupPage from './PeopleDedupPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));

const scanResponse = {
  groups: [
    {
      id: 'dupe__keep',
      confidence: 'strong',
      reasons: ['Same normalized primary name', 'Same birth year'],
      matchScore: 90,
      people: [
        {
          id: 'keep',
          displayName: 'John Smith',
          birthDate: '1 JAN 1900',
          deathDate: null,
          relationshipCount: 1,
          sourceCount: 1,
          mediaCount: 0,
        },
        {
          id: 'dupe',
          displayName: 'John Smith',
          birthDate: '1 JAN 1900',
          deathDate: '2 FEB 1970',
          relationshipCount: 2,
          sourceCount: 2,
          mediaCount: 1,
        },
      ],
    },
  ],
};

const previewResponse = {
  groupId: 'dupe__keep',
  canonicalPersonId: 'keep',
  duplicatePersonIds: ['dupe'],
  comparisons: [
    {
      field: 'fullName',
      label: 'Full name',
      status: 'match',
      hasSelection: false,
      canonicalValue: 'John Smith',
      duplicatePersonId: 'dupe',
      duplicateValue: 'John Smith',
    },
    {
      field: 'deathDate',
      label: 'Death date',
      status: 'missing',
      hasSelection: true,
      canonicalValue: null,
      duplicatePersonId: 'dupe',
      duplicateValue: '2 FEB 1970',
    },
    {
      field: 'birthPlace',
      label: 'Birth place',
      status: 'different',
      hasSelection: true,
      canonicalValue: 'Boston, MA',
      duplicatePersonId: 'dupe',
      duplicateValue: 'Cambridge, MA',
    },
    {
      field: 'spouse',
      label: 'Spouse',
      status: 'missing',
      hasSelection: false,
      canonicalValue: null,
      duplicatePersonId: 'dupe',
      duplicateValue: 'Jane Smith',
    },
  ],
  transferCounts: {
    names: 1,
    events: 2,
    families: 2,
    sourceCitations: 2,
    mediaLinks: 1,
    mediaRegions: 1,
    userHomePeople: 0,
    exportScopes: 0,
  },
};

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/scan')) {
      return { ok: true, json: async () => scanResponse } as Response;
    }
    if (url.endsWith('/preview')) {
      return { ok: true, json: async () => previewResponse } as Response;
    }
    if (url.endsWith('/apply')) {
      return { ok: true, json: async () => ({ ...previewResponse, mergedPersonIds: ['dupe'] }) } as Response;
    }
    if (url.endsWith('/dismiss')) {
      return { ok: true, json: async () => ({ dismissed: 1 }) } as Response;
    }
    return { ok: false, json: async () => ({ error: 'unexpected url' }) } as Response;
  });
});

describe('PeopleDedupPage', () => {
  it('scans, compares fields side by side, and requires a choice before reviewing the merge', async () => {
    render(<PeopleDedupPage />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByRole('button', { name: /scan for duplicates/i }));

    await waitFor(() => expect(screen.getAllByText('Strong')).toHaveLength(2));
    expect(screen.getByText(/Same normalized primary name/)).toBeInTheDocument();
    expect(screen.getByText(/Likely Match: 90%/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/keep John Smith keep/i));
    fireEvent.click(screen.getByRole('button', { name: /preview merge/i }));

    expect(await screen.findByText(/2 events/i)).toBeInTheDocument();
    expect(screen.getByText('Death date')).toBeInTheDocument();
    // The different (red) birthPlace row has no default selection, so Review Merge is blocked.
    expect(screen.getByRole('button', { name: /^review merge$/i })).toBeDisabled();
    expect(screen.getByText(/resolve 1 more field/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /use this: cambridge, ma/i }));
    expect(screen.getByRole('button', { name: /^review merge$/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /^review merge$/i }));
    expect(await screen.findByText(/will survive the merge/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm merge/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/tools/people-dedup/apply',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByText(/Merged 1 duplicate person/)).toBeInTheDocument();
  });

  it('dismisses a group as different people and removes it from the list (#76)', async () => {
    render(<PeopleDedupPage />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByRole('button', { name: /scan for duplicates/i }));
    await waitFor(() => expect(screen.getAllByText('Strong')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /not duplicates/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/tools/people-dedup/dismiss',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ groupId: 'dupe__keep', personIds: ['keep', 'dupe'] }),
        }),
      );
    });

    // The group's own only instance of its name is the group-list entry;
    // once dismissed the whole review panel for it is gone too.
    await waitFor(() => expect(screen.queryByText(/Review candidate group/i)).not.toBeInTheDocument());
    expect(screen.getByText(/No scan results yet/i)).toBeInTheDocument();
  });
});
