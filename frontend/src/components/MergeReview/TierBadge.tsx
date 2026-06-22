import React from 'react';
import type { Tier } from '@/pages/import/mergeReview';
import styles from './MergeReview.module.css';

const LABEL: Record<Tier, string> = { strong: 'Auto-linked', partial: 'Needs decision', none: 'Will be added' };

const TierBadge: React.FC<{ tier: Tier }> = ({ tier }) => (
  <span className={`${styles.badge} ${styles[`badge_${tier}`]}`}>{LABEL[tier]}</span>
);

export default TierBadge;
