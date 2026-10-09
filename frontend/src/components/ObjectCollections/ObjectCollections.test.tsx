import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ObjectCollections from './ObjectCollections';

const membership = [
  {
    id: 'col-1',
    title: "Grandpa's Military Service",
    summary: null,
    cover_artifact_id: null,
    item_id: 'ci-1',
    caption: 'Discharge papers',
  },
];

/** Routes each URL this component touches to a canned response. */
function mockFetch(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/v1/collections/for-object/')) {
      return { ok: true, json: async () => ({ data: overrides.data ?? membership }) };
    }
    if (url.startsWith('/api/v1/search')) {
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'col-2', object_type: 'collection', title: 'Album', summary: null }],
        }),
      };
    }
    if (init?.method === 'POST' || init?.method === 'DELETE') {
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({ data: [] }) };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch() as unknown as typeof fetch;
});

function renderIt(props: Partial<React.ComponentProps<typeof ObjectCollections>> = {}) {
  return render(
    <MemoryRouter>
      <ObjectCollections objectId="artifact-1" canEdit canDelete {...props} />
    </MemoryRouter>,
  );
}

describe('ObjectCollections — membership from the object side (#26)', () => {
  it('lists the collections the object belongs to, with captions', async () => {
    renderIt();
    expect(await screen.findByText("Grandpa's Military Service")).toBeInTheDocument();
    expect(screen.getByText('Discharge papers')).toBeInTheDocument();
  });

  it('links each collection to its own page', async () => {
    renderIt();
    const link = await screen.findByRole('link', { name: "Grandpa's Military Service" });
    expect(link).toHaveAttribute('href', '/collections/col-1');
  });

  it('says so plainly when the object is in no collection', async () => {
    global.fetch = mockFetch({ data: [] }) as unknown as typeof fetch;
    renderIt();
    expect(await screen.findByText('Not in any collection yet.')).toBeInTheDocument();
  });

  it('offers no add or remove controls without permission', async () => {
    renderIt({ canEdit: false, canDelete: false });
    await screen.findByText("Grandpa's Military Service");
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  it('posts the object into the chosen collection, not a pasted id', async () => {
    const fetchMock = mockFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderIt();
    await screen.findByText("Grandpa's Military Service");

    // Nothing can be added until a collection has actually been chosen.
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('removes the collection_items row rather than the collection', async () => {
    const fetchMock = mockFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/collections/col-1/items/ci-1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('reports the membership back to the host page', async () => {
    const onChange = vi.fn();
    renderIt({ onChange });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(membership));
  });
});
