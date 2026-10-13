import React, { useCallback, useEffect, useState } from 'react';
import Button from '@/components/Button/Button';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import FamilyPicker from '@/components/entity-pickers/FamilyPicker';
import { getPersonDisplayName, getFamilyDisplayName } from '@/utils/entityDisplay';
import { formatEventType } from '@/utils/eventTypes';
import styles from './MediaBulkLink.module.css';

interface SubjectEvent {
  id: string;
  event_type: string;
  event_date: string | null;
  event_place: string | null;
}

interface MediaBulkLinkProps {
  /** The media the gallery has selected. */
  selectedIds: string[];
  onSelectAll: () => void;
  onClear: () => void;
  /** Called once every link has been attempted, so the gallery can reload. */
  onLinked: (message: string) => void;
}

/** Where the photographs are going: the person or family itself, or one of
    their events. "subject" means the person or family, not an event. */
const SUBJECT = 'subject';

/**
 * Links many photographs at once.
 *
 * A folder of eighteen funeral photographs took eighteen trips through the
 * editor, each one a search for the same event. Nothing about that was hard,
 * only long, and long is what stops an archive getting filled in.
 *
 * It posts one link per photograph rather than in a single call, because the
 * API has no bulk endpoint and one link already failing is not a reason to
 * abandon the other seventeen -- each result is counted and the failures are
 * reported together at the end.
 */
const MediaBulkLink: React.FC<MediaBulkLinkProps> = ({
  selectedIds,
  onSelectAll,
  onClear,
  onLinked,
}) => {
  const [subjectType, setSubjectType] = useState<'person' | 'family'>('person');
  const [subjectId, setSubjectId] = useState('');
  const [subjectLabel, setSubjectLabel] = useState('');
  const [events, setEvents] = useState<SubjectEvent[]>([]);
  const [target, setTarget] = useState<string>(SUBJECT);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The subject's own events, so a photograph can go to the wake rather than
  // to the man. Both detail endpoints return them under `events`.
  const loadEvents = useCallback(async (type: 'person' | 'family', id: string) => {
    if (!id) {
      setEvents([]);
      return;
    }
    try {
      const path = type === 'person' ? 'people' : 'families';
      const res = await fetch(`/api/v1/${path}/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load events');
      const json = await res.json() as { events?: SubjectEvent[] };
      setEvents(json.events ?? []);
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    void loadEvents(subjectType, subjectId);
    setTarget(SUBJECT);
  }, [subjectType, subjectId, loadEvents]);

  const chooseSubject = (id: string, label: string) => {
    setSubjectId(id);
    setSubjectLabel(label);
  };

  const clearSubject = () => {
    setSubjectId('');
    setSubjectLabel('');
    setEvents([]);
  };

  const eventLabel = (event: SubjectEvent) =>
    [formatEventType(event.event_type), event.event_date, event.event_place]
      .filter(Boolean)
      .join(' — ');

  const handleLink = async () => {
    if (!subjectId) return;
    setIsLinking(true);
    setError(null);

    const linkType = target === SUBJECT ? subjectType : 'event';
    const targetId = target === SUBJECT ? subjectId : target;
    let linked = 0;
    const failed: string[] = [];

    for (const mediaId of selectedIds) {
      try {
        const res = await fetch(`/api/v1/media/${mediaId}/links/${linkType}/${targetId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        });
        if (res.ok) linked += 1;
        else failed.push(mediaId);
      } catch {
        failed.push(mediaId);
      }
    }

    setIsLinking(false);

    const where = target === SUBJECT
      ? subjectLabel
      : `${subjectLabel} — ${eventLabel(events.find(e => e.id === target)!)}`;
    if (failed.length > 0) {
      setError(`Linked ${linked} of ${selectedIds.length}. ${failed.length} failed.`);
    }
    onLinked(`Linked ${linked} ${linked === 1 ? 'item' : 'items'} to ${where}.`);
  };

  return (
    <div className={styles.bar} role="region" aria-label="Link selected media">
      <div className={styles.countRow}>
        <strong className={styles.count}>
          {selectedIds.length} selected
        </strong>
        <button type="button" className={styles.textBtn} onClick={onSelectAll}>
          Select all
        </button>
        <button type="button" className={styles.textBtn} onClick={onClear}>
          Clear
        </button>
      </div>

      <div className={styles.controls}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Link to</span>
          <select
            className={styles.select}
            value={subjectType}
            aria-label="Link to"
            onChange={(e) => {
              setSubjectType(e.target.value as 'person' | 'family');
              clearSubject();
            }}
          >
            <option value="person">Person</option>
            <option value="family">Family</option>
          </select>
        </label>

        <div className={styles.pickerCell}>
          {subjectType === 'person' ? (
            <PersonPicker
              value={subjectId || null}
              onSelect={(person) => chooseSubject(person.id, getPersonDisplayName(person))}
              onClear={clearSubject}
            />
          ) : (
            <FamilyPicker
              value={subjectId || null}
              onSelect={(family) => chooseSubject(family.id, getFamilyDisplayName(family))}
              onClear={clearSubject}
            />
          )}
        </div>

        {/* Always rendered, disabled until there is a subject to read events
            from. It used to appear only once a person had been chosen, which
            made the one thing this control is for -- attaching a folder of
            photographs to a single event -- invisible to anyone who had not
            already found it. */}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Attach to</span>
          <select
            className={styles.select}
            value={target}
            aria-label="Attach to"
            disabled={!subjectId}
            onChange={(e) => setTarget(e.target.value)}
          >
            {!subjectId ? (
              <option value={SUBJECT}>Choose someone first…</option>
            ) : (
              <option value={SUBJECT}>
                {subjectType === 'person' ? 'The person' : 'The family'}
              </option>
            )}
            {events.map((event) => (
              <option key={event.id} value={event.id}>{eventLabel(event)}</option>
            ))}
          </select>
        </label>

        <Button
          variant="primary"
          size="sm"
          onClick={() => { void handleLink(); }}
          disabled={!subjectId || selectedIds.length === 0 || isLinking}
          loading={isLinking}
        >
          {isLinking ? 'Linking…' : `Link ${selectedIds.length}`}
        </Button>
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  );
};

export default MediaBulkLink;
