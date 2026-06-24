import { describe, expect, it } from 'vitest';
import { parseGedcom } from './parser.js';
import { mapGedcomRecords } from './tagMapper.js';

describe('GEDCOM name mapping', () => {
  it('splits GIVN on first space and maps NICK to nickname', () => {
    const parsed = parseGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Dr. Jane Anne /Smith/ Jr.
2 GIVN Jane Anne
2 SURN Smith
2 NPFX Dr.
2 NSFX Jr.
2 NICK Jenny
1 SEX F
0 TRLR
`);

    const mapped = mapGedcomRecords(parsed.records);
    expect(mapped.persons).toHaveLength(1);

    const name = mapped.persons[0].names[0];
    expect(name).toMatchObject({
      prefix: 'Dr.',
      givenName: 'Jane',
      middleName: 'Anne',
      surname: 'Smith',
      suffix: 'Jr.',
      nickname: 'Jenny',
      isPrimary: true,
    });
  });
});
