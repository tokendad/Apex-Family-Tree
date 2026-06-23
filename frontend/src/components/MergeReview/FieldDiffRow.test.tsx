import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { FieldDiff } from '@/pages/import/mergeReview';
import FieldDiffRow from './FieldDiffRow';

// FieldDiffRow renders a <tr>, so it must be mounted inside a table to keep the
// DOM valid (avoids React's validateDOMNesting warning — pristine test output).
function renderRow(diff: FieldDiff, choice: 'old' | 'new' | undefined, onChoose: (c: 'old' | 'new') => void) {
  return render(
    <table><tbody>
      <FieldDiffRow diff={diff} choice={choice} onChoose={onChoose} />
    </tbody></table>,
  );
}

describe('FieldDiffRow', () => {
  it('shows two choices for a conflict and reports the pick', () => {
    const onChoose = vi.fn();
    renderRow({ field: 'occupation', existing: 'Seamstress', incoming: 'Dressmaker', status: 'conflict' }, undefined, onChoose);
    fireEvent.click(screen.getByRole('radio', { name: /take new/i }));
    expect(onChoose).toHaveBeenCalledWith('new');
  });

  it('renders a filled field as read-only with no radios', () => {
    renderRow({ field: 'middle', existing: '', incoming: 'Eleanor', status: 'filled' }, undefined, () => {});
    expect(screen.queryByRole('radio')).toBeNull();
  });
});
