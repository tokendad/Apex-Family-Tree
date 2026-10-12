import React from 'react';
import { Input } from '@/components/Form';
import styles from './EventSource.module.css';
import { todayIso, type EventSourceForm } from './eventSourceForm';

/**
 * Where an event was read, and when that link was last known to work (#41).
 *
 * Shared by every form that writes an event -- the person modal, the events
 * page, the event detail page and the family page -- so the field behaves the
 * same wherever an event is created or edited. Before this, a URL had nowhere
 * to go but the description, where it rendered as plain text.
 */

interface FieldsProps {
  value: EventSourceForm;
  onChange: (next: EventSourceForm) => void;
  /** Distinguishes the inputs when more than one form is open on a page. */
  idPrefix: string;
}

export const EventSourceFields: React.FC<FieldsProps> = ({ value, onChange, idPrefix }) => {
  const urlId = `${idPrefix}-source-url`;
  const checkedId = `${idPrefix}-source-checked`;

  return (
    <div className={styles.fields}>
      <label className={styles.urlField} htmlFor={urlId}>
        <span className={styles.labelText}>Source URL</span>
        <Input
          id={urlId}
          type="url"
          inputMode="url"
          value={value.source_url}
          onChange={(e) => onChange({ ...value, source_url: e.target.value })}
          placeholder="https://example.com/obituary"
        />
      </label>

      <label className={styles.checkedField} htmlFor={checkedId}>
        <span className={styles.labelText}>Last checked</span>
        <div className={styles.checkedRow}>
          <Input
            id={checkedId}
            type="date"
            value={value.source_url_checked_at}
            onChange={(e) => onChange({ ...value, source_url_checked_at: e.target.value })}
          />
          {/* The affordance the date field needs: a link is re-checked far more
              often than it is typed, and nobody opens a date picker to say
              "still works". */}
          <button
            type="button"
            className={styles.todayBtn}
            onClick={() => onChange({ ...value, source_url_checked_at: todayIso() })}
            disabled={!value.source_url.trim()}
          >
            Today
          </button>
        </div>
      </label>
    </div>
  );
};

interface LinkProps {
  url: string | null | undefined;
  checkedAt: string | null | undefined;
}

/**
 * The read-only view. Shows the host rather than the whole URL, which is
 * usually a long opaque query string, with the full address as the title.
 */
export const EventSourceLink: React.FC<LinkProps> = ({ url, checkedAt }) => {
  if (!url) return null;

  let label = url;
  try {
    label = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* Shown as stored: the server only accepts http(s), but a row predating
       that check, or one written directly, should still render. */
  }

  return (
    <span className={styles.link}>
      <a href={url} target="_blank" rel="noopener noreferrer" title={url}>
        {label}
      </a>
      {checkedAt && <span className={styles.checkedAt}>checked {checkedAt}</span>}
    </span>
  );
};
