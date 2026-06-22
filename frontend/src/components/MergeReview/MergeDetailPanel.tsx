import React from 'react';
import type { PersonAnalysis, Decision } from '@/pages/import/mergeReview';
import PersonProfileCard from './PersonProfileCard';
import ResolutionBar from './ResolutionBar';
import FieldDiffRow from './FieldDiffRow';
import styles from './MergeReview.module.css';

interface Props {
  person: PersonAnalysis;
  decision: Decision | undefined;
  onDecision: (kind: 'same' | 'new', candidateId: string | null) => void;
  onField: (field: string, choice: 'old' | 'new') => void;
  onPrev: () => void;
  onNext: () => void;
}

const MergeDetailPanel: React.FC<Props> = ({
  person,
  decision,
  onDecision,
  onField,
  onPrev,
  onNext,
}) => {
  const visibleFields = person.fields.filter((f) => f.status !== 'unchanged');

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailNav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={onPrev}
          aria-label="Previous person"
        >
          ← Prev
        </button>
        <button
          type="button"
          className={styles.navBtn}
          onClick={onNext}
          aria-label="Next person"
        >
          Next →
        </button>
      </div>

      <div className={styles.detailProfiles}>
        <PersonProfileCard
          label="incoming"
          name={person.name}
          birthDate={person.birthDate}
          deathDate={person.deathDate}
        />
        {person.candidate && (
          <PersonProfileCard
            label="existing"
            name={person.candidate.name}
            birthDate={person.candidate.birthDate}
            deathDate={person.candidate.deathDate}
          />
        )}
      </div>

      {person.tier === 'partial' && (
        <ResolutionBar
          value={decision?.kind ?? null}
          onChange={(v) =>
            onDecision(v, v === 'same' ? (person.candidate?.id ?? null) : null)
          }
          candidateName={person.candidate?.name ?? null}
        />
      )}

      {(person.tier === 'partial' || person.tier === 'strong') &&
        visibleFields.length > 0 && (
          <table className={styles.diffTable}>
            <caption className={styles.diffCaption}>
              Field differences for {person.name}
            </caption>
            <thead>
              <tr>
                <th className={styles.diffField}>Field</th>
                <th className={styles.diffExisting}>Existing</th>
                <th className={styles.diffIncoming}>Incoming</th>
                <th className={styles.diffChoice}>Resolution</th>
              </tr>
            </thead>
            <tbody>
              {person.fields.map((f) => (
                <FieldDiffRow
                  key={f.field}
                  diff={f}
                  choice={decision?.fields[f.field]}
                  onChoose={(c) => onField(f.field, c)}
                />
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
};

export default MergeDetailPanel;
