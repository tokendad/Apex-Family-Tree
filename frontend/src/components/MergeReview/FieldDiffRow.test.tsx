import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FieldDiffRow from './FieldDiffRow';

describe('FieldDiffRow', () => {
  it('shows two choices for a conflict and reports the pick', () => {
    const onChoose = vi.fn();
    render(<FieldDiffRow diff={{ field: 'occupation', existing: 'Seamstress', incoming: 'Dressmaker', status: 'conflict' }} choice={undefined} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('radio', { name: /take new/i }));
    expect(onChoose).toHaveBeenCalledWith('new');
  });

  it('renders a filled field as read-only with no radios', () => {
    render(<FieldDiffRow diff={{ field: 'middle', existing: '', incoming: 'Eleanor', status: 'filled' }} choice={undefined} onChoose={() => {}} />);
    expect(screen.queryByRole('radio')).toBeNull();
  });
});
