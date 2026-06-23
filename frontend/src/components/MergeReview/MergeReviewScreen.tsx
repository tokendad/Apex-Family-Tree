import React from 'react';
import type { MergeAnalysis, ReviewState } from '@/pages/import/mergeReview';
import MergeSummaryBar from './MergeSummaryBar';
import MergeReviewRail from './MergeReviewRail';
import MergeDetailPanel from './MergeDetailPanel';
import styles from './MergeReview.module.css';

interface Props {
  analysis: MergeAnalysis;
  state: ReviewState;
  selectedXref: string;
  onSelect: (xref: string) => void;
  onDecision: (xref: string, kind: 'same' | 'new', candidateId: string | null) => void;
  onField: (xref: string, field: string, choice: 'old' | 'new') => void;
}

const MergeReviewScreen: React.FC<Props> = ({
  analysis,
  state,
  selectedXref,
  onSelect,
  onDecision,
  onField,
}) => {
  const { persons, counts } = analysis;
  const resolved = persons.filter((p) => !!state[p.xref]).length;
  const total = persons.length;

  const selectedPerson = persons.find((p) => p.xref === selectedXref) ?? persons[0];

  // Navigate: prefer unresolved partials, fall back to adjacent person
  const handlePrev = () => {
    const currentIdx = persons.findIndex((p) => p.xref === selectedXref);
    // Look for previous unresolved partial
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (persons[i].tier === 'partial' && !state[persons[i].xref]) {
        onSelect(persons[i].xref);
        return;
      }
    }
    // Fall back to previous person
    if (currentIdx > 0) {
      onSelect(persons[currentIdx - 1].xref);
    }
  };

  const handleNext = () => {
    const currentIdx = persons.findIndex((p) => p.xref === selectedXref);
    // Look for next unresolved partial
    for (let i = currentIdx + 1; i < persons.length; i++) {
      if (persons[i].tier === 'partial' && !state[persons[i].xref]) {
        onSelect(persons[i].xref);
        return;
      }
    }
    // Fall back to next person
    if (currentIdx < persons.length - 1) {
      onSelect(persons[currentIdx + 1].xref);
    }
  };

  return (
    <div className={styles.reviewScreen}>
      <MergeSummaryBar counts={counts} resolved={resolved} total={total} />
      <div className={styles.reviewLayout}>
        <MergeReviewRail
          persons={persons}
          state={state}
          selectedXref={selectedXref}
          onSelect={onSelect}
        />
        {selectedPerson && (
          <MergeDetailPanel
            person={selectedPerson}
            decision={state[selectedPerson.xref]}
            onDecision={(kind, candidateId) =>
              onDecision(selectedPerson.xref, kind, candidateId)
            }
            onField={(field, choice) => onField(selectedPerson.xref, field, choice)}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        )}
      </div>
    </div>
  );
};

export default MergeReviewScreen;
