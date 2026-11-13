import { describe, expect, it } from 'vitest';
import { parseGedcomDate, formatDateForDisplay } from './gedcom-date.js';

/* The date field takes free text and this is what decides how much of it the
   archive actually understands. A shape it half-reads is worse than one it
   refuses: the text stays on screen exactly as typed, and only the order
   events appear in gives away that the day and month were lost. */
describe('parsing a date', () => {
  it('reads the form the fields now ask for', () => {
    expect(parseGedcomDate('1990-11-29')).toMatchObject({
      year: 1990,
      month: 11,
      day: 29,
      qualifier: 'exact',
      sortKey: 19901129,
    });
  });

  /* It used to read as the year alone: one whitespace-delimited part took the
     year-only branch, where parseInt stops at the first hyphen. The ISO
     branch sat behind a `!year` guard that could therefore never be true. */
  it('does not throw away the month and day of an ISO date', () => {
    expect(parseGedcomDate('1990-11-29').sortKey).not.toBe(19900000);
  });

  it('reads the GEDCOM form', () => {
    expect(parseGedcomDate('29 NOV 1990')).toMatchObject({
      year: 1990, month: 11, day: 29, sortKey: 19901129,
    });
  });

  it('sorts both forms of the same day identically', () => {
    expect(parseGedcomDate('1990-11-29').sortKey).toBe(parseGedcomDate('29 NOV 1990').sortKey);
  });

  it.each([
    ['NOV 1990', { year: 1990, month: 11, day: null, sortKey: 19901100 }],
    ['1990', { year: 1990, month: null, day: null, sortKey: 19900000 }],
    ['29 nov 1990', { year: 1990, month: 11, day: 29, sortKey: 19901129 }],
  ])('reads %s', (input, expected) => {
    expect(parseGedcomDate(input)).toMatchObject(expected);
  });

  it.each([
    ['ABT 1900', 'about'],
    ['BEF 1900', 'before'],
    ['AFT 1900', 'after'],
    ['EST 1900', 'estimated'],
    ['CAL 1900', 'calculated'],
  ])('keeps the qualifier on %s', (input, qualifier) => {
    expect(parseGedcomDate(input)).toMatchObject({ qualifier, year: 1900 });
  });

  it('takes a qualifier in front of an ISO date too', () => {
    expect(parseGedcomDate('ABT 1990-11-29')).toMatchObject({
      qualifier: 'about', year: 1990, month: 11, day: 29,
    });
  });

  it('takes the first date of a range, so the event sorts from its start', () => {
    expect(parseGedcomDate('BET 1900 AND 1910')).toMatchObject({
      qualifier: 'between', year: 1900,
    });
  });

  /* American order: the three-part branch expects the day first, so this
     reads as a year. It is still accepted the way any unparseable text is --
     kept verbatim -- which is why the fields now ask for YYYY-MM-DD. */
  it('only gets the year from a month-first date', () => {
    expect(parseGedcomDate('Nov 29 1990')).toMatchObject({
      year: 1990, month: null, day: null, sortKey: 19900000,
    });
  });

  it('keeps what it was given, whatever it made of it', () => {
    expect(parseGedcomDate('  sometime in the war  ').original).toBe('sometime in the war');
  });
});

/* #33: FROM/TO fell through every branch -- four whitespace-delimited parts
   matched none of the 1/2/3-part shapes -- so a span silently sorted as 0. */
describe('parsing a DATE_PERIOD (#33)', () => {
  it('reads both ends of a span', () => {
    expect(parseGedcomDate('FROM 1982 TO 1990')).toMatchObject({
      year: 1982, month: null, day: null, sortKey: 19820000,
      endYear: 1990, endSortKey: 19900000,
      isPeriod: true,
    });
  });

  /* EventRepository stores this back into event_date so the FROM keyword is
     not nested inside itself when the exporter recomposes the span from the
     start and end columns. */
  it('strips the FROM keyword from the raw start, in the author\'s own case', () => {
    const parsed = parseGedcomDate('From 1 Jan 1982 to 29 Nov 1990');
    expect(parsed.startRaw).toBe('1 Jan 1982');
    expect(parsed.endRaw).toBe('29 Nov 1990');
  });

  it('reads a full-precision span', () => {
    expect(parseGedcomDate('FROM 1 JAN 1982 TO 29 NOV 1990')).toMatchObject({
      day: 1, month: 1, year: 1982, sortKey: 19820101,
      endDay: 29, endMonth: 11, endYear: 1990, endSortKey: 19901129,
    });
  });

  it('reads an open-ended span, starting but never ending', () => {
    const parsed = parseGedcomDate('FROM 1982');
    expect(parsed).toMatchObject({ year: 1982, sortKey: 19820000, endYear: null, endSortKey: null, isPeriod: true });
  });

  it('reads a span with no known start', () => {
    const parsed = parseGedcomDate('TO 1990');
    // There is no start to sort by -- the old behaviour silently misread the
    // keyword and treated 1990 as the start, which is wrong in the opposite
    // direction from the TO 1990 TO zero bug this guards against: a year that
    // is only known to be the END must not be reported as year/sortKey too.
    expect(parsed.year).toBeNull();
    expect(parsed.sortKey).toBe(0);
    expect(parsed).toMatchObject({ endYear: 1990, endSortKey: 19900000, isPeriod: true });
  });

  it('populates the end of a BET...AND range instead of discarding it', () => {
    expect(parseGedcomDate('BET 1900 AND 1910')).toMatchObject({
      qualifier: 'between', year: 1900, sortKey: 19000000,
      endYear: 1910, endSortKey: 19100000,
      isPeriod: false,
    });
  });

  it('leaves a plain date with no end at all', () => {
    expect(parseGedcomDate('29 NOV 1990')).toMatchObject({
      endYear: null, endSortKey: null, isPeriod: false,
    });
  });
});

describe('showing a date back', () => {
  it('renders an ISO date the way the rest of the archive is written', () => {
    expect(formatDateForDisplay(parseGedcomDate('1990-11-29'))).toBe('29 Nov 1990');
  });

  it('keeps a qualifier visible', () => {
    expect(formatDateForDisplay(parseGedcomDate('ABT 1900'))).toBe('About 1900');
  });

  it('falls back to what was typed when it understood nothing', () => {
    expect(formatDateForDisplay(parseGedcomDate('sometime in the war')))
      .toBe('sometime in the war');
  });

  it('renders a span as a dash between both dates', () => {
    expect(formatDateForDisplay(parseGedcomDate('FROM 1982 TO 1990'))).toBe('1982–1990');
  });

  it('renders an open-ended span without a dangling dash', () => {
    expect(formatDateForDisplay(parseGedcomDate('FROM 1982'))).toBe('from 1982');
    expect(formatDateForDisplay(parseGedcomDate('TO 1990'))).toBe('to 1990');
  });

  it('keeps a BET...AND range reading as "Between", not a dash', () => {
    expect(formatDateForDisplay(parseGedcomDate('BET 1900 AND 1910'))).toBe('Between 1900');
  });
});
