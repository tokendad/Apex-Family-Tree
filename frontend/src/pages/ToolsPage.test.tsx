import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ToolsPage from './ToolsPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));

describe('ToolsPage', () => {
  it('shows the active People de-duplication tool and future placeholders', () => {
    render(<ToolsPage />, { wrapper: MemoryRouter });

    expect(screen.getByRole('heading', { name: 'Tools' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /people merge and de-duplication/i })).toHaveAttribute(
      'href',
      '/tools/people-dedup',
    );

    expect(screen.getByText(/duplicate-family review/i)).toBeInTheDocument();
    expect(screen.getByText(/duplicate-source review/i)).toBeInTheDocument();
    expect(screen.getByText(/unlinked media review/i)).toBeInTheDocument();
    expect(screen.getByText(/disconnected people/i)).toBeInTheDocument();
    expect(screen.getByText(/GEDCOM import and export helpers/i)).toBeInTheDocument();
    expect(screen.getAllByText('Planned')).toHaveLength(5);
  });
});
