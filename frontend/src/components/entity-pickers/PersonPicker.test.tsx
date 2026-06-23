import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useModalStore } from '@/components/modals/modalStore';
import PersonPicker from './PersonPicker';

vi.mock('@/components/PersonSearch/PersonSearch', () => ({
  default: ({ onSelect, onCreateNew }: {
    onSelect: (p: { id: string; given_name: string | null; surname: string | null; birth_date: string | null; death_date: string | null; photo_url: string | null }) => void;
    onCreateNew?: () => void;
    placeholder?: string;
  }) => (
    <div>
      <input data-testid="search-input" placeholder="Search" />
      <button
        data-testid="select-person"
        onClick={() => onSelect({ id: 'p1', given_name: 'Mary', surname: 'Johnson', birth_date: '1884', death_date: null, photo_url: null })}
      >
        Select Mary
      </button>
      {onCreateNew && (
        <button data-testid="create-new" onClick={onCreateNew}>
          Create New
        </button>
      )}
    </div>
  ),
}));

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

describe('PersonPicker', () => {
  it('shows placeholder text when no person is selected', () => {
    const onSelect = vi.fn();
    render(<PersonPicker label="Spouse" onSelect={onSelect} />);
    expect(screen.getByText('Select a person…')).toBeInTheDocument();
  });

  it('calls onSelect when a person is chosen from search', () => {
    const onSelect = vi.fn();
    render(<PersonPicker label="Spouse" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Select a person…'));
    fireEvent.click(screen.getByTestId('select-person'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', given_name: 'Mary' })
    );
  });

  it('shows selected person name when value is provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'p1',
        primary_name: { given_name: 'Mary', surname: 'Johnson' },
        names: [{ given_name: 'Mary', surname: 'Johnson', is_primary: 1 }],
        events: [],
      }),
    });
    const onSelect = vi.fn();
    await act(async () => {
      render(<PersonPicker label="Spouse" value="p1" onSelect={onSelect} />);
    });
    expect(screen.getByText('Mary Johnson')).toBeInTheDocument();
  });

  it('calls onClear when clear button is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'p1',
        primary_name: { given_name: 'Mary', surname: 'Johnson' },
        names: [{ given_name: 'Mary', surname: 'Johnson', is_primary: 1 }],
        events: [],
      }),
    });
    const onClear = vi.fn();
    const onSelect = vi.fn();
    await act(async () => {
      render(<PersonPicker label="Spouse" value="p1" onSelect={onSelect} onClear={onClear} />);
    });
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it('opens PersonEditor modal when Create New is clicked', () => {
    const onSelect = vi.fn();
    render(<PersonPicker label="Spouse" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Select a person…'));
    fireEvent.click(screen.getByTestId('create-new'));
    expect(useModalStore.getState().stack).toHaveLength(1);
    expect(useModalStore.getState().stack[0].component).toBe('PersonEditor');
  });
});
