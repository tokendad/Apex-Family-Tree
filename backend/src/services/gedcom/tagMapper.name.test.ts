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

describe('GEDCOM family mapping', () => {
  it('captures family-level marriage and divorce events', () => {
    const parsed = parseGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1 JAN 1990
2 PLAC Boston, MA
1 DIV
2 DATE 1 JAN 2000
2 PLAC Boston, MA
0 TRLR
`);

    const mapped = mapGedcomRecords(parsed.records);
    expect(mapped.families).toHaveLength(1);

    expect(mapped.families[0]).toMatchObject({
      xref: '@F1@',
      spouse1Xref: '@I1@',
      spouse2Xref: '@I2@',
      marriageDate: '1 JAN 1990',
      marriagePlace: 'Boston, MA',
      divorceDate: '1 JAN 2000',
      divorcePlace: 'Boston, MA',
    });

    expect(mapped.families[0].events).toEqual([
      expect.objectContaining({
        eventType: 'marriage',
        date: '1 JAN 1990',
        place: 'Boston, MA',
      }),
      expect.objectContaining({
        eventType: 'divorce',
        date: '1 JAN 2000',
        place: 'Boston, MA',
      }),
    ]);
  });
});
