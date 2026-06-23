import { describe, it, expect } from 'vitest';
import {
  getPersonDisplayName,
  getPersonDates,
  getFamilyDisplayName,
} from './entityDisplay';

describe('getPersonDisplayName', () => {
  it('joins given name and surname', () => {
    expect(getPersonDisplayName({ given_name: 'Mary', surname: 'Johnson' })).toBe('Mary Johnson');
  });
  it('returns only given name when surname is null', () => {
    expect(getPersonDisplayName({ given_name: 'Mary', surname: null })).toBe('Mary');
  });
  it('returns "Unknown" when both are null', () => {
    expect(getPersonDisplayName({ given_name: null, surname: null })).toBe('Unknown');
  });
});

describe('getPersonDates', () => {
  it('formats birth and death dates', () => {
    expect(getPersonDates({ birth_date: '1884', death_date: '1950' })).toBe('b. 1884 — d. 1950');
  });
  it('formats birth date only', () => {
    expect(getPersonDates({ birth_date: '1884', death_date: null })).toBe('b. 1884');
  });
  it('returns empty string when both are null', () => {
    expect(getPersonDates({ birth_date: null, death_date: null })).toBe('');
  });
});

describe('getFamilyDisplayName', () => {
  it('joins spouse display names with &', () => {
    const result = getFamilyDisplayName({
      spouse1: { given_name: 'John', surname: 'Smith' },
      spouse2: { given_name: 'Mary', surname: 'Johnson' },
    });
    expect(result).toBe('John Smith & Mary Johnson');
  });
  it('handles single spouse', () => {
    expect(
      getFamilyDisplayName({ spouse1: { given_name: 'John', surname: 'Smith' }, spouse2: null })
    ).toBe('John Smith');
  });
  it('returns "Unknown Family" when both spouses are null', () => {
    expect(getFamilyDisplayName({ spouse1: null, spouse2: null })).toBe('Unknown Family');
  });
});
