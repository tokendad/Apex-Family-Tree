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
  it('prefers formatted displayName when present', () => {
    expect(getPersonDisplayName({ displayName: 'Dr. Mary J.', given_name: 'Mary', surname: 'Johnson' })).toBe('Dr. Mary J.');
  });
  it('includes middle name in fallback display', () => {
    expect(getPersonDisplayName({ given_name: 'Mary', middle_name: 'Anne', surname: 'Johnson' })).toBe('Mary Anne Johnson');
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

describe('getPersonDisplayName — prefix and suffix', () => {
  // Regression: a father and son recorded as Sr and Jr rendered identically,
  // so two distinct people looked like one duplicated card.
  const senior = {
    prefix: null,
    given_name: 'Raymond',
    middle_name: 'Earl',
    surname: 'LeFort',
    suffix: 'Sr',
  };
  const junior = { ...senior, suffix: 'Jr' };

  it('distinguishes Sr from Jr', () => {
    expect(getPersonDisplayName(senior)).toBe('Raymond Earl LeFort Sr');
    expect(getPersonDisplayName(junior)).toBe('Raymond Earl LeFort Jr');
    expect(getPersonDisplayName(senior)).not.toBe(getPersonDisplayName(junior));
  });

  it('includes a prefix', () => {
    expect(getPersonDisplayName({ ...senior, prefix: 'Rev.', suffix: null })).toBe(
      'Rev. Raymond Earl LeFort',
    );
  });

  it('still prefers a backend-formatted displayName', () => {
    expect(getPersonDisplayName({ ...senior, displayName: 'Ray LeFort Sr' })).toBe('Ray LeFort Sr');
  });

  it('omits absent parts without leaving gaps', () => {
    expect(getPersonDisplayName({ given_name: 'Mabel', surname: 'Merandith' })).toBe(
      'Mabel Merandith',
    );
  });
});
