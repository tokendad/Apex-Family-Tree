import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TreePage from './TreePage';
import { useCanvasStore } from '@/stores/canvasStore';

// The drawing is stood in for by a button per person, so a selection can be
// made without running family-chart itself.
vi.mock('@/components/FamilyChartTree/FamilyChartTree', () => ({
  default: ({ persons, mainPersonId, onPersonSelect }: {
    persons: Array<{ id: string }>;
    mainPersonId: string | null;
    onPersonSelect?: (id: string) => void;
  }) => (
    <div data-testid="chart" data-main={mainPersonId ?? ''}>
      {persons.map((p) => (
        <button key={p.id} onClick={() => onPersonSelect?.(p.id)}>select {p.id}</button>
      ))}
    </div>
  ),
}));
vi.mock('@/components/TreeCanvas/TreeCanvas', () => ({ default: () => <div /> }));
vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));
vi.mock('@/components/DetailPanel/DetailPanel', () => ({ default: () => <div>Detail</div> }));
vi.mock('@/components/CanvasLegend/CanvasLegend', () => ({ default: () => <div /> }));
vi.mock('@/components/CanvasToolbar/CanvasToolbar', () => ({
  default: ({ onGoHome, onTreeFilterChange }: {
    onGoHome?: () => void;
    onTreeFilterChange?: (filter: string) => void;
  }) => (
    <>
      <button onClick={onGoHome}>Center on home person</button>
      <select
        aria-label="Filter tree"
        defaultValue="all"
        onChange={(e) => onTreeFilterChange?.(e.target.value)}
      >
        <option value="all">All</option>
        <option value="unconnected-people">Unconnected People</option>
      </select>
    </>
  ),
}));
/* The refetch identity must be stable across renders: TreePage has an effect
   that depends on it, so a fresh vi.fn() each render re-runs that effect
   forever. */
const { refetchMock } = vi.hoisted(() => ({ refetchMock: vi.fn() }));
vi.mock('@/hooks/useTreeData', () => ({ useTreeData: () => ({ refetch: refetchMock }) }));
vi.mock('@/contexts/AuthContext.js', () => ({ useAuth: () => ({ user: { role: 'editor' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'editor' } }) }));

const person = (id: string) => ({
  id, given_name: id, middle_name: null, surname: 'Test', sex: 'U' as const,
  birth_date: null, death_date: null, is_living: false, is_private: false, photo_url: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ people: [], segments: [] }) });
  useCanvasStore.setState({
    nodes: [
      { person: person('home-person'), x: 0, y: 0, generation: 0 },
      { person: person('far-person'), x: 0, y: 0, generation: 0 },
    ],
    families: [], connectors: [],
    homePersonId: 'home-person', treeRootId: null, selectedPersonId: null,
    generations: 4, isLoading: false,
  });
});

const renderPage = () => render(<MemoryRouter><TreePage /></MemoryRouter>);

describe('TreePage — the Depth control', () => {
  it('widens the data fetched, not only the levels drawn', () => {
    renderPage();
    // Before: the dropdown moved alone and the request stayed four deep, so
    // the drawing stopped at whoever sat on the edge of that payload.
    fireEvent.change(screen.getByLabelText('Depth'), { target: { value: '10' } });
    expect(useCanvasStore.getState().generations).toBeGreaterThanOrEqual(10);
  });

  it('starts wide enough without waiting for anyone to touch the control', () => {
    // changeDepth only fires on an interaction, so if the store's default
    // fell below the floor it enforces, the first load -- the one everybody
    // sees -- would be drawn from a payload too thin and stop at whoever sat
    // on its edge. That was the original bug.
    useCanvasStore.setState(useCanvasStore.getInitialState());
    expect(useCanvasStore.getState().generations).toBeGreaterThanOrEqual(6);
  });

  it('keeps enough headroom at shallow settings for spouses, who also cost a step', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Depth'), { target: { value: '1' } });
    expect(useCanvasStore.getState().generations).toBeGreaterThanOrEqual(6);
  });
});

describe('TreePage — centring the tree on someone', () => {
  it('re-roots the tree on the person selected', () => {
    renderPage();
    fireEvent.click(screen.getByText('select far-person'));

    expect(useCanvasStore.getState().treeRootId).toBe('far-person');
    expect(useCanvasStore.getState().selectedPersonId).toBe('far-person');
  });

  it('leaves the home person alone when re-rooting', () => {
    renderPage();
    fireEvent.click(screen.getByText('select far-person'));
    expect(useCanvasStore.getState().homePersonId).toBe('home-person');
  });

  it('draws the chart around the person selected', () => {
    renderPage();
    fireEvent.click(screen.getByText('select far-person'));
    expect(screen.getByTestId('chart').getAttribute('data-main')).toBe('far-person');
  });

  it('goes back to the home person, dropping the root and the selection', () => {
    useCanvasStore.setState({ treeRootId: 'far-person', selectedPersonId: 'far-person' });
    renderPage();

    fireEvent.click(screen.getByText('Center on home person'));

    expect(useCanvasStore.getState().treeRootId).toBeNull();
    expect(useCanvasStore.getState().selectedPersonId).toBeNull();
  });

  it('does not re-root while a filter is showing its own list of people', async () => {
    // That view replaces the node list with its own; give it someone to show.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ people: [person('far-person')] }),
    }) as unknown as typeof fetch;
    renderPage();
    fireEvent.change(screen.getByLabelText('Filter tree'), { target: { value: 'unconnected-people' } });
    // That view fetches and writes its own node list; let it settle first.
    await waitFor(() => expect(useCanvasStore.getState().isLoading).toBe(false));
    fireEvent.click(screen.getByText('select far-person'));

    // A refetch here would replace the filtered list with the whole tree.
    expect(useCanvasStore.getState().treeRootId).toBeNull();
    expect(useCanvasStore.getState().selectedPersonId).toBe('far-person');
  });
});
