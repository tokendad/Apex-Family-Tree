import React from 'react';
import styles from './MergeReview.module.css';

interface Props {
  value: 'same' | 'new' | null;
  onChange: (v: 'same' | 'new') => void;
  candidateName: string | null;
}

const ResolutionBar: React.FC<Props> = ({ value, onChange, candidateName }) => (
  <div role="radiogroup" aria-label="Is this the same person?" className={styles.resolution}>
    <button
      type="button"
      role="radio"
      aria-checked={value === 'same'}
      className={value === 'same' ? styles.resActive : styles.res}
      onClick={() => onChange('same')}
    >
      Same as {candidateName ?? 'existing person'}
    </button>
    <button
      type="button"
      role="radio"
      aria-checked={value === 'new'}
      className={value === 'new' ? styles.resActive : styles.res}
      onClick={() => onChange('new')}
    >
      Add as new person
    </button>
  </div>
);

export default ResolutionBar;
