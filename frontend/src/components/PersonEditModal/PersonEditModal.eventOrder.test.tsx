import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PersonEditModal from './PersonEditModal';

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: true, canDelete: true }),
}));
vi.mock('@/components/modals/useModal', () => ({ useModal: () => ({ openModal: vi.fn() }) }));

/* Walter Higgins Sr: born 1919, died 26 Nov 1990, buried three days later.
   The sort keys are what the backend derives from those dates. */
const person = {
  id: 'p1',
  sex: 'M',
  is_living: 0,
  is_private: 0,
  display_name: 'Walter Higgins Sr',
  notes: null,
  names: [{ id: 'n1', given_name: 'Walter', surname: 'Higgins', suffix: 'Sr', is_primary: 1, name_type: 'birth', sort_order: 0 }],
  events: [
    { id: 'e-birth', event_type: 'birth', event_date: '7 FEB 1919', event_date_sort_key: 19190207, event_place: null, plot: null, description: null, source_url: null, source_url_checked_at: null },
    { id: 'e-burial', event_type: 'burial', event_date: '1990-11-29', event_date_sort_key: 19901129, event_place: 'Worcester County Memorial Park, Paxton, Massachusetts', plot: null, description: null, source_url: null, source_url_checked_at: null },
    { id: 'e-death', event_type: 'death', event_date: '1990-11-26', event_date_sort_key: 19901126, event_place: null, plot: null, description: null, source_url: null, source_url_checked_at: null },
  ],
  families: [],
  media: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => person });
});

const renderModal = () =>
  render(
    <MemoryRouter>
      <PersonEditModal
        open
        personId="p1"
        displayName="Walter Higgins Sr"
        onClose={() => {}}
        onSaved={() => {}}
      />
    </MemoryRouter>,
  );

/* The person's own page and this modal are two views of one life and used to
   disagree: the modal sorted by event type with death pinned last, so a
   burial -- which happens after a death -- was listed above it. */
describe('PersonEditModal — the order events are listed in', () => {
  it('lists a burial after the death it followed', async () => {
    renderModal();

    const events = await screen.findByRole('tab', { name: /events/i });
    events.click();

    await waitFor(() => expect(screen.getByText('Burial')).toBeInTheDocument());

    const labels = screen.getAllByText(/^(Birth|Death|Burial)$/).map((node) => node.textContent);
    expect(labels).toEqual(['Birth', 'Death', 'Burial']);
  });
});
