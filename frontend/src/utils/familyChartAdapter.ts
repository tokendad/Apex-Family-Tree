import type { Data, Datum } from 'family-chart';
import type { TreeFamily, TreePerson } from '@/stores/canvasStore';

function years(person: TreePerson): string {
  const y = (v: string | null) => (v ? v.slice(0, 4) : '');
  const birth = y(person.birth_date);
  const death = y(person.death_date);
  if (!birth && !death) return '';
  return death ? `${birth || '?'} – ${death}` : `b. ${birth}`;
}

/**
 * Converts AFT persons/families into family-chart's per-person relationship
 * model (rels.parents / spouses / children). family-chart has no family
 * entity, so marriage dates are not carried over, and every person needs a
 * gender of M or F: unknown sexes are filled in from the spouse (opposite) or
 * default to M. A child keeps only its first parent family.
 */
export function toFamilyChartData(persons: TreePerson[], families: TreeFamily[]): Data {
  const known = new Set(persons.map((p) => p.id));
  const byId = new Map<string, Datum>();

  for (const p of persons) {
    byId.set(p.id, {
      id: p.id,
      data: {
        gender: p.sex === 'F' ? 'F' : 'M',
        'first name': [p.given_name, p.middle_name].filter(Boolean).join(' '),
        'last name': p.surname ?? '',
        birthday: p.birth_date ?? '',
        years: years(p),
        avatar: p.photo_url ?? '',
      },
      rels: { parents: [], spouses: [], children: [] },
    });
  }

  const add = (list: string[], id: string) => {
    if (!list.includes(id)) list.push(id);
  };

  for (const f of families) {
    const parents = [f.spouse1_id, f.spouse2_id].filter(
      (id): id is string => !!id && known.has(id),
    );

    if (parents.length === 2) {
      const [a, b] = parents.map((id) => byId.get(id)!);
      const aSex = persons.find((p) => p.id === a.id)!.sex;
      const bSex = persons.find((p) => p.id === b.id)!.sex;
      if (aSex !== 'M' && aSex !== 'F' && (bSex === 'M' || bSex === 'F')) {
        a.data.gender = bSex === 'M' ? 'F' : 'M';
      } else if (bSex !== 'M' && bSex !== 'F') {
        b.data.gender = a.data.gender === 'M' ? 'F' : 'M';
      }
      add(a.rels.spouses, b.id);
      add(b.rels.spouses, a.id);
    }

    for (const childId of f.children_ids) {
      const child = byId.get(childId);
      if (!child) continue;
      for (const parentId of parents) add(byId.get(parentId)!.rels.children, childId);
      // Only a single parent family per child is representable.
      if (child.rels.parents.length === 0) {
        // family-chart expects the father first, then the mother.
        const ordered = [...parents].sort(
          (x, y) => (byId.get(x)!.data.gender === 'M' ? 0 : 1) - (byId.get(y)!.data.gender === 'M' ? 0 : 1),
        );
        child.rels.parents.push(...ordered);
      }
    }
  }

  return [...byId.values()];
}
