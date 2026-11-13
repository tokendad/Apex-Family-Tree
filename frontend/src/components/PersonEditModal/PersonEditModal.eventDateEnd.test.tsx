import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PersonEditModal from './PersonEditModal';

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: true, canDelete: true }),
}));
vi.mock('@/components/modals/useModal', () => ({ useModal: () => ({ openModal: vi.fn() }) }));

const person = {
  id: 'p1',
  sex: 'M',
  is_living: 0,
  is_private: 0,
  display_name: 'Raymond LeFort',
  notes: null,
  names: [{ id: 'n1', given_name: 'Raymond', surname: 'LeFort', is_primary: 1, name_type: 'birth', sort_order: 0 }],
  events: [],
  families: [],
  media: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && String(url).includes('/events/people/')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'e-new', ...JSON.parse(init.body as string) }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => person });
  });
});

const renderModal = () =>
  render(
    <MemoryRouter>
      <PersonEditModal
        open
        personId="p1"
        displayName="Raymond LeFort"
        onClose={() => {}}
        onSaved={() => {}}
      />
    </MemoryRouter>,
  );

/* #33: the End Date field is new on this form. A regression here is exactly
   the one that mattered -- the request body silently dropping event_date_end
   would mean typing an end does nothing, with no error to notice it by. */
describe('PersonEditModal — adding an event with an end date', () => {
  it('sends event_date_end in the add-event request body', async () => {
    renderModal();

    const eventsTab = await screen.findByRole('tab', { name: /events/i });
    fireEvent.click(eventsTab);

    fireEvent.click(await screen.findByRole('button', { name: /\+ add event/i }));

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '1982' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '1990' } });

    fireEvent.click(screen.getByRole('button', { name: /^add event$/i }));

    await waitFor(() => {
      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]).includes('/events/people/') && c[1]?.method === 'POST',
      );
      expect(call).toBeDefined();
      const body = JSON.parse(call![1].body as string);
      expect(body.event_date).toBe('1982');
      expect(body.event_date_end).toBe('1990');
    });
  });
});
