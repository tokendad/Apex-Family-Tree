import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import MediaPersonTagger from './MediaPersonTagger';

vi.mock('@/components/PersonSearch/PersonSearch', () => ({
  default: ({ onSelect }: { onSelect: (person: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onSelect({
        id: 'person-1',
        given_name: 'Ruth',
        surname: 'Apex',
        birth_date: null,
        death_date: null,
        photo_url: null,
      })}
    >
      Select Ruth Apex
    </button>
  ),
}));

const region = {
  id: 'region-1',
  media_id: 'media-1',
  person_id: 'person-1',
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.2,
  sort_order: 0,
  created_at: '2026-06-22T00:00:00.000Z',
  updated_at: '2026-06-22T00:00:00.000Z',
  person_given_name: 'Ruth',
  person_surname: 'Apex',
  person_birth_date: null,
  person_death_date: null,
  person_photo_url: null,
};

function mockStageGeometry() {
  const image = screen.getByAltText('Tagged media preview');
  const stage = image.parentElement as HTMLElement;
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe('MediaPersonTagger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resizes an existing tag box and saves updated coordinates', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ regions: [region] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ region: { ...region, width: 0.35, height: 0.4 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ regions: [{ ...region, width: 0.35, height: 0.4 }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MediaPersonTagger
        mediaId="media-1"
        mediaSrc="/api/v1/media/media-1"
        canEdit
      />,
    );

    await screen.findByRole('button', { name: 'Tag for Ruth Apex' });
    mockStageGeometry();

    fireEvent.click(screen.getByRole('button', { name: 'Tag People' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tag for Ruth Apex' }));

    const handle = screen.getByRole('button', { name: 'Resize tag Ruth Apex' });
    fireEvent.mouseDown(handle, { clientX: 30, clientY: 30 });
    fireEvent.mouseMove(handle, { clientX: 45, clientY: 50 });
    fireEvent.mouseUp(handle, { clientX: 45, clientY: 50 });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Tag for Ruth Apex' })).toHaveStyle({
      width: '35%',
      height: '40%',
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/media/media-1/regions/region-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          person_id: 'person-1',
          x: 0.1,
          y: 0.1,
          width: 0.35,
          height: 0.4,
        }),
      }),
    ));
  });
});
