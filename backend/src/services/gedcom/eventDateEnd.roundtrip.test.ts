import { describe, expect, it } from 'vitest';
import { generateGedcom551, type ExportData } from './exporter551.js';
import { generateGedcom70 } from './exporter70.js';
import { parseGedcom } from './parser.js';
import { mapGedcomRecords } from './tagMapper.js';
import type { Event } from '../../types/db.js';

const occupation = (dateEnd: string | null): Event => ({
  id: 'e1',
  person_id: 'p1',
  family_id: null,
  event_type: 'occupation',
  event_date: '1982',
  event_date_qualifier: 'exact',
  event_date_sort_key: null,
  event_date_end: dateEnd,
  event_date_end_sort_key: null,
  event_place: null,
  plot: null,
  description: 'Segment Treater',
  source_url: null,
  source_url_checked_at: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
});

const exportData = (dateEnd: string | null): ExportData => ({
  persons: [
    {
      id: 'p1',
      sex: 'M',
      is_living: 0,
      is_private: 0,
      gedcom_id: '@I1@',
      notes: null,
      display_name: 'Raymond LeFort',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      names: [],
      events: [occupation(dateEnd)],
    },
  ],
  families: [],
  sources: [],
  repositories: [],
});

/* #33: a span had nowhere to go but the free-text event_date, where it did
   not sort. event_date_end is the new column that lets exporter551 recompose
   the DATE_PERIOD GEDCOM already has a form for. */
describe('exporting a span (#33)', () => {
  it.each([
    ['5.5.1', generateGedcom551],
    ['7.0', generateGedcom70],
  ])('writes FROM ... TO ... when both ends are known, in %s', (_version, generate) => {
    expect(generate(exportData('1990'))).toContain('2 DATE FROM 1982 TO 1990');
  });

  /* Before exporter70 shared the same compose helper, it read only
     event_date and silently dropped the end now that storage splits a span
     across two columns. */
  it('does not silently drop the end in a 7.0 export', () => {
    const gedcom = generateGedcom70(exportData('1990'));
    expect(gedcom).not.toContain('2 DATE 1982\n');
    expect(gedcom).toContain('TO 1990');
  });

  it('writes a plain date when there is no end', () => {
    const gedcom = generateGedcom551(exportData(null));
    expect(gedcom).toContain('2 DATE 1982');
    expect(gedcom).not.toContain('FROM');
  });

  it('round-trips the span back into two values', () => {
    const gedcom = generateGedcom551(exportData('1990'));
    const mapped = mapGedcomRecords(parseGedcom(gedcom).records);

    expect(mapped.persons[0].events[0]).toMatchObject({
      eventType: 'occupation',
      date: 'FROM 1982 TO 1990',
    });
  });

  /* EventRepository leaves an open-ended "FROM x" verbatim in event_date
     rather than splitting it (there is nothing to put in event_date_end),
     so the exporter must pass it straight through rather than reading
     event_date_end's absence as "there is no FROM either". */
  it('passes an open-ended "FROM x" straight through unsplit', () => {
    const openEnded: ExportData = {
      ...exportData(null),
      persons: [{ ...exportData(null).persons[0], events: [{ ...occupation(null), event_date: 'FROM 1982' }] }],
    };

    const gedcom = generateGedcom551(openEnded);
    expect(gedcom).toContain('2 DATE FROM 1982');
  });

  /* A row from before splitting existed, or one where only the End field was
     edited and event_date was deliberately left alone, can still carry a
     leading FROM when event_date_end gets set. Composing without stripping
     it nests the keyword. */
  it('does not nest FROM when event_date already carries it', () => {
    const nested: ExportData = {
      ...exportData('1990'),
      persons: [{ ...exportData('1990').persons[0], events: [{ ...occupation('1990'), event_date: 'FROM 1982' }] }],
    };

    const gedcom = generateGedcom551(nested);
    expect(gedcom).toContain('2 DATE FROM 1982 TO 1990');
    expect(gedcom).not.toContain('FROM FROM');
  });
});
