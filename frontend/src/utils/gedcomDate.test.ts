import { describe, expect, it } from 'vitest';
import { lifeSpan, yearOf } from './gedcomDate';

describe('yearOf — every date shape the tree actually holds', () => {
  it('reads a full GEDCOM date', () => {
    expect(yearOf('12 OCT 1926')).toBe('1926');
    expect(yearOf('6 MAR 1956')).toBe('1956');
    expect(yearOf('24 JUN 2014')).toBe('2014');
  });

  it('reads month and year with no day', () => {
    expect(yearOf('SEP 1988')).toBe('1988');
    expect(yearOf('NOV 1896')).toBe('1896');
  });

  it('reads a bare year', () => {
    expect(yearOf('1894')).toBe('1894');
  });

  it('reads through a qualifier', () => {
    expect(yearOf('ABT 1876')).toBe('1876');
    expect(yearOf('EST 1900')).toBe('1900');
  });

  it('takes the opening year of a span', () => {
    expect(yearOf('BET 1941 AND 1966')).toBe('1941');
  });

  it('reads a slash-form date', () => {
    expect(yearOf('06/24/2014')).toBe('2014');
  });

  it('returns nothing when the year is genuinely unknown', () => {
    // Sara Faith Higgins: day and month known, year not.
    expect(yearOf('4 OCT')).toBe('');
    expect(yearOf('')).toBe('');
    expect(yearOf(null)).toBe('');
    expect(yearOf(undefined)).toBe('');
  });

  // The bug this replaces: slice(0, 4) on anything but a bare year.
  it('does not fall back to the first four characters', () => {
    expect(yearOf('12 OCT 1926')).not.toBe('12 O');
    expect(yearOf('16 APR 1993')).not.toBe('16 A');
  });
});

describe('lifeSpan — the card label', () => {
  it('shows both years for someone who has died', () => {
    // Eunice: this is the card that read "12 O - 16 A".
    expect(lifeSpan('12 OCT 1926', '16 APR 1993')).toBe('1926 – 1993');
  });

  it('shows a birth year alone for the living', () => {
    expect(lifeSpan('12 MAY 1946', null)).toBe('b. 1946');
  });

  it('shows a death year alone when the birth is unknown', () => {
    expect(lifeSpan(null, '20 NOV 1939')).toBe('d. 1939');
  });

  it('is empty when no date is recorded at all', () => {
    expect(lifeSpan(null, null)).toBe('');
  });

  it('marks an unreadable year rather than implying someone is living', () => {
    expect(lifeSpan('4 OCT', null)).toBe('b. ?');
    expect(lifeSpan('4 OCT', '4 OCT')).toBe('? – ?');
  });
});
