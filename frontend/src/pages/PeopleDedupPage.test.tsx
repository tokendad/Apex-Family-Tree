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
  conflicts: [
    {
      field: 'deathDate',
      label: 'Death date',
      canonicalValue: null,
      duplicatePersonId: 'dupe',
      duplicateValue: '2 FEB 1970',
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
    return { ok: false, json: async () => ({ error: 'unexpected url' }) } as Response;
  });
});

describe('PeopleDedupPage', () => {
  it('scans, previews, and applies a people merge', async () => {
    render(<PeopleDedupPage />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByRole('button', { name: /scan for duplicates/i }));

    await waitFor(() => expect(screen.getAllByText('Strong')).toHaveLength(2));
    expect(screen.getByText(/Same normalized primary name/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/keep John Smith keep/i));
    fireEvent.click(screen.getByRole('button', { name: /preview merge/i }));

    expect(await screen.findByText(/2 events/i)).toBeInTheDocument();
    expect(screen.getByText(/Death date/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /apply merge/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/tools/people-dedup/apply',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByText(/Merged 1 duplicate person/)).toBeInTheDocument();
  });
});
