import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import PlaceInput from './PlaceInput';
import type { PlaceSuggestion } from './placeSuggest';

const worcester: PlaceSuggestion = {
  id: 'place-worcester',
  title: 'Worcester, Massachusetts',
  place_type: 'city',
  address_text: null,
  locality: 'Worcester',
  county: null,
  region: 'Massachusetts',
  country: 'United States',
  parent_place_id: 'place-mass',
  parent_title: 'Massachusetts, United States',
};

const street: PlaceSuggestion = {
  ...worcester,
  id: 'place-714',
  title: '714 Main St., Worcester, Massachusetts',
  place_type: 'address',
  address_text: '714 Main St.',
  parent_place_id: 'place-worcester',
  parent_title: 'Worcester, Massachusetts',
};

/** Suggestions are debounced, so each assertion has to let the timer run. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(250);
  });
}

function mockSuggest(rows: PlaceSuggestion[]) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/v1/places/suggest')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: rows }) } as Response);
    }
    if (url.includes('/api/v1/places')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'place-new', title: '12 Elm St., Worcester, Massachusetts' }),
      } as Response);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PlaceInput', () => {
  /* Issue #35: the place box offered nothing, so a second spelling of a place
     the archive already held became a second place. */
  it('offers the places the archive already holds', async () => {
    mockSuggest([worcester, street]);
    render(<PlaceInput value="worce" onChange={() => {}} />);

    fireEvent.focus(screen.getByRole('combobox'));
    await settle();

    expect(await screen.findByText('Worcester, Massachusetts')).toBeInTheDocument();
    expect(screen.getByText('714 Main St., Worcester, Massachusetts')).toBeInTheDocument();
  });

  it('says which place each suggestion sits inside', async () => {
    mockSuggest([worcester]);
    render(<PlaceInput value="worce" onChange={() => {}} />);

    fireEvent.focus(screen.getByRole('combobox'));
    await settle();

    expect(await screen.findByText('city · in Massachusetts, United States')).toBeInTheDocument();
  });

  it('writes the chosen place title, which is what resolveOrCreate matches on', async () => {
    mockSuggest([worcester]);
    const onChange = vi.fn();
    render(<PlaceInput value="worce" onChange={onChange} />);

    fireEvent.focus(screen.getByRole('combobox'));
    await settle();
    fireEvent.click(await screen.findByText('Worcester, Massachusetts'));

    expect(onChange).toHaveBeenCalledWith('Worcester, Massachusetts');
  });

  it('does not offer to create a place that already exists under that exact name', async () => {
    mockSuggest([worcester]);
    render(<PlaceInput value="Worcester, Massachusetts" onChange={() => {}} />);

    fireEvent.focus(screen.getByRole('combobox'));
    await settle();

    await screen.findByText('Worcester, Massachusetts');
    expect(screen.queryByText(/as a new place inside/)).not.toBeInTheDocument();
  });

  it('creates a street address as its own place inside a locality', async () => {
    const fetchMock = mockSuggest([worcester]);
    const onChange = vi.fn();
    render(<PlaceInput value="12 Elm St." onChange={onChange} />);

    fireEvent.focus(screen.getByRole('combobox'));
    await settle();
    fireEvent.click(await screen.findByText(/as a new place inside/));

    // The street line is carried over from what was typed.
    expect(screen.getByPlaceholderText('714 Main St.')).toHaveValue('12 Elm St.');

    const inside = screen.getByPlaceholderText('Worcester, Massachusetts');
    fireEvent.change(inside, { target: { value: 'worce' } });
    await settle();
    fireEvent.click(await screen.findByText('Worcester, Massachusetts'));

    fireEvent.click(screen.getByText('Create place'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('12 Elm St., Worcester, Massachusetts'));

    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      title: '12 Elm St., Worcester, Massachusetts',
      place_type: 'address',
      // The street line alone, never the whole name — the habit 074 undid.
      address_text: '12 Elm St.',
      locality: 'Worcester',
      region: 'Massachusetts',
      country: 'United States',
      parent_place_id: 'place-worcester',
    });
  });

  it('refuses to create without the place it sits inside', async () => {
    mockSuggest([]);
    render(<PlaceInput value="12 Elm St." onChange={() => {}} />);

    fireEvent.focus(screen.getByRole('combobox'));
    await settle();
    fireEvent.click(await screen.findByText(/as a new place inside/));
    fireEvent.click(screen.getByText('Create place'));

    expect(await screen.findByText(/street line and the place it sits inside/)).toBeInTheDocument();
  });

  it('asks for nothing until something is typed', async () => {
    const fetchMock = mockSuggest([worcester]);
    render(<PlaceInput value="" onChange={() => {}} />);

    fireEvent.focus(screen.getByRole('combobox'));
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still lets a place nobody has recorded be typed in', async () => {
    mockSuggest([]);
    const onChange = vi.fn();
    render(<PlaceInput value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Stanbridge, Québec' } });

    expect(onChange).toHaveBeenCalledWith('Stanbridge, Québec');
  });
});
