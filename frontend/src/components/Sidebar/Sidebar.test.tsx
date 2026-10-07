import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';

vi.mock('@/components/SearchSidebar/SearchSidebar', () => ({ default: () => null }));
vi.mock('@/components/Divider/Divider', () => ({ default: () => null }));

vi.mock('@/stores/canvasStore', () => ({
  useCanvasStore: () => ({ generations: 4, setGenerations: vi.fn(), nodes: [] }),
}));

/** Stand in for a viewport of a given width when the component asks. */
function mockViewport(isSmall: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: isSmall,
    media: '(max-width: 768px)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sidebar', () => {
  it('starts collapsed on a small screen', () => {
    mockViewport(true);
    render(<Sidebar context="tree" />, { wrapper: MemoryRouter });

    // Below 768px the sidebar overlays the page, so opening by default buried
    // the content under a panel covering most of a phone screen.
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).not.toBeInTheDocument();
  });

  it('starts open on a large screen', () => {
    mockViewport(false);
    render(<Sidebar context="tree" />, { wrapper: MemoryRouter });

    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
  });

  it('toggles and reports its state', async () => {
    mockViewport(false);
    render(<Sidebar context="tree" />, { wrapper: MemoryRouter });

    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(toggle);

    const reopened = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(reopened).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays open when matchMedia is unavailable', () => {
    // jsdom and older browsers may not provide it; the sidebar should not
    // vanish because the check could not run.
    vi.stubGlobal('matchMedia', undefined);
    render(<Sidebar context="tree" />, { wrapper: MemoryRouter });

    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
  });
});
