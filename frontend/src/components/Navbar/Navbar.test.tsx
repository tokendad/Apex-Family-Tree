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

const logoutMock = vi.fn();

vi.mock('@/contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: 'user@example.test',
      display_name: 'Test User',
      role: currentRole,
    },
    logout: logoutMock,
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

describe('Navbar account menu', () => {
  beforeEach(() => {
    currentRole = 'viewer';
    logoutMock.mockClear();
  });

  async function openMenu() {
    render(<Navbar />, { wrapper: MemoryRouter });
    await userEvent.click(screen.getByRole('button', { name: /test user/i }));
  }

  it('keeps the menu closed until the username is clicked', () => {
    render(<Navbar />, { wrapper: MemoryRouter });
    expect(screen.queryByRole('menu', { name: 'Account menu' })).not.toBeInTheDocument();
  });

  it('groups destinations under Help and Profile headings', async () => {
    await openMenu();

    expect(screen.getByRole('menu', { name: 'Account menu' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Profile' })).toBeInTheDocument();
  });

  it.each([
    ['About', '/about'],
    ['FAQ', '/faq'],
    ['Glossary', '/glossary'],
    ['Theme', '/profile/theme'],
    ['Settings', '/profile/settings'],
  ])('routes %s to %s', async (label, href) => {
    await openMenu();
    expect(screen.getByRole('menuitem', { name: label })).toHaveAttribute('href', href);
  });

  it('treats section headings as labels, not destinations', async () => {
    await openMenu();

    // 'Help' and 'Profile' group the menu but must never navigate — profile
    // settings are reached through Profile > Settings instead.
    expect(screen.queryByRole('menuitem', { name: 'Profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Help' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();
  });

  it('lists only Theme and Settings under Profile', async () => {
    await openMenu();

    const group = screen.getByRole('group', { name: 'Profile' });
    const labels = Array.from(group.querySelectorAll('[role="menuitem"]')).map(
      (el) => el.textContent?.trim()
    );
    expect(labels).toEqual(['Theme', 'Settings']);
  });

  it('opens GitHub in a new tab without leaking referrer', async () => {
    await openMenu();
    const link = screen.getByRole('menuitem', { name: /github/i });
    expect(link).toHaveAttribute('href', 'https://github.com/tokendad/Apex-Family-Tree');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('still offers log out', async () => {
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    await openMenu();
    expect(screen.getByRole('menu', { name: 'Account menu' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu', { name: 'Account menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /test user/i })).toHaveFocus();
  });
});
