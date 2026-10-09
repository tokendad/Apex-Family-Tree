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
  it('shows every entry when no page opts out', () => {
    render(<ContextMenu />);
    expect(names()).toEqual([
      'View Details',
      'Edit Person',
      'Add Parent',
      'Add Spouse',
      'Add Child',
      'Set as Home Person',
    ]);
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
    expect(names()).toContain('Set as Home Person');
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
