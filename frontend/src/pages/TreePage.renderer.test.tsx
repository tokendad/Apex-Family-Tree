import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TreePage from './TreePage';
import { useCanvasStore } from '@/stores/canvasStore';

// Only the choice of canvas is under test; the chrome and the two drawings
// are each covered by their own suites.
vi.mock('@/components/TreeCanvas/TreeCanvas', () => ({
  default: () => <div data-testid="classic-canvas" />,
}));
vi.mock('@/components/FamilyChartTree/FamilyChartTree', () => ({
  default: () => <div data-testid="family-chart-canvas" />,
}));
vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children, detail, showDetail }: { children: React.ReactNode; detail?: React.ReactNode; showDetail?: boolean }) => (
    <div>{children}{showDetail ? <div data-testid="detail-panel">{detail}</div> : null}</div>
  ),
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));
vi.mock('@/components/DetailPanel/DetailPanel', () => ({ default: () => <div>Detail</div> }));
vi.mock('@/components/CanvasLegend/CanvasLegend', () => ({ default: () => <div data-testid="legend" /> }));
vi.mock('@/components/CanvasToolbar/CanvasToolbar', () => ({
  default: ({ onAddPerson }: { onAddPerson: () => void }) => (
    <button onClick={onAddPerson}>Add Person</button>
  ),
}));
vi.mock('@/hooks/useTreeData', () => ({ useTreeData: () => ({ refetch: vi.fn() }) }));
// ContextMenu and the wizard read the signed-in user.
vi.mock('@/contexts/AuthContext.js', () => ({ useAuth: () => ({ user: { role: 'editor' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'editor' } }) }));

const person = (id: string) => ({
  id, given_name: id, middle_name: null, surname: 'Test', sex: 'U' as const,
  birth_date: null, death_date: null, is_living: true, is_private: false, photo_url: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ people: [], segments: [] }) });
  useCanvasStore.setState({
    nodes: [{ person: person('p1'), x: 0, y: 0, generation: 0 }],
    families: [],
    connectors: [],
    homePersonId: 'p1',
    selectedPersonId: null,
    isLoading: false,
  });
});

const renderAt = (props = {}) =>
  render(
    <MemoryRouter>
      <TreePage {...props} />
    </MemoryRouter>,
  );

describe('TreePage — which drawing it uses', () => {
  it('draws with family-chart by default, which is what "/" renders', () => {
    renderAt();
    expect(screen.getByTestId('family-chart-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('classic-canvas')).not.toBeInTheDocument();
  });

  it('draws with the classic canvas when asked, which is what /tree-classic renders', () => {
    renderAt({ renderer: 'classic' });
    expect(screen.getByTestId('classic-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('family-chart-canvas')).not.toBeInTheDocument();
  });

  it('keeps the legend with the classic canvas it belongs to', () => {
    renderAt({ renderer: 'classic' });
    expect(screen.getByTestId('legend')).toBeInTheDocument();
    renderAt();
    // family-chart draws its own cards, so the classic legend does not apply.
    expect(screen.getAllByTestId('legend')).toHaveLength(1);
  });
});

describe('TreePage — the page around the drawing survives the swap', () => {
  it('still offers Add Person with family-chart', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Add Person' })).toBeInTheDocument();
  });

  it('offers the layout and depth controls only for family-chart', () => {
    renderAt();
    expect(screen.getByText('Layout')).toBeInTheDocument();
    expect(screen.getByText('Depth')).toBeInTheDocument();
  });

  it('has no chart controls on the classic canvas', () => {
    renderAt({ renderer: 'classic' });
    expect(screen.queryByText('Layout')).not.toBeInTheDocument();
  });

  it('opens the detail panel when a person is selected, under either drawing', () => {
    useCanvasStore.setState({ selectedPersonId: 'p1' });
    renderAt();
    expect(screen.getByTestId('detail-panel')).toBeInTheDocument();
  });
});
