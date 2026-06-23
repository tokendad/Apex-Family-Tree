import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import PersonEditor from './PersonEditor';

const noop = () => {};

describe('PersonEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a dialog with correct aria attributes', () => {
    render(
      <PersonEditor mode="create" modalId="m1" onClose={noop} />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Add Person')).toBeInTheDocument();
  });

  it('pre-fills given name from defaults', () => {
    render(
      <PersonEditor
        mode="create"
        defaults={{ given_name: 'Mary' }}
        modalId="m1"
        onClose={noop}
      />
    );
    expect(screen.getByLabelText('Given Name')).toHaveValue('Mary');
  });

  it('calls onClose with cancelled when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<PersonEditor mode="create" modalId="m1" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledWith({ action: 'cancelled' });
  });

  it('submits form and calls onClose with created result', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'p2', sex: 'M', names: [{ given_name: 'John', surname: 'Smith', is_primary: 1 }] }),
    });

    const onClose = vi.fn();
    render(<PersonEditor mode="create" modalId="m1" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Given Name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Surname'), { target: { value: 'Smith' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'created',
          entityType: 'person',
          entity: expect.objectContaining({
            id: 'p2',
            given_name: 'John',
            surname: 'Smith',
          }),
        })
      );
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/people',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sex: 'U',
          is_living: 1,
          is_private: 0,
          names: [
            {
              name_type: 'birth',
              given_name: 'John',
              surname: 'Smith',
              is_primary: 1,
            },
          ],
        }),
      })
    );
  });

  it('shows an error message when the API call fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Failed to create person' }),
    });

    render(<PersonEditor mode="create" modalId="m1" onClose={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to create person');
    });
  });
});
