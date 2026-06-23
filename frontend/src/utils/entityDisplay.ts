export function getPersonDisplayName(p: {
  given_name: string | null;
  surname: string | null;
}): string {
  const parts = [p.given_name, p.surname].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

export function getPersonDates(p: {
  birth_date: string | null;
  death_date: string | null;
}): string {
  const parts: string[] = [];
  if (p.birth_date) parts.push(`b. ${p.birth_date}`);
  if (p.death_date) parts.push(`d. ${p.death_date}`);
  return parts.join(' — ');
}

export function getFamilyDisplayName(f: {
  spouse1: { given_name: string | null; surname: string | null } | null;
  spouse2: { given_name: string | null; surname: string | null } | null;
}): string {
  const parts = [f.spouse1, f.spouse2]
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map(getPersonDisplayName);
  return parts.length > 0 ? parts.join(' & ') : 'Unknown Family';
}
