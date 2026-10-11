import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ContextMenu from './ContextMenu';
import { useCanvasStore } from '@/stores/canvasStore';

vi.mock('@/contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { role: 'editor' } }),
}));

beforeEach(() => {
  useCanvasStore.setState({ contextMenuPosition: { x: 10, y: 20, personId: 'p1' } });
});

const names = () => screen.getAllByRole('menuitem').map((b) => b.textContent);

describe('ContextMenu — default behaviour is unchanged', () => {
  it('shows the entries that work, and not the ones that do not', () => {
    render(<ContextMenu />);
    expect(names()).toEqual(['View Details', 'Edit Person', 'Add Parent', 'Add Spouse', 'Add Child']);
  });

  it('still shows all the add entries when the handlers are supplied', () => {
    render(
      <ContextMenu
        onEditPerson={vi.fn()}
        onAddParent={vi.fn()}
        onAddSpouse={vi.fn()}
        onAddChild={vi.fn()}
      />,
    );
    expect(names()).toContain('Add Parent');
  });
});

describe('ContextMenu — hideUnavailable', () => {
  it('omits entries this page cannot carry out', () => {
    render(<ContextMenu hideUnavailable onEditPerson={vi.fn()} />);
    expect(names()).toEqual(['View Details', 'Edit Person']);
  });

  it('never offers an action that would silently do nothing', () => {
    render(<ContextMenu hideUnavailable />);
    for (const label of ['Add Parent', 'Add Spouse', 'Add Child', 'Set as Home Person']) {
      expect(screen.queryByRole('menuitem', { name: label })).not.toBeInTheDocument();
    }
  });
});

describe('ContextMenu — View Details', () => {
  it('selects the person when the page has a detail panel', () => {
    render(<ContextMenu />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'View Details' }));
    expect(useCanvasStore.getState().selectedPersonId).toBe('p1');
  });

  it('defers to the page when one is supplied, instead of selecting', () => {
    const onViewDetails = vi.fn();
    render(<ContextMenu onViewDetails={onViewDetails} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'View Details' }));
    expect(onViewDetails).toHaveBeenCalledWith('p1');
  });

  it('closes after acting', () => {
    render(<ContextMenu onEditPerson={vi.fn()} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit Person' }));
    expect(useCanvasStore.getState().contextMenuPosition).toBeNull();
  });
});

describe('ContextMenu — entries that used to do nothing', () => {
  // Both cases were empty `break`s with no prop to supply them, so the menu
  // offered a Set as Home Person that did not and a red Delete Person that
  // did not. On a phone, where a long press raises this menu, Delete sat
  // under the thumb.
  it('offers Set as Home Person only when a page can do it', () => {
    render(<ContextMenu />);
    expect(screen.queryByRole('menuitem', { name: 'Set as Home Person' })).not.toBeInTheDocument();

    render(<ContextMenu onSetHomePerson={vi.fn()} />);
    expect(screen.getAllByRole('menuitem', { name: 'Set as Home Person' })).toHaveLength(1);
  });

  it('calls back with the person when Set as Home Person is chosen', () => {
    const onSetHomePerson = vi.fn();
    render(<ContextMenu onSetHomePerson={onSetHomePerson} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Set as Home Person' }));
    expect(onSetHomePerson).toHaveBeenCalledWith('p1');
  });

  it('never shows Delete Person, because deleting is not built', () => {
    render(<ContextMenu onEditPerson={vi.fn()} onSetHomePerson={vi.fn()} />);
    expect(screen.queryByRole('menuitem', { name: 'Delete Person' })).not.toBeInTheDocument();
  });
});
