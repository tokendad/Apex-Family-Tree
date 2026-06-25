import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// jsdom does not implement ResizeObserver
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

vi.mock('@/stores/canvasStore', () => ({
  useCanvasStore: vi.fn(() => ({
    zoom: 1, zoomIn: vi.fn(), zoomOut: vi.fn(), resetView: vi.fn(), fitToScreen: vi.fn(),
  })),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/Button/Button', () => ({ default: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button> }));

const { default: CanvasToolbar } = await import('./CanvasToolbar');

describe('CanvasToolbar filter dropdown', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the filter select with correct options', () => {
    render(<CanvasToolbar treeFilter="all" onTreeFilterChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: /filter tree/i });
    expect(select).toBeDefined();
    expect(screen.getByRole('option', { name: 'All' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Unconnected People' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Unconnected Trees' })).toBeDefined();
  });

  it('calls onTreeFilterChange when a new option is selected', () => {
    const onChange = vi.fn();
    render(<CanvasToolbar treeFilter="all" onTreeFilterChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: /filter tree/i }), {
      target: { value: 'unconnected-people' },
    });
    expect(onChange).toHaveBeenCalledWith('unconnected-people');
  });
});
