import React from 'react';
import styles from './MergeReview.module.css';

interface Props {
  counts: { strong: number; partial: number; none: number };
  resolved: number;
  total: number;
}

const MergeSummaryBar: React.FC<Props> = ({ counts, resolved, total }) => (
  <div className={styles.summaryBar}>
    <div className={styles.summaryPills}>
      {counts.none > 0 && (
        <span className={`${styles.summaryPill} ${styles.summaryPill_none}`}>
          {counts.none} will be added
        </span>
      )}
      {counts.strong > 0 && (
        <span className={`${styles.summaryPill} ${styles.summaryPill_strong}`}>
          {counts.strong} auto-linked
        </span>
      )}
      {counts.partial > 0 && (
        <span className={`${styles.summaryPill} ${styles.summaryPill_partial}`}>
          {counts.partial} need your decision
        </span>
      )}
    </div>
    <div className={styles.summaryProgress}>
      {resolved} / {total} resolved
    </div>
  </div>
);

export default MergeSummaryBar;
