import { describe, it, expect } from 'vitest';
import { normalizeName, nameSoundex, dateMatch, diffFields, coupleKey, sourceKey } from './matcher.js';

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

import { classify, type MatchPersonInput, type FieldDiff } from './matcher.js';

const existing: MatchPersonInput[] = [
  { id: 'x1', givenName: 'Margaret', surname: 'Smith', birthDate: '1842-04-12', deathDate: '1911-02-03' },
  { id: 'x2', givenName: 'John', surname: 'Doe', birthDate: '1900', deathDate: null },
];

describe('classify', () => {
  it('returns strong for exact name + both dates', () => {
    const r = classify({ id: 'i1', givenName: 'Margaret', surname: 'Smith', birthDate: '1842-04-12', deathDate: '1911-02-03' }, existing);
    expect(r).toEqual({ tier: 'strong', candidateId: 'x1' });
  });
  it('returns partial when one date is missing on the incoming side', () => {
    const r = classify({ id: 'i2', givenName: 'Margaret', surname: 'Smith', birthDate: '1842', deathDate: null }, existing);
    expect(r).toEqual({ tier: 'partial', candidateId: 'x1' });
  });
  it('returns partial for a soundex name variant sharing a date', () => {
    const r = classify({ id: 'i3', givenName: 'Margarete', surname: 'Smyth', birthDate: '1842', deathDate: null }, existing);
    expect(r).toEqual({ tier: 'partial', candidateId: 'x1' });
  });
  it('returns none when nothing matches', () => {
    const r = classify({ id: 'i4', givenName: 'Zelda', surname: 'Nobody', birthDate: '1700', deathDate: null }, existing);
    expect(r).toEqual({ tier: 'none', candidateId: null });
  });
  it('prefers a strong candidate over a partial one', () => {
    const many: MatchPersonInput[] = [
      { id: 'p', givenName: 'Margaret', surname: 'Smith', birthDate: '1842', deathDate: null },
      { id: 's', givenName: 'Margaret', surname: 'Smith', birthDate: '1842-04-12', deathDate: '1911-02-03' },
    ];
    const r = classify({ id: 'i', givenName: 'Margaret', surname: 'Smith', birthDate: '1842-04-12', deathDate: '1911-02-03' }, many);
    expect(r).toEqual({ tier: 'strong', candidateId: 's' });
  });
});

describe('diffFields', () => {
  it('tags filled, unchanged, and conflict fields and omits both-empty', () => {
    const result = diffFields(
      { middle: '', occupation: 'Seamstress', birthPlace: 'London', notes: '' },
      { middle: 'Eleanor', occupation: 'Dressmaker', birthPlace: 'London', notes: '' },
    );
    expect(result).toContainEqual({ field: 'middle', existing: '', incoming: 'Eleanor', status: 'filled' });
    expect(result).toContainEqual({ field: 'occupation', existing: 'Seamstress', incoming: 'Dressmaker', status: 'conflict' });
    expect(result).toContainEqual({ field: 'birthPlace', existing: 'London', incoming: 'London', status: 'unchanged' });
    expect(result.find((f: FieldDiff) => f.field === 'notes')).toBeUndefined();
  });

  it('treats incoming-blank as unchanged when existing has a value', () => {
    const result = diffFields(
      { occupation: 'Seamstress' },
      { occupation: '' },
    );
    expect(result).toContainEqual({ field: 'occupation', existing: 'Seamstress', incoming: '', status: 'unchanged' });
  });
});

describe('dedupe keys', () => {
  it('coupleKey is order-independent', () => {
    expect(coupleKey('a', 'b')).toBe(coupleKey('b', 'a'));
  });
  it('sourceKey normalizes title and author', () => {
    expect(sourceKey('  1900 Census ', 'US Gov')).toBe(sourceKey('1900 census', 'us gov'));
  });
});
