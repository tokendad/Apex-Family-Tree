import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminSettingsPage from './AdminSettingsPage';

function mockSettingsFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/v1/admin/settings') && init?.method !== 'PUT') {
      return {
        ok: true,
        json: async () => ({
          settings: [
            { key: 'instance_name', value: 'AFT', value_type: 'string', description: null },
            { key: 'timezone', value: 'UTC', value_type: 'string', description: null },
            { key: 'name_display_format', value: '%f %m %s', value_type: 'string', description: null },
          ],
        }),
      } as Response;
    }
    if (url.endsWith('/api/v1/admin/features')) {
      return { ok: true, json: async () => ({ flags: [] }) } as Response;
    }
    if (url.endsWith('/api/v1/admin/settings') && init?.method === 'PUT') {
      return { ok: true, json: async () => ({ updated: [] }) } as Response;
    }
    return { ok: false, json: async () => ({ error: 'Unexpected request' }) } as Response;
  });
}

describe('AdminSettingsPage name display format', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows live preview and saves the name display format', async () => {
    const fetchMock = mockSettingsFetch();
    render(<AdminSettingsPage />);

    const input = await screen.findByLabelText('Global Name Format');
    fireEvent.change(input, { target: { value: '%t %f %mi %s, %x' } });

    expect(screen.getByText('Dr. Jane A. Smith-Jones, Jr.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save name format/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/admin/settings',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ settings: { name_display_format: '%t %f %mi %s, %x' } }),
        }),
      );
    });
  });

  it('rejects %D in the global format before saving', async () => {
    const fetchMock = mockSettingsFetch();
    render(<AdminSettingsPage />);

    const input = await screen.findByLabelText('Global Name Format');
    fireEvent.change(input, { target: { value: '%D' } });
    fireEvent.click(screen.getByRole('button', { name: /save name format/i }));

    expect(screen.getByText('Global name format cannot contain %D token')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/v1/admin/settings',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
