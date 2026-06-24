export function getPersonDisplayName(p: {
  displayName?: string | null;
  display_name?: string | null;
  given_name: string | null;
  middle_name?: string | null;
  surname: string | null;
}): string {
  if (p.displayName?.trim()) return p.displayName.trim();
  if (p.display_name?.trim()) return p.display_name.trim();

  const parts = [p.given_name, p.middle_name, p.surname].filter(Boolean);
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
  spouse1: { displayName?: string | null; display_name?: string | null; given_name: string | null; middle_name?: string | null; surname: string | null } | null;
  spouse2: { displayName?: string | null; display_name?: string | null; given_name: string | null; middle_name?: string | null; surname: string | null } | null;
}): string {
  const parts = [f.spouse1, f.spouse2]
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map(getPersonDisplayName);
  return parts.length > 0 ? parts.join(' & ') : 'Unknown Family';
}
