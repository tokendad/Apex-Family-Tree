import React from 'react';
import type { FieldDiff } from '@/pages/import/mergeReview';
import styles from './MergeReview.module.css';

interface Props {
  diff: FieldDiff;
  choice: 'old' | 'new' | undefined;
  onChoose: (c: 'old' | 'new') => void;
}

const FieldDiffRow: React.FC<Props> = ({ diff, choice, onChoose }) => {
  if (diff.status === 'unchanged') return null;
  return (
    <tr className={styles.diffRow}>
      <th scope="row" className={styles.diffField}>{diff.field}</th>
      <td className={styles.diffExisting}>{diff.existing || '—'}</td>
      <td className={styles.diffIncoming}>
        {diff.incoming || '—'}{diff.status === 'filled' && <span className={styles.filledChip}>+</span>}
      </td>
      <td className={styles.diffChoice}>
        {diff.status === 'conflict' && (
          <div role="radiogroup" aria-label={`${diff.field} resolution`} className={styles.choiceGroup}>
            <button
              type="button"
              role="radio"
              aria-checked={choice === 'old'}
              className={choice === 'old' ? styles.choiceActive : styles.choice}
              onClick={() => onChoose('old')}
            >
              Keep existing
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={choice === 'new'}
              className={choice === 'new' ? styles.choiceActive : styles.choice}
              onClick={() => onChoose('new')}
            >
              Take new
            </button>
          </div>
        )}
      </td>
    </tr>
  );
};

export default FieldDiffRow;
