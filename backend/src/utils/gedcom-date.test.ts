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
});
