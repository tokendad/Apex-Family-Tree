import React from 'react';
import styles from './MergeReview.module.css';

interface Props {
  label: 'incoming' | 'existing';
  name: string;
  birthDate: string | null;
  deathDate: string | null;
}

const PersonProfileCard: React.FC<Props> = ({ label, name, birthDate, deathDate }) => (
  <section
    className={`${styles.profile} ${styles[`profile_${label}`]}`}
    aria-label={label === 'incoming' ? 'Incoming person' : 'Existing match'}
  >
    <div className={styles.profileLabel}>{label === 'incoming' ? 'Incoming' : 'Existing match'}</div>
    <div className={styles.profileName}>{name}</div>
    <div className={styles.profileDates}>
      {birthDate ? `b. ${birthDate}` : 'b. —'}{deathDate ? `  d. ${deathDate}` : ''}
    </div>
  </section>
);

export default PersonProfileCard;
