import type { ExportData } from './exporter551.js';

const MONTH_ABBR = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function formatSex70(sex: string): string {
  if (sex === 'M' || sex === 'F' || sex === 'X') return sex;
  return 'U';
}

function getEventTag70(eventType: string): string | null {
  const map: Record<string, string> = {
    birth: 'BIRT',
    death: 'DEAT',
    burial: 'BURI',
    cremation: 'CREM',
    christening: 'CHR',
    baptism: 'BAPM',
    confirmation: 'CONF',
    first_communion: 'FCOM',
    graduation: 'GRAD',
    emigration: 'EMIG',
    immigration: 'IMMI',
    naturalization: 'NATU',
    census: 'CENS',
    probate: 'PROB',
    will: 'WILL',
    retirement: 'RETI',
    other: 'EVEN',
    occupation: 'OCCU',
    residence: 'RESI',
    education: 'EDUC',
    religion: 'RELI',
    ssn: 'SSN',
    title: 'TITL',
  };
  return map[eventType] || null;
}

function formatCurrentDate(): string {
  const d = new Date();
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth() + 1]} ${d.getFullYear()}`;
}

export function generateGedcom70(data: ExportData): string {
  const lines: string[] = [];

  // GEDCOM 7.0 header
  lines.push('0 HEAD');
  lines.push('1 GEDC');
  lines.push('2 VERS 7.0');
  lines.push('1 SOUR ApexFamilyTree');
  lines.push('2 NAME Apex Family Tree');
  lines.push('2 VERS 1.0');
  lines.push('1 DATE ' + formatCurrentDate());
  lines.push('1 SCHMA');
  lines.push('2 TAG _AFT https://apexfamilytree.app/gedcom/ext');

  // Build ID maps
  const personXref = new Map<string, string>();
  const familyXref = new Map<string, string>();
  const sourceXref = new Map<string, string>();
  const repoXref = new Map<string, string>();

  data.persons.forEach((p, i) => personXref.set(p.id, p.gedcom_id || `@I${i + 1}@`));
  data.families.forEach((f, i) => familyXref.set(f.id, f.gedcom_id || `@F${i + 1}@`));
  data.sources.forEach((s, i) => sourceXref.set(s.id, s.gedcom_id || `@S${i + 1}@`));
  data.repositories.forEach((r, i) => repoXref.set(r.id, r.gedcom_id || `@R${i + 1}@`));

  const ensureXref = (x: string) => x.startsWith('@') ? x : `@${x}@`;

  // Individuals
  for (const person of data.persons) {
    const xref = ensureXref(personXref.get(person.id)!);
    lines.push(`0 ${xref} INDI`);

    for (const name of person.names) {
      const parts: string[] = [];
      if (name.given_name) parts.push(name.given_name);
      if (name.surname) parts.push(`/${name.surname}/`);
      else parts.push('//');
      lines.push(`1 NAME ${parts.join(' ')}`);
      if (name.given_name) lines.push(`2 GIVN ${name.given_name}`);
      if (name.surname) lines.push(`2 SURN ${name.surname}`);
      if (name.prefix) lines.push(`2 NPFX ${name.prefix}`);
      if (name.suffix) lines.push(`2 NSFX ${name.suffix}`);
    }

    lines.push(`1 SEX ${formatSex70(person.sex)}`);

    for (const event of person.events) {
      const tag = getEventTag70(event.event_type);
      if (!tag) continue;
      lines.push(`1 ${tag}` + (event.description ? ` ${event.description}` : ''));
      if (event.event_date) lines.push(`2 DATE ${event.event_date}`);
      if (event.event_place) lines.push(`2 PLAC ${event.event_place}`);
    }

    // Family links
    for (const family of data.families) {
      const fxref = ensureXref(familyXref.get(family.id)!);
      if (family.spouse1_id === person.id || family.spouse2_id === person.id) {
        lines.push(`1 FAMS ${fxref}`);
      }
      if (family.children.some(c => c.person_id === person.id)) {
        lines.push(`1 FAMC ${fxref}`);
      }
    }
  }

  // Families
  for (const family of data.families) {
    const xref = ensureXref(familyXref.get(family.id)!);
    lines.push(`0 ${xref} FAM`);

    if (family.spouse1_id && personXref.has(family.spouse1_id)) {
      lines.push(`1 HUSB ${ensureXref(personXref.get(family.spouse1_id)!)}`);
    }
    if (family.spouse2_id && personXref.has(family.spouse2_id)) {
      lines.push(`1 WIFE ${ensureXref(personXref.get(family.spouse2_id)!)}`);
    }
    for (const child of family.children) {
      if (personXref.has(child.person_id)) {
        lines.push(`1 CHIL ${ensureXref(personXref.get(child.person_id)!)}`);
      }
    }

    if (family.marriage_date || family.marriage_place) {
      lines.push('1 MARR');
      if (family.marriage_date) lines.push(`2 DATE ${family.marriage_date}`);
      if (family.marriage_place) lines.push(`2 PLAC ${family.marriage_place}`);
    }
    if (family.divorce_date || family.divorce_place) {
      lines.push('1 DIV');
      if (family.divorce_date) lines.push(`2 DATE ${family.divorce_date}`);
      if (family.divorce_place) lines.push(`2 PLAC ${family.divorce_place}`);
    }
  }

  // Sources
  for (const source of data.sources) {
    const xref = ensureXref(sourceXref.get(source.id)!);
    lines.push(`0 ${xref} SOUR`);
    lines.push(`1 TITL ${source.title}`);
    if (source.author) lines.push(`1 AUTH ${source.author}`);
    if (source.publisher) lines.push(`1 PUBL ${source.publisher}`);
    if (source.notes) lines.push(`1 NOTE ${source.notes}`);
    if (source.repository_id && repoXref.has(source.repository_id)) {
      lines.push(`1 REPO ${ensureXref(repoXref.get(source.repository_id)!)}`);
    }
  }

  // Repositories
  for (const repo of data.repositories) {
    const xref = ensureXref(repoXref.get(repo.id)!);
    lines.push(`0 ${xref} REPO`);
    lines.push(`1 NAME ${repo.name}`);
    if (repo.address) lines.push(`1 ADDR ${repo.address}`);
    if (repo.url) lines.push(`1 WWW ${repo.url}`);
  }

  lines.push('0 TRLR');

  return lines.join('\n') + '\n';
}
