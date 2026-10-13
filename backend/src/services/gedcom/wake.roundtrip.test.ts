import { describe, expect, it } from 'vitest';
import { generateGedcom551, type ExportData } from './exporter551.js';
import { generateGedcom70 } from './exporter70.js';
import { parseGedcom } from './parser.js';
import { mapGedcomRecords } from './tagMapper.js';
import type { Event } from '../../types/db.js';

const event = (eventType: string): Event => ({
  id: 'e1',
  person_id: 'p1',
  family_id: null,
  event_type: eventType,
  event_date: '29 NOV 1990',
  event_date_qualifier: 'exact',
  event_date_sort_key: null,
  event_place: 'Worcester, Massachusetts',
  plot: null,
  description: null,
  source_url: null,
  source_url_checked_at: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
});

const exportData = (eventType: string): ExportData => ({
  persons: [
    {
      id: 'p1',
      sex: 'M',
      is_living: 0,
      is_private: 0,
      gedcom_id: '@I1@',
      notes: null,
      display_name: 'Walter Higgins Sr',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      names: [],
      events: [event(eventType)],
    },
  ],
  families: [],
  sources: [],
  repositories: [],
});

/* A wake is a real event with photographs and mourners, and neither grammar
   has a tag for one. EVEN plus TYPE is what both provide for that case. */
describe('exporting a wake', () => {
  it.each([
    ['5.5.1', generateGedcom551],
    ['7.0', generateGedcom70],
  ])('writes it as a generic event that says what it is in %s', (_version, generate) => {
    const lines = generate(exportData('wake')).split('\n');
    const even = lines.findIndex((line) => line.startsWith('1 EVEN'));

    expect(even).toBeGreaterThan(-1);
    expect(lines[even + 1]).toBe('2 TYPE Wake');
    expect(lines).toContain('2 DATE 29 NOV 1990');
    expect(lines).toContain('2 PLAC Worcester, Massachusetts');
  });

  /* The same gap, already there before the wake: an anniversary was a bare
     EVEN and came home as an unclassified event. */
  it('says what an anniversary is too', () => {
    expect(generateGedcom551(exportData('anniversary'))).toContain('2 TYPE Anniversary');
  });

  it('leaves an unclassified event unclassified', () => {
    const gedcom = generateGedcom551(exportData('other'));

    expect(gedcom).toContain('1 EVEN');
    expect(gedcom).not.toContain('2 TYPE');
  });
});

describe('reading a wake back', () => {
  it.each([
    ['5.5.1', generateGedcom551],
    ['7.0', generateGedcom70],
  ])('round-trips through %s', (_version, generate) => {
    const mapped = mapGedcomRecords(parseGedcom(generate(exportData('wake'))).records);

    expect(mapped.persons[0].events[0]).toMatchObject({
      eventType: 'wake',
      date: '29 NOV 1990',
      place: 'Worcester, Massachusetts',
    });
  });

  it('round-trips an anniversary', () => {
    const mapped = mapGedcomRecords(parseGedcom(generateGedcom551(exportData('anniversary'))).records);

    expect(mapped.persons[0].events[0].eventType).toBe('anniversary');
  });

  /* Other programs are not careful about case, and dropping the one piece of
     information the line carries would be the worse failure. */
  it('does not mind how another program cased it', () => {
    const gedcom = '0 @I1@ INDI\n1 EVEN\n2 TYPE wake\n2 DATE 29 NOV 1990\n0 TRLR\n';
    const mapped = mapGedcomRecords(parseGedcom(gedcom).records);

    expect(mapped.persons[0].events[0].eventType).toBe('wake');
  });

  it('leaves a TYPE it does not know as a plain event', () => {
    const gedcom = '0 @I1@ INDI\n1 EVEN\n2 TYPE Barn Raising\n0 TRLR\n';
    const mapped = mapGedcomRecords(parseGedcom(gedcom).records);

    expect(mapped.persons[0].events[0].eventType).toBe('other');
  });
});
