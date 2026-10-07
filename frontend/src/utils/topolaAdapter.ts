import type { JsonEvent, JsonFam, JsonGedcomData, JsonIndi } from 'topola';
import type { TreeFamily, TreePerson } from '@/stores/canvasStore';

/** Parses an ISO-ish date string (YYYY, YYYY-MM, YYYY-MM-DD) into a Topola event. */
function toEvent(value: string | null): JsonEvent | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(value.trim());
  if (!match) return { date: { text: value } };
  const [, year, month, day] = match;
  return {
    date: {
      year: Number(year),
      ...(month ? { month: Number(month) } : {}),
      ...(day ? { day: Number(day) } : {}),
    },
  };
}

/**
 * Converts AFT tree data into Topola's JSON GEDCOM shape. Topola models a
 * family as a husband/wife pair, so spouse1/spouse2 are mapped by sex where
 * known and otherwise by position. Links to people missing from `persons`
 * are dropped so Topola never dereferences an unknown id.
 */
export function toTopolaData(persons: TreePerson[], families: TreeFamily[]): JsonGedcomData {
  const known = new Set(persons.map((p) => p.id));
  const indis = new Map<string, JsonIndi>();

  for (const p of persons) {
    const indi: JsonIndi = {
      id: p.id,
      firstName: [p.given_name, p.middle_name].filter(Boolean).join(' ') || undefined,
      lastName: p.surname ?? undefined,
      sex: p.sex === 'M' ? 'M' : p.sex === 'F' ? 'F' : undefined,
      birth: toEvent(p.birth_date),
      death: toEvent(p.death_date),
      images: p.photo_url ? [{ url: p.photo_url }] : undefined,
      hideId: true,
    };
    indis.set(p.id, indi);
  }

  const fams: JsonFam[] = [];
  for (const f of families) {
    const [a, b] = [f.spouse1_id, f.spouse2_id].map((id) => (id && known.has(id) ? id : undefined));
    const children = f.children_ids.filter((id) => known.has(id));
    if (!a && !b && children.length === 0) continue;

    // Put a female spouse in the wife slot, otherwise keep the stored order.
    const aIsFemale = a ? indis.get(a)?.sex === 'F' : false;
    const bIsMale = b ? indis.get(b)?.sex === 'M' : false;
    const swap = aIsFemale || bIsMale;
    const husb = swap ? b : a;
    const wife = swap ? a : b;

    fams.push({
      id: f.id,
      ...(husb ? { husb } : {}),
      ...(wife ? { wife } : {}),
      children,
      marriage: toEvent(f.marriage_date),
    });

    for (const spouse of [husb, wife]) {
      if (!spouse) continue;
      const indi = indis.get(spouse)!;
      indi.fams = [...(indi.fams ?? []), f.id];
    }
    for (const child of children) {
      const indi = indis.get(child)!;
      // Topola supports a single parent family per person; keep the first.
      indi.famc ??= f.id;
    }
  }

  return { indis: [...indis.values()], fams };
}
