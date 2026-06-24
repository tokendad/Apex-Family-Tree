import { getDatabase } from '../../db/connection.js';
import type { Person, Name, Family, FamilyMember, Event, Source, SourceRepository as SourceRepoType } from '../../types/db.js';

const MONTH_ABBR = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSex551(sex: string): string {
  if (sex === 'M' || sex === 'F') return sex;
  return 'U';
}

function getGivenNames(name: Name): string | null {
  return [name.given_name, name.middle_name].filter(Boolean).join(' ') || null;
}

function formatGedcomName(name: Name): string {
  const parts: string[] = [];
  if (name.prefix) parts.push(name.prefix);
  const givenNames = getGivenNames(name);
  if (givenNames) parts.push(givenNames);
  parts.push(name.surname ? `/${name.surname}/` : '//');
  if (name.suffix) parts.push(name.suffix);
  return parts.join(' ');
}

// ─── Person IDs in scope ────────────────────────────────────────────────────

export interface ExportScope {
  scope: 'full' | 'ancestors' | 'descendants' | 'date_range';
  personId?: string;
  startDate?: string;
  endDate?: string;
}

export function getPersonIdsInScope(opts: ExportScope): string[] {
  const db = getDatabase();

  if (opts.scope === 'full') {
    return (db.prepare('SELECT id FROM persons').all() as { id: string }[]).map(r => r.id);
  }

  if (opts.scope === 'ancestors' && opts.personId) {
    const rows = db.prepare(`
      WITH RECURSIVE ancestors(pid) AS (
        VALUES(?)
        UNION
        SELECT CASE WHEN f.spouse1_id = a.pid THEN NULL ELSE f.spouse1_id END
        FROM ancestors a
        JOIN family_members fm ON fm.person_id = a.pid
        JOIN families f ON f.id = fm.family_id
        WHERE f.spouse1_id IS NOT NULL AND f.spouse1_id != a.pid
        UNION
        SELECT CASE WHEN f.spouse2_id = a.pid THEN NULL ELSE f.spouse2_id END
        FROM ancestors a
        JOIN family_members fm ON fm.person_id = a.pid
        JOIN families f ON f.id = fm.family_id
        WHERE f.spouse2_id IS NOT NULL AND f.spouse2_id != a.pid
      )
      SELECT DISTINCT pid FROM ancestors WHERE pid IS NOT NULL
    `).all(opts.personId) as { pid: string }[];
    return rows.map(r => r.pid);
  }

  if (opts.scope === 'descendants' && opts.personId) {
    const rows = db.prepare(`
      WITH RECURSIVE descendants(pid) AS (
        VALUES(?)
        UNION
        SELECT fm.person_id
        FROM descendants d
        JOIN families f ON f.spouse1_id = d.pid OR f.spouse2_id = d.pid
        JOIN family_members fm ON fm.family_id = f.id
      )
      SELECT DISTINCT pid FROM descendants WHERE pid IS NOT NULL
    `).all(opts.personId) as { pid: string }[];
    return rows.map(r => r.pid);
  }

  if (opts.scope === 'date_range') {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts.startDate) {
      conditions.push('e.event_date_sort_key >= ?');
      const parts = opts.startDate.split('-');
      params.push(parseInt(parts[0]) * 10000 + (parseInt(parts[1] || '0')) * 100 + parseInt(parts[2] || '0'));
    }
    if (opts.endDate) {
      conditions.push('e.event_date_sort_key <= ?');
      const parts = opts.endDate.split('-');
      params.push(parseInt(parts[0]) * 10000 + (parseInt(parts[1] || '0')) * 100 + parseInt(parts[2] || '0'));
    }
    if (conditions.length === 0) {
      return (db.prepare('SELECT id FROM persons').all() as { id: string }[]).map(r => r.id);
    }
    const rows = db.prepare(`
      SELECT DISTINCT e.person_id as id FROM events e WHERE ${conditions.join(' AND ')}
    `).all(...params) as { id: string }[];
    return rows.map(r => r.id);
  }

  return [];
}

// ─── Export Data ─────────────────────────────────────────────────────────────

