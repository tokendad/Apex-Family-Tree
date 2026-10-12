import { describe, expect, it } from 'vitest';
import { generateGedcom551, type ExportData } from './exporter551.js';
import { generateGedcom70 } from './exporter70.js';
import { parseGedcom } from './parser.js';
import { mapGedcomRecords } from './tagMapper.js';
import type { Event } from '../../types/db.js';

const burial = (plot: string | null): Event => ({
  id: 'e1',
  person_id: 'p1',
  family_id: null,
  event_type: 'burial',
  event_date: '14 MAR 1962',
  event_date_qualifier: 'exact',
  event_date_sort_key: null,
  event_place: "St. John's Cemetery, Worcester, Massachusetts",
  plot,
  description: null,
  source_url: null,
  source_url_checked_at: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
});

const exportData = (plot: string | null): ExportData => ({
  persons: [
    {
      id: 'p1',
      sex: 'M',
      is_living: 0,
      is_private: 0,
      gedcom_id: '@I1@',
      notes: null,
      display_name: 'Test Subject',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      names: [],
      events: [burial(plot)],
    },
  ],
  families: [],
  sources: [],
  repositories: [],
});

const PLOT = 'Lot 482 (Shrine of the Holy Family)';

describe('exporting a burial plot', () => {
  /* Neither 5.5.1 nor 7.0 has a tag for a cemetery plot, and there is no
     registered extension for one, so it travels as a NOTE on the event. */
  it.each([
    ['5.5.1', generateGedcom551],
    ['7.0', generateGedcom70],
  ])('writes the plot as a NOTE under the burial in %s', (_version, generate) => {
    const lines = generate(exportData(PLOT)).split('\n');
    const buri = lines.findIndex((line) => line.startsWith('1 BURI'));

    expect(buri).toBeGreaterThan(-1);
    expect(lines.slice(buri, buri + 4)).toContain(`2 NOTE Plot: ${PLOT}`);
    expect(lines).toContain(`2 PLAC St. John's Cemetery, Worcester, Massachusetts`);
  });

  it.each([
    ['5.5.1', generateGedcom551],
    ['7.0', generateGedcom70],
  ])('writes nothing when there is no plot in %s', (_version, generate) => {
    expect(generate(exportData(null))).not.toContain('NOTE Plot:');
  });

  /* A newline inside the value would be a malformed line rather than a long
     one, so whitespace is collapsed on the way out. */
  it('keeps the note on one line', () => {
    const gedcom = generateGedcom551(exportData('Garden of Heritage I,\n  Lot 237  Grave 4'));

    expect(gedcom).toContain('2 NOTE Plot: Garden of Heritage I, Lot 237 Grave 4');
  });
});

describe('reading a burial plot back', () => {
  /* The exporters write one specific line; the importer reads that same line
     back rather than trying to interpret notes in general. */
  it.each([
    ['5.5.1', generateGedcom551],
    ['7.0', generateGedcom70],
  ])('round-trips the plot through %s', (_version, generate) => {
    const mapped = mapGedcomRecords(parseGedcom(generate(exportData(PLOT))).records);

    expect(mapped.persons[0].events[0]).toMatchObject({
      eventType: 'burial',
      place: "St. John's Cemetery, Worcester, Massachusetts",
      plot: PLOT,
    });
  });

  /* The prefix is what makes it safe: a note that does not announce itself as
     a plot is left alone rather than guessed at. */
  it('ignores a note that is not a plot', () => {
    const mapped = mapGedcomRecords(parseGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 BURI
2 PLAC St. John's Cemetery, Worcester, Massachusetts
2 NOTE Headstone is badly weathered.
0 TRLR
`).records);

    expect(mapped.persons[0].events[0].plot).toBeNull();
  });

  it('finds the plot among several notes', () => {
    const mapped = mapGedcomRecords(parseGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 BURI
2 NOTE Headstone is badly weathered.
2 NOTE Plot: ${PLOT}
0 TRLR
`).records);

    expect(mapped.persons[0].events[0].plot).toBe(PLOT);
  });
});
