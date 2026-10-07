import { describe, expect, it } from 'vitest';
import type { TreeFamily, TreePerson } from '@/stores/canvasStore';
import { toTopolaData } from './topolaAdapter';

function person(id: string, sex: TreePerson['sex'] = 'U', birth: string | null = null): TreePerson {
  return {
    id,
    given_name: id,
    surname: 'Test',
    sex,
    birth_date: birth,
    death_date: null,
    is_living: true,
    is_private: false,
    photo_url: null,
  };
}

function family(id: string, s1: string | null, s2: string | null, kids: string[] = []): TreeFamily {
  return { id, spouse1_id: s1, spouse2_id: s2, children_ids: kids, marriage_date: null };
}

describe('toTopolaData', () => {
  it('links spouses and children in both directions', () => {
    const data = toTopolaData(
      [person('dad', 'M'), person('mom', 'F'), person('kid')],
      [family('f1', 'dad', 'mom', ['kid'])],
    );
    const byId = new Map(data.indis.map((i) => [i.id, i]));
    expect(data.fams[0]).toMatchObject({ husb: 'dad', wife: 'mom', children: ['kid'] });
    expect(byId.get('dad')?.fams).toEqual(['f1']);
    expect(byId.get('mom')?.fams).toEqual(['f1']);
    expect(byId.get('kid')?.famc).toBe('f1');
  });

  it('puts the female spouse in the wife slot regardless of stored order', () => {
    const data = toTopolaData(
      [person('a', 'F'), person('b', 'M')],
      [family('f1', 'a', 'b')],
    );
    expect(data.fams[0]).toMatchObject({ husb: 'b', wife: 'a' });
  });

  it('supports multiple marriages for one person', () => {
    const data = toTopolaData(
      [person('m', 'M'), person('w1', 'F'), person('w2', 'F')],
      [family('f1', 'm', 'w1'), family('f2', 'm', 'w2')],
    );
    expect(data.indis.find((i) => i.id === 'm')?.fams).toEqual(['f1', 'f2']);
  });

  it('drops references to unknown people and empty families', () => {
    const data = toTopolaData(
      [person('a', 'M'), person('kid')],
      [family('f1', 'a', 'ghost', ['kid', 'ghost2']), family('f2', 'ghost', null, ['ghost2'])],
    );
    expect(data.fams).toHaveLength(1);
    expect(data.fams[0]).toMatchObject({ husb: 'a', children: ['kid'] });
    expect(data.fams[0].wife).toBeUndefined();
  });

  it('keeps only the first parent family for a child', () => {
    const data = toTopolaData(
      [person('a'), person('b'), person('kid')],
      [family('f1', 'a', null, ['kid']), family('f2', 'b', null, ['kid'])],
    );
    expect(data.indis.find((i) => i.id === 'kid')?.famc).toBe('f1');
  });

  it('parses full, partial and unparseable dates', () => {
    const data = toTopolaData(
      [person('a', 'U', '1950-03-12'), person('b', 'U', '1900'), person('c', 'U', 'abt 1800')],
      [],
    );
    const births = data.indis.map((i) => i.birth?.date);
    expect(births[0]).toEqual({ year: 1950, month: 3, day: 12 });
    expect(births[1]).toEqual({ year: 1900 });
    expect(births[2]).toEqual({ text: 'abt 1800' });
  });
});
