import { describe, expect, it } from 'vitest';
import { generateGedcom551, type ExportData } from './exporter551.js';
import { generateGedcom70 } from './exporter70.js';

const exportData: ExportData = {
  persons: [
    {
      id: 'p1',
      sex: 'F',
      is_living: 1,
      is_private: 0,
      gedcom_id: '@I1@',
      notes: null,
      display_name: 'Custom display should not export',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      names: [
        {
          id: 'n1',
          person_id: 'p1',
          name_type: 'birth',
          prefix: 'Dr.',
          given_name: 'Jane',
          middle_name: 'Anne',
          surname: 'Smith',
          suffix: 'Jr.',
          nickname: 'Jenny',
          is_primary: 1,
          sort_order: 0,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      events: [],
    },
  ],
  families: [],
  sources: [],
  repositories: [],
};

describe('GEDCOM name export', () => {
  it('reconstructs GEDCOM 5.5.1 names from structured fields', () => {
    const gedcom = generateGedcom551(exportData);

    expect(gedcom).toContain('1 NAME Dr. Jane Anne /Smith/ Jr.');
    expect(gedcom).toContain('2 GIVN Jane Anne');
    expect(gedcom).toContain('2 SURN Smith');
    expect(gedcom).toContain('2 NICK Jenny');
    expect(gedcom).not.toContain('Custom display should not export');
  });

  it('reconstructs GEDCOM 7.0 names from structured fields', () => {
    const gedcom = generateGedcom70(exportData);

    expect(gedcom).toContain('1 NAME Dr. Jane Anne /Smith/ Jr.');
    expect(gedcom).toContain('2 GIVN Jane Anne');
    expect(gedcom).toContain('2 SURN Smith');
    expect(gedcom).toContain('2 NICK Jenny');
    expect(gedcom).not.toContain('Custom display should not export');
  });
});
