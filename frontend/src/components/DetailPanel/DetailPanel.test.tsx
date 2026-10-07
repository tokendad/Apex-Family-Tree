import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DetailPanel from './DetailPanel';

const setSelectedPerson = vi.fn();

const person = {
  id: 'person-1',
  given_name: 'Walter',
  surname: 'LeFort',
  sex: 'M',
  is_living: 1,
};

vi.mock('@/stores/canvasStore', () => ({
  useCanvasStore: () => ({
    selectedPersonId: 'person-1',
    nodes: [{ person }],
    families: [],
    setSelectedPerson,
  }),
}));

vi.mock('@/components/Avatar/Avatar', () => ({
  default: ({ name }: { name: string }) => <span>{name}</span>,
}));

const mediaItem = { id: 'media-1', title: 'Grandpa funeral', filename: 'rita.jpg' };

function mockMedia(items: unknown[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => items,
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  mockMedia([]);
});

describe('DetailPanel', () => {
  it('asks to edit the selected person', async () => {
    // The Edit button shipped with no onClick at all, so clicking it did
    // nothing and gave no hint why.
    const onEditPerson = vi.fn();
    render(<DetailPanel onEditPerson={onEditPerson} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEditPerson).toHaveBeenCalledWith('person-1');
  });

  it('closes by clearing the selection', async () => {
    render(<DetailPanel onEditPerson={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(setSelectedPerson).toHaveBeenCalledWith(null);
  });

  it("shows the person's media instead of a hardcoded placeholder", async () => {
    // The panel previously rendered a fixed "No media" block, so someone with
    // photographs was still told they had none.
    mockMedia([mediaItem]);
    render(<DetailPanel onEditPerson={vi.fn()} />);

    const thumb = await screen.findByRole('img', { name: 'Grandpa funeral' });
    expect(thumb).toHaveAttribute('src', '/api/v1/media/media-1');
    expect(screen.queryByText('No media')).not.toBeInTheDocument();
  });

  it('says No media only when there genuinely is none', async () => {
    mockMedia([]);
    render(<DetailPanel onEditPerson={vi.fn()} />);

    expect(await screen.findByText('No media')).toBeInTheDocument();
  });

  it('keeps the rest of the panel when media cannot be loaded', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    render(<DetailPanel onEditPerson={vi.fn()} />);

    // A media failure must not blank a panel that is mostly relationship data.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument());
    expect(screen.getByText('No media')).toBeInTheDocument();
  });
});
