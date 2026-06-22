import React from 'react';
import type { PersonAnalysis } from '@/pages/import/mergeReview';
import type { ReviewState } from '@/pages/import/mergeReview';
import CollapsibleSection from '@/components/CollapsibleSection/CollapsibleSection';
import PersonMiniCard from './PersonMiniCard';
import styles from './MergeReview.module.css';

interface Props {
  persons: PersonAnalysis[];
  state: ReviewState;
  selectedXref: string;
  onSelect: (xref: string) => void;
}

const MergeReviewRail: React.FC<Props> = ({ persons, state, selectedXref, onSelect }) => {
  const partial = persons.filter((p) => p.tier === 'partial');
  const strong = persons.filter((p) => p.tier === 'strong');
  const none = persons.filter((p) => p.tier === 'none');

  const renderCard = (p: PersonAnalysis) => (
    <PersonMiniCard
      key={p.xref}
      person={p}
      resolved={!!state[p.xref]}
      selected={p.xref === selectedXref}
      onSelect={() => onSelect(p.xref)}
    />
  );

  return (
    <div role="listbox" aria-label="People to review" className={styles.rail}>
      {partial.length > 0 && (
        <CollapsibleSection
          title={`Needs decision (${partial.length})`}
          defaultOpen={true}
        >
          {partial.map(renderCard)}
        </CollapsibleSection>
      )}
      {strong.length > 0 && (
        <CollapsibleSection
          title={`Auto-linked (${strong.length})`}
          defaultOpen={false}
        >
          {strong.map(renderCard)}
        </CollapsibleSection>
      )}
      {none.length > 0 && (
        <CollapsibleSection
          title={`Will be added (${none.length})`}
          defaultOpen={false}
        >
          {none.map(renderCard)}
        </CollapsibleSection>
      )}
    </div>
  );
};

export default MergeReviewRail;