export interface ExportData {
  persons: (Person & { names: Name[]; events: Event[] })[];
  families: (Family & { children: FamilyMember[] })[];
  sources: Source[];
  repositories: SourceRepoType[];
}

export function gatherExportData(personIds: string[]): ExportData {
  const db = getDatabase();

  if (personIds.length === 0) {
    return { persons: [], families: [], sources: [], repositories: [] };
  }

  const placeholders = personIds.map(() => '?').join(',');

  const persons = db.prepare(`SELECT * FROM persons WHERE id IN (${placeholders})`).all(...personIds) as Person[];
  const personData = persons.map(p => {
    const names = db.prepare('SELECT * FROM names WHERE person_id = ? ORDER BY is_primary DESC, sort_order ASC').all(p.id) as Name[];
    const events = db.prepare('SELECT * FROM events WHERE person_id = ? ORDER BY event_date_sort_key ASC NULLS LAST').all(p.id) as Event[];
    return { ...p, names, events };
  });

  // Get families where at least one spouse is in scope
  const families = db.prepare(`
    SELECT DISTINCT f.* FROM families f
    WHERE f.spouse1_id IN (${placeholders}) OR f.spouse2_id IN (${placeholders})
  `).all(...personIds, ...personIds) as Family[];

  const familyData = families.map(f => {
    const children = db.prepare('SELECT * FROM family_members WHERE family_id = ? ORDER BY sort_order ASC').all(f.id) as FamilyMember[];
    return { ...f, children };
  });

  const sources = db.prepare('SELECT * FROM sources').all() as Source[];
  const repositories = db.prepare('SELECT * FROM source_repositories').all() as SourceRepoType[];

  return { persons: personData, families: familyData, sources, repositories };
}

// ─── Generate GEDCOM 5.5.1 ──────────────────────────────────────────────────

export function generateGedcom551(data: ExportData): string {
  const lines: string[] = [];

  // Header
  lines.push('0 HEAD');
  lines.push('1 SOUR ApexFamilyTree');
  lines.push('2 NAME Apex Family Tree');
  lines.push('2 VERS 1.0');
  lines.push('1 DEST DISKETTE');
  lines.push('1 DATE ' + formatCurrentDate());
  lines.push('1 GEDC');
  lines.push('2 VERS 5.5.1');
  lines.push('2 FORM LINEAGE-LINKED');
  lines.push('1 CHAR UTF-8');

  // Build ID maps for xref references
  const personXref = new Map<string, string>();
  const familyXref = new Map<string, string>();
  const sourceXref = new Map<string, string>();
  const repoXref = new Map<string, string>();

  data.persons.forEach((p, i) => personXref.set(p.id, p.gedcom_id || `@I${i + 1}@`));
  data.families.forEach((f, i) => familyXref.set(f.id, f.gedcom_id || `@F${i + 1}@`));
  data.sources.forEach((s, i) => sourceXref.set(s.id, s.gedcom_id || `@S${i + 1}@`));
  data.repositories.forEach((r, i) => repoXref.set(r.id, r.gedcom_id || `@R${i + 1}@`));

  // Ensure xrefs have @ delimiters
  const ensureXref = (x: string) => x.startsWith('@') ? x : `@${x}@`;

  // Individuals
  for (const person of data.persons) {
    const xref = ensureXref(personXref.get(person.id)!);
    lines.push(`0 ${xref} INDI`);

    for (const name of person.names) {
      const givenNames = getGivenNames(name);
      lines.push(`1 NAME ${formatGedcomName(name)}`);
      if (givenNames) lines.push(`2 GIVN ${givenNames}`);
      if (name.surname) lines.push(`2 SURN ${name.surname}`);
      if (name.prefix) lines.push(`2 NPFX ${name.prefix}`);
      if (name.suffix) lines.push(`2 NSFX ${name.suffix}`);
      if (name.nickname) lines.push(`2 NICK ${name.nickname}`);
    }

    lines.push(`1 SEX ${formatSex551(person.sex)}`);

    for (const event of person.events) {
      const tag = getEventTag551(event.event_type);
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

  // Trailer
  lines.push('0 TRLR');

  return lines.join('\n') + '\n';
}

// ─── Event Tag Reverse Mapping (551) ────────────────────────────────────────

function getEventTag551(eventType: string): string | null {
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
