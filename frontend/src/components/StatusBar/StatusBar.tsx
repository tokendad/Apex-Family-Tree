import React from 'react';
import { useSearchStore, hasActiveFilters, activeFilterCount } from '@/stores/searchStore';
import type { SidebarContext } from '@/stores/searchStore';
import styles from './StatusBar.module.css';

interface StatusBarProps {
  context?: SidebarContext;
}

const StatusBar: React.FC<StatusBarProps> = ({ context }) => {
  const store = useSearchStore();
  const active = hasActiveFilters(store, context);

  if (!active) return null;

  const count = activeFilterCount(store, context);
  const total = store.totalCount;

  return (
    <div className={styles.statusBar} role="status" aria-live="polite">
      <div className={styles.statusInfo}>
        {total !== null && (
          <span>{total} people in tree</span>
        )}
        <span className={styles.filterCount}>
          Search filters active: {count}
        </span>
      </div>
      <button
        type="button"
        className={styles.clearBtn}
        onClick={() => store.resetFilters()}
        aria-label="Clear all search filters"
      >
        Clear all
      </button>
    </div>
  );
};

export default StatusBar;
