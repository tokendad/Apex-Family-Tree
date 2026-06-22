import { describe, it, expect } from 'vitest';
import { normalizeName, nameSoundex, dateMatch } from './matcher';

describe('normalizeName', () => {
  it('lowercases, trims, collapses spaces and strips punctuation', () => {
    expect(normalizeName('  Margaret  Eleanor ', 'Smith-Jones')).toBe('margaret eleanor smithjones');
  });
  it('handles missing parts', () => {
    expect(normalizeName(null, 'Smith')).toBe('smith');
    expect(normalizeName('Ada', null)).toBe('ada');
  });
});

describe('nameSoundex', () => {
  it('matches spelling variants of the same name', () => {
    expect(nameSoundex('Margaret', 'Smith')).toBe(nameSoundex('Margarete', 'Smyth'));
  });
});

describe('dateMatch', () => {
  it('matches identical full dates', () => {
    expect(dateMatch('1842-04-12', '1842-04-12')).toBe('match');
  });
  it('matches on year when one side is year-only', () => {
    expect(dateMatch('1842', '1842-04-12')).toBe('match');
  });
  it('mismatches different years', () => {
    expect(dateMatch('1842', '1843')).toBe('mismatch');
  });
  it('reports absent when either side missing', () => {
    expect(dateMatch(null, '1842')).toBe('absent');
    expect(dateMatch('1842', '')).toBe('absent');
  });
});
