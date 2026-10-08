import { describe, expect, it } from 'vitest';
import type { TreeFamily, TreePerson } from '@/stores/canvasStore';
import { toFamilyChartData } from './familyChartAdapter';

function person(id: string, sex: TreePerson['sex'] = 'U', birth: string | null = null, death: string | null = null): TreePerson {
  return {
    id, given_name: id, surname: 'Test', sex, birth_date: birth, death_date: death,
    is_living: !death, is_private: false, photo_url: null,
  };
}
function family(id: string, s1: string | null, s2: string | null, kids: string[] = []): TreeFamily {
  return { id, spouse1_id: s1, spouse2_id: s2, children_ids: kids, marriage_date: null };
}

describe('toFamilyChartData', () => {
  it('builds symmetric parent/spouse/child relationships', () => {
    const data = toFamilyChartData(
      [person('dad', 'M'), person('mom', 'F'), person('kid')],
      [family('f1', 'dad', 'mom', ['kid'])],
    );
    const byId = new Map(data.map((d) => [d.id, d]));
    expect(byId.get('dad')!.rels).toEqual({ parents: [], spouses: ['mom'], children: ['kid'] });
    expect(byId.get('mom')!.rels.spouses).toEqual(['dad']);
    expect(byId.get('kid')!.rels.parents).toEqual(['dad', 'mom']);
  });

  it('lists the father first even if the mother is stored as spouse1', () => {
    const data = toFamilyChartData(
      [person('mom', 'F'), person('dad', 'M'), person('kid')],
      [family('f1', 'mom', 'dad', ['kid'])],
    );
    expect(data.find((d) => d.id === 'kid')!.rels.parents).toEqual(['dad', 'mom']);
  });

  it('renders unknown and non-binary sexes as genderless rather than guessing', () => {
    const data = toFamilyChartData(
      [person('unknown', 'U'), person('nonbinary', 'X'), person('male', 'M'), person('female', 'F')],
      [],
    );
    const genderOf = (id: string) => data.find((d) => d.id === id)!.data.gender;
    expect(genderOf('unknown')).toBe('U');
    expect(genderOf('nonbinary')).toBe('U');
    expect(genderOf('male')).toBe('M');
    expect(genderOf('female')).toBe('F');
  });

  it('does not infer a spouse gender from their partner', () => {
    const data = toFamilyChartData([person('a', 'F'), person('b', 'U')], [family('f1', 'a', 'b')]);
    expect(data.find((d) => d.id === 'b')!.data.gender).toBe('U');
    const data2 = toFamilyChartData([person('a', 'U'), person('b', 'M')], [family('f1', 'a', 'b')]);
    expect(data2.find((d) => d.id === 'a')!.data.gender).toBe('U');
  });

  it('still lists a known father first when the other parent is genderless', () => {
    const data = toFamilyChartData(
      [person('dad', 'M'), person('other', 'U'), person('kid')],
      [family('f1', 'other', 'dad', ['kid'])],
    );
    expect(data.find((d) => d.id === 'kid')!.rels.parents).toEqual(['dad', 'other']);
  });

  it('supports multiple marriages and drops unknown ids', () => {
    const data = toFamilyChartData(
      [person('m', 'M'), person('w1', 'F'), person('w2', 'F'), person('kid')],
      [family('f1', 'm', 'w1'), family('f2', 'm', 'w2', ['kid', 'ghost']), family('f3', 'ghost', null, ['kid'])],
    );
    const m = data.find((d) => d.id === 'm')!;
    expect(m.rels.spouses).toEqual(['w1', 'w2']);
    expect(m.rels.children).toEqual(['kid']);
    expect(data.find((d) => d.id === 'kid')!.rels.parents).toEqual(['m', 'w2']);
  });

  it('keeps only the first parent family for a child', () => {
    const data = toFamilyChartData(
      [person('a', 'M'), person('b', 'F'), person('kid')],
      [family('f1', 'a', null, ['kid']), family('f2', 'b', null, ['kid'])],
    );
    expect(data.find((d) => d.id === 'kid')!.rels.parents).toEqual(['a']);
  });

  it('formats life years', () => {
    const data = toFamilyChartData(
      [person('a', 'M', '1950-03-12'), person('b', 'M', '1900', '1980-01-01'), person('c', 'M')],
      [],
    );
    expect(data.map((d) => d.data.years)).toEqual(['b. 1950', '1900 – 1980', '']);
  });
});
