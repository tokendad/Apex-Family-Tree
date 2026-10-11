import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UserSettingsPage from './UserSettingsPage';

const USER = { id: 'u1', email: 'wes@example.test', display_name: 'Wes', role: 'admin' as const };



// Navbar renders inside the page shell and needs logout as well as user.
vi.mock('@/contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: USER,
    refreshUser: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  }),
}));

let calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];

function mockApi(overrides: Record<string, { ok: boolean; status: number; body: unknown }> = {}) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null,
    });

    for (const [match, response] of Object.entries(overrides)) {
      if (url.includes(match) && (init?.method ?? 'GET') !== 'GET') {
        return { ok: response.ok, status: response.status, json: async () => response.body } as Response;
      }
    }
    if (url.includes('/home-person')) {
      return { ok: true, status: 200, json: async () => ({ home_person: null }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ user: USER }) } as Response;
  }));
}

function renderPage() {
  return render(<MemoryRouter><UserSettingsPage /></MemoryRouter>);
}

beforeEach(() => {
  calls = [];
  // Supplied by Vite's define at build time, absent under the test runner.
  // Set per test because unstubAllGlobals below clears it.
  vi.stubGlobal('__APP_VERSION__', 'test');
});
afterEach(() => vi.unstubAllGlobals());

describe('UserSettingsPage', () => {
  it('shows the signed-in account', async () => {
    mockApi();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Display name')).toHaveValue('Wes'));
    expect(screen.getByLabelText('Email')).toHaveValue('wes@example.test');
  });

  /* The common case is fixing a display name; demanding a password for that
     would be friction for nothing. */
  it('does not ask for a password to change only the display name', async () => {
    mockApi();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Display name')).toHaveValue('Wes'));

    await userEvent.clear(screen.getByLabelText('Display name'));
    await userEvent.type(screen.getByLabelText('Display name'), 'Walter LeFort');

    // Only the password section's own fields exist, not one on this form.
    expect(screen.queryByPlaceholderText(/needed to change your email/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save details/i }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).toMatchObject({ display_name: 'Walter LeFort' });
    expect(patch.body!.current_password).toBeUndefined();
  });

  /* The email is the login, so changing it costs a password. */
  it('asks for the current password as soon as the email is edited', async () => {
    mockApi();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveValue('wes@example.test'));

    await userEvent.clear(screen.getByLabelText('Email'));
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.test');

    expect(await screen.findByPlaceholderText(/needed to change your email/i)).toBeInTheDocument();
  });

  it('surfaces the reason a save was refused', async () => {
    mockApi({ '/users/me': { ok: false, status: 409, body: { error: 'Another account already uses that email' } } });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveValue('wes@example.test'));

    await userEvent.clear(screen.getByLabelText('Email'));
    await userEvent.type(screen.getByLabelText('Email'), 'taken@example.test');
    await userEvent.type(await screen.findByPlaceholderText(/needed to change your email/i), 'currentpass1');
    await userEvent.click(screen.getByRole('button', { name: /save details/i }));

    expect(await screen.findByText('Another account already uses that email')).toBeInTheDocument();
  });

  it('refuses a new password with no number before sending it', async () => {
    mockApi();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Current password')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Current password'), 'currentpass1');
    await userEvent.type(screen.getByLabelText('New password'), 'abcdefgh');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'abcdefgh');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByText(/must contain at least one number/i)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/password'))).toBe(false);
  });

  it('refuses a mistyped confirmation', async () => {
    mockApi();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Current password')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Current password'), 'currentpass1');
    await userEvent.type(screen.getByLabelText('New password'), 'brandnew1');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'brandnew2');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/password'))).toBe(false);
  });

  it('tells the person other devices were signed out', async () => {
    mockApi({
      '/password': { ok: true, status: 200, body: { message: 'Password changed. Other devices have been signed out.' } },
    });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Current password')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Current password'), 'currentpass1');
    await userEvent.type(screen.getByLabelText('New password'), 'brandnew1');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'brandnew1');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByText(/other devices have been signed out/i)).toBeInTheDocument();
  });

  it('warns about the sign-out before it happens, not after', async () => {
    mockApi();
    renderPage();

    await waitFor(() => expect(screen.getByText(/signs you out everywhere else/i)).toBeInTheDocument());
  });
});
