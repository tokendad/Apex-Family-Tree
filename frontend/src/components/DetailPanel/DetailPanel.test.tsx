import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
});
