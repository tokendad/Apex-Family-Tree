import React from 'react';
import type { PersonAnalysis } from '@/pages/import/mergeReview';
import TierBadge from './TierBadge';
import styles from './MergeReview.module.css';

interface Props {
  person: PersonAnalysis;
  resolved: boolean;
  selected: boolean;
  onSelect: () => void;
}

const PersonMiniCard: React.FC<Props> = ({ person, resolved, selected, onSelect }) => {
  const years = [
    person.birthDate ? person.birthDate.slice(0, 4) : null,
    person.deathDate ? person.deathDate.slice(0, 4) : null,
  ]
    .filter(Boolean)
    .join(' – ');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      className={`${styles.miniCard} ${selected ? styles.miniCardSelected : ''}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.miniCardMain}>
        <div className={styles.miniCardName}>{person.name}</div>
        {years && <div className={styles.miniCardYears}>{years}</div>}
      </div>
      <div className={styles.miniCardMeta}>
        <TierBadge tier={person.tier} />
        {resolved && (
          <span className={styles.miniCardCheck} aria-label="Resolved">
            ✓
          </span>
        )}
      </div>
    </div>
  );
};

export default PersonMiniCard;
