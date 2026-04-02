export interface GedcomRecord {
  level: number;
  xref: string | null;
  tag: string;
  value: string | null;
  children: GedcomRecord[];
}

export interface ParseResult {
  records: GedcomRecord[];
  warnings: string[];
  version: string | null;
  encoding: string | null;
}

const LINE_REGEX = /^(\d+)\s+(@[^@]+@\s+)?(\S+)(\s+(.*))?$/;

function stripBom(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

function parseLine(line: string): { level: number; xref: string | null; tag: string; value: string | null } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(LINE_REGEX);
  if (!match) return null;

  const level = parseInt(match[1], 10);
  const xref = match[2] ? match[2].trim() : null;
  const tag = match[3].toUpperCase();
  const value = match[5] !== undefined ? match[5] : null;

  return { level, xref, tag, value };
}

function detectVersion(records: GedcomRecord[]): string | null {
  const headRecord = records.find(r => r.tag === 'HEAD');
  if (!headRecord) return null;

  const gedcRecord = headRecord.children.find(c => c.tag === 'GEDC');
  if (!gedcRecord) return null;

  const versRecord = gedcRecord.children.find(c => c.tag === 'VERS');
  if (!versRecord) return null;

  return versRecord.value;
}

function detectEncoding(records: GedcomRecord[]): string | null {
  const headRecord = records.find(r => r.tag === 'HEAD');
  if (!headRecord) return null;

  const charRecord = headRecord.children.find(c => c.tag === 'CHAR');
  if (charRecord) return charRecord.value;

  // GEDCOM 7.0 is always UTF-8
  const version = detectVersion(records);
  if (version && version.startsWith('7')) return 'UTF-8';

  return null;
}

export function parseGedcom(content: string): ParseResult {
  const warnings: string[] = [];
  const cleaned = stripBom(content);
  const lines = cleaned.split(/\r?\n/);

  const flatRecords: { level: number; xref: string | null; tag: string; value: string | null }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const parsed = parseLine(line);
    if (!parsed) {
      warnings.push(`Line ${i + 1}: Malformed line skipped: "${line.substring(0, 80)}"`);
      continue;
    }

    flatRecords.push(parsed);
  }

  // Handle CONC and CONT continuation tags
  const consolidated: typeof flatRecords = [];
  for (const rec of flatRecords) {
    if (rec.tag === 'CONC' && consolidated.length > 0) {
      const prev = consolidated[consolidated.length - 1];
      prev.value = (prev.value || '') + (rec.value || '');
    } else if (rec.tag === 'CONT' && consolidated.length > 0) {
      const prev = consolidated[consolidated.length - 1];
      prev.value = (prev.value || '') + '\n' + (rec.value || '');
    } else {
      consolidated.push({ ...rec });
    }
  }

  // Build hierarchy
  const rootRecords: GedcomRecord[] = [];
  const stack: GedcomRecord[] = [];

  for (const flat of consolidated) {
    const record: GedcomRecord = {
      level: flat.level,
      xref: flat.xref,
      tag: flat.tag,
      value: flat.value,
      children: [],
    };

    // Pop stack until we find the parent
    while (stack.length > 0 && stack[stack.length - 1].level >= record.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      rootRecords.push(record);
    } else {
      stack[stack.length - 1].children.push(record);
    }

    stack.push(record);
  }

  const version = detectVersion(rootRecords);
  const encoding = detectEncoding(rootRecords);

  return { records: rootRecords, warnings, version, encoding };
}

export function findChildByTag(record: GedcomRecord, tag: string): GedcomRecord | undefined {
  return record.children.find(c => c.tag === tag);
}

export function findChildrenByTag(record: GedcomRecord, tag: string): GedcomRecord[] {
  return record.children.filter(c => c.tag === tag);
}
