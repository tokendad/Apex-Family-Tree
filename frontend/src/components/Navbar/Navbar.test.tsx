import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Navbar from './Navbar';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

type TestRole = 'admin' | 'editor' | 'limited_editor' | 'viewer';

let currentRole: TestRole = 'viewer';

vi.stubGlobal('__APP_VERSION__', 'test');

vi.mock('@/contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: 'user@example.test',
      display_name: 'Test User',
      role: currentRole,
    },
    logout: vi.fn(),
  }),
}));

vi.mock('@/components/Avatar/Avatar', () => ({
  default: ({ name }: { name: string }) => <span>{name}</span>,
}));

describe('Navbar role-aware tools navigation', () => {
  beforeEach(() => {
    currentRole = 'viewer';
  });

  it('shows Tools and Admin for admins', () => {
    currentRole = 'admin';
    render(<Navbar />, { wrapper: MemoryRouter });

    expect(screen.getByRole('link', { name: 'Tools' })).toHaveAttribute('href', '/tools');
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('shows Tools but not Admin for editors', () => {
    currentRole = 'editor';
    render(<Navbar />, { wrapper: MemoryRouter });

    expect(screen.getByRole('link', { name: 'Tools' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('hides Tools and Admin for viewers', () => {
    currentRole = 'viewer';
    render(<Navbar />, { wrapper: MemoryRouter });

    expect(screen.queryByRole('link', { name: 'Tools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });
});

describe('Navbar archive topbar', () => {
  beforeEach(() => {
    currentRole = 'viewer';
    navigateMock.mockClear();
  });

  it('shows the archive brand and tagline', () => {
    render(<Navbar />, { wrapper: MemoryRouter });
    expect(screen.getByText('Apex Family Legacy')).toBeInTheDocument();
    expect(screen.getByText('A Digital Family Archive')).toBeInTheDocument();
  });

  it('navigates to search results on Enter', async () => {
    render(<Navbar />, { wrapper: MemoryRouter });
    const input = screen.getByRole('searchbox', { name: /search the archive/i });
    await userEvent.type(input, 'draft letter{Enter}');
    expect(navigateMock).toHaveBeenCalledWith('/search?q=draft%20letter');
  });
});
