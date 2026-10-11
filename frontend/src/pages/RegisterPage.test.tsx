import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage';
import { AuthProvider } from '../contexts/AuthContext';

let posted: { url: string; body: Record<string, unknown> }[] = [];

function mockApi(registerResponse: { ok: boolean; status: number; body: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/auth/register')) {
      posted.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return { ok: registerResponse.ok, status: registerResponse.status, json: async () => registerResponse.body } as Response;
    }
    // AuthProvider's mount check: nobody is signed in yet.
    return { ok: false, status: 401, json: async () => ({}) } as Response;
  }));
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/signup" element={<RegisterPage />} />
          <Route path="/register/:token" element={<RegisterPage />} />
          <Route path="/profile/settings" element={<p>Profile settings</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const USER = { id: 'u1', email: 'rachel@example.test', display_name: 'Rachel', role: 'editor' };

async function fillForm({ code }: { code?: string } = {}) {
  if (code !== undefined) await userEvent.type(screen.getByLabelText('Invite Code'), code);
  await userEvent.type(screen.getByLabelText('Display Name'), 'Rachel');
  await userEvent.type(screen.getByLabelText('Email'), 'rachel@example.test');
  await userEvent.type(screen.getByLabelText('Password'), 'goodpass1');
  await userEvent.type(screen.getByLabelText('Confirm Password'), 'goodpass1');
}

beforeEach(() => { posted = []; });
afterEach(() => vi.unstubAllGlobals());

describe('RegisterPage', () => {
  it('asks for a code when there is no invitation link', async () => {
    mockApi({ ok: true, status: 201, body: { user: USER } });
    renderAt('/signup');

    await waitFor(() => expect(screen.getByLabelText('Invite Code')).toBeInTheDocument());
  });

  /* An emailed invitation carries its own credential; asking for a code as
     well would be asking for something the person was never given. */
  it('does not ask for a code when arriving from an invitation link', async () => {
    mockApi({ ok: true, status: 201, body: { user: USER } });
    renderAt('/register/some-emailed-token');

    await waitFor(() => expect(screen.getByLabelText('Display Name')).toBeInTheDocument());
    expect(screen.queryByLabelText('Invite Code')).not.toBeInTheDocument();
  });

  it('submits the code and lands on the profile, signed in', async () => {
    mockApi({ ok: true, status: 201, body: { user: USER } });
    renderAt('/signup');
    await waitFor(() => expect(screen.getByLabelText('Invite Code')).toBeInTheDocument());

    await fillForm({ code: 'abcd-1234' });
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(screen.getByText('Profile settings')).toBeInTheDocument());
    expect(posted[0].body).toMatchObject({
      code: 'abcd-1234',
      email: 'rachel@example.test',
      display_name: 'Rachel',
    });
  });

  it('sends the invitation token instead of a code when it has one', async () => {
    mockApi({ ok: true, status: 201, body: { user: USER } });
    renderAt('/register/emailed-token');
    await waitFor(() => expect(screen.getByLabelText('Display Name')).toBeInTheDocument());

    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toMatchObject({ token: 'emailed-token' });
    expect(posted[0].body.code).toBeUndefined();
  });

  /* #39 sets the rule; the server enforces it, but failing locally saves a
     round trip and does not burn a rate-limit attempt. */
  it('refuses a password with no number before sending anything', async () => {
    mockApi({ ok: true, status: 201, body: { user: USER } });
    renderAt('/signup');
    await waitFor(() => expect(screen.getByLabelText('Invite Code')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Invite Code'), 'ABCD-1234');
    await userEvent.type(screen.getByLabelText('Display Name'), 'Rachel');
    await userEvent.type(screen.getByLabelText('Email'), 'rachel@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'abcdefgh');
    await userEvent.type(screen.getByLabelText('Confirm Password'), 'abcdefgh');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/must contain at least one number/i)).toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });

  it('shows the reason the server gave for refusing a code', async () => {
    mockApi({ ok: false, status: 400, body: { error: 'That invite code has expired' } });
    renderAt('/signup');
    await waitFor(() => expect(screen.getByLabelText('Invite Code')).toBeInTheDocument());

    await fillForm({ code: 'ABCD-1234' });
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('That invite code has expired')).toBeInTheDocument();
  });

  it('will not submit without a code', async () => {
    mockApi({ ok: true, status: 201, body: { user: USER } });
    renderAt('/signup');
    await waitFor(() => expect(screen.getByLabelText('Invite Code')).toBeInTheDocument());

    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(posted).toHaveLength(0);
  });
});
