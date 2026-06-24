import type { GedcomRecord } from './parser.js';
import { findChildByTag, findChildrenByTag } from './parser.js';

// ─── Mapped Types ───────────────────────────────────────────────────────────

export interface MappedPerson {
  xref: string;
  sex: 'M' | 'F' | 'X' | 'U';
  names: MappedName[];
  events: MappedEvent[];
  gedcomId: string;
}

export interface MappedName {
  nameType: 'birth' | 'married' | 'aka' | 'nickname' | 'formal' | 'religious';
  prefix: string | null;
  givenName: string | null;
  middleName: string | null;
  surname: string | null;
  suffix: string | null;
  nickname: string | null;
  isPrimary: boolean;
}

export interface MappedEvent {
  eventType: string;
  date: string | null;
  place: string | null;
  description: string | null;
}

export interface MappedFamily {
  xref: string;
  spouse1Xref: string | null;
  spouse2Xref: string | null;
  childXrefs: string[];
  marriageDate: string | null;
  marriagePlace: string | null;
  divorceDate: string | null;
  divorcePlace: string | null;
  gedcomId: string;
}

export interface MappedSource {
  xref: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publicationDate: string | null;
  url: string | null;
  notes: string | null;
  repositoryXref: string | null;
  gedcomId: string;
}

export interface MappedRepository {
  xref: string;
  name: string;
  address: string | null;
  url: string | null;
  notes: string | null;
  gedcomId: string;
}

export interface MappedData {
  persons: MappedPerson[];
  families: MappedFamily[];
  sources: MappedSource[];
  repositories: MappedRepository[];
}

// ─── Event Tag Mapping ──────────────────────────────────────────────────────

const INDIVIDUAL_EVENT_TAGS: Record<string, string> = {
  BIRT: 'birth',
  DEAT: 'death',
  BURI: 'burial',
  CREM: 'cremation',
  CHR: 'christening',
  BAPM: 'baptism',
  CONF: 'confirmation',
  FCOM: 'first_communion',
  GRAD: 'graduation',
  EMIG: 'emigration',
  IMMI: 'immigration',
  NATU: 'naturalization',
  CENS: 'census',
  PROB: 'probate',
  WILL: 'will',
  RETI: 'retirement',
  EVEN: 'other',
  OCCU: 'occupation',
  RESI: 'residence',
  EDUC: 'education',
  RELI: 'religion',
  SSN: 'ssn',
  TITL: 'title',
};

const NAME_TYPE_MAP: Record<string, MappedName['nameType']> = {
  birth: 'birth',
  married: 'married',
  aka: 'aka',
  immigrant: 'aka',
  maiden: 'birth',
  nickname: 'nickname',
  formal: 'formal',
  religious: 'religious',
};

// ─── Mappers ────────────────────────────────────────────────────────────────

function extractEvent(record: GedcomRecord, eventType: string): MappedEvent {
  const dateRec = findChildByTag(record, 'DATE');
  const placeRec = findChildByTag(record, 'PLAC');
  const descRec = record.value;

  return {
    eventType,
    date: dateRec?.value || null,
    place: placeRec?.value || null,
    description: descRec || null,
  };
}

function splitGivenAndMiddle(value: string | null): { givenName: string | null; middleName: string | null } {
  const trimmed = value?.trim();
  if (!trimmed) return { givenName: null, middleName: null };

  const firstSpace = trimmed.search(/\s/);
  if (firstSpace === -1) return { givenName: trimmed, middleName: null };

  return {
    givenName: trimmed.slice(0, firstSpace),
    middleName: trimmed.slice(firstSpace).trim() || null,
  };
}

function parseName(nameRecord: GedcomRecord, index: number): MappedName {
  const rawName = nameRecord.value || '';

  // Extract sub-tags if present
  const givnRec = findChildByTag(nameRecord, 'GIVN');
  const surnRec = findChildByTag(nameRecord, 'SURN');
  const npfxRec = findChildByTag(nameRecord, 'NPFX');
  const nsfxRec = findChildByTag(nameRecord, 'NSFX');
  const nickRec = findChildByTag(nameRecord, 'NICK');
  const typeRec = findChildByTag(nameRecord, 'TYPE');

  let givenName = givnRec?.value || null;
  let middleName: string | null = null;
  let surname = surnRec?.value || null;

  // Parse from formatted name: "Given /Surname/"
  if (!givenName && !surname && rawName) {
    const surnameMatch = rawName.match(/\/([^/]*)\//);
    if (surnameMatch) {
      surname = surnameMatch[1] || null;
      givenName = rawName.replace(/\/[^/]*\//, '').trim() || null;
    } else {
      givenName = rawName.trim() || null;
    }
  }

  const splitName = splitGivenAndMiddle(givenName);
  givenName = splitName.givenName;
  middleName = splitName.middleName;

  const typeStr = typeRec?.value?.toLowerCase() || '';
  const nameType = NAME_TYPE_MAP[typeStr] || 'birth';

  return {
    nameType,
    prefix: npfxRec?.value || null,
    givenName,
    middleName,
    surname,
    suffix: nsfxRec?.value || null,
    nickname: nickRec?.value || null,
    isPrimary: index === 0,
  };
}

function mapIndividual(record: GedcomRecord): MappedPerson {
  const xref = record.xref || '';
  const sexRec = findChildByTag(record, 'SEX');
  const sexVal = sexRec?.value?.toUpperCase() || 'U';
  const sex = (['M', 'F', 'X'].includes(sexVal) ? sexVal : 'U') as MappedPerson['sex'];

  const nameRecords = findChildrenByTag(record, 'NAME');
  const names = nameRecords.map((nr, i) => parseName(nr, i));
  if (names.length === 0) {
    names.push({
      nameType: 'birth',
      prefix: null,
      givenName: 'Unknown',
      middleName: null,
      surname: null,
      suffix: null,
      nickname: null,
      isPrimary: true,
    });
  }

  const events: MappedEvent[] = [];
  for (const [tag, eventType] of Object.entries(INDIVIDUAL_EVENT_TAGS)) {
    const eventRecords = findChildrenByTag(record, tag);
    for (const er of eventRecords) {
      events.push(extractEvent(er, eventType));
    }
  }

  return { xref, sex, names, events, gedcomId: xref };
}

function mapFamily(record: GedcomRecord): MappedFamily {
  const xref = record.xref || '';
  const husbRec = findChildByTag(record, 'HUSB');
  const wifeRec = findChildByTag(record, 'WIFE');
  const childRecs = findChildrenByTag(record, 'CHIL');

  let marriageDate: string | null = null;
  let marriagePlace: string | null = null;
  let divorceDate: string | null = null;
  let divorcePlace: string | null = null;

  const marrRec = findChildByTag(record, 'MARR');
  if (marrRec) {
    marriageDate = findChildByTag(marrRec, 'DATE')?.value || null;
    marriagePlace = findChildByTag(marrRec, 'PLAC')?.value || null;
  }

  const divRec = findChildByTag(record, 'DIV');
  if (divRec) {
    divorceDate = findChildByTag(divRec, 'DATE')?.value || null;
    divorcePlace = findChildByTag(divRec, 'PLAC')?.value || null;
  }

  return {
    xref,
    spouse1Xref: husbRec?.value || null,
    spouse2Xref: wifeRec?.value || null,
    childXrefs: childRecs.map(c => c.value || '').filter(Boolean),
    marriageDate,
    marriagePlace,
    divorceDate,
    divorcePlace,
    gedcomId: xref,
  };
}

function mapSource(record: GedcomRecord): MappedSource {
  const xref = record.xref || '';
  const titlRec = findChildByTag(record, 'TITL');
  const authRec = findChildByTag(record, 'AUTH');
  const publRec = findChildByTag(record, 'PUBL');
  const noteRec = findChildByTag(record, 'NOTE');
  const repoRec = findChildByTag(record, 'REPO');

  let url: string | null = null;
  const wwwRec = findChildByTag(record, 'WWW');
  if (wwwRec) url = wwwRec.value;

  return {
    xref,
    title: titlRec?.value || 'Untitled Source',
    author: authRec?.value || null,
    publisher: publRec?.value || null,
    publicationDate: null,
    url,
    notes: noteRec?.value || null,
    repositoryXref: repoRec?.value || null,
    gedcomId: xref,
  };
}

function mapRepository(record: GedcomRecord): MappedRepository {
  const xref = record.xref || '';
  const nameRec = findChildByTag(record, 'NAME');
  const addrRec = findChildByTag(record, 'ADDR');
  const wwwRec = findChildByTag(record, 'WWW');
  const noteRec = findChildByTag(record, 'NOTE');

  let address: string | null = null;
  if (addrRec) {
    const parts: string[] = [];
    if (addrRec.value) parts.push(addrRec.value);
    const city = findChildByTag(addrRec, 'CITY');
    const stae = findChildByTag(addrRec, 'STAE');
    const ctry = findChildByTag(addrRec, 'CTRY');
    if (city?.value) parts.push(city.value);
    if (stae?.value) parts.push(stae.value);
    if (ctry?.value) parts.push(ctry.value);
    address = parts.join(', ') || null;
  }

  return {
    xref,
    name: nameRec?.value || 'Unknown Repository',
    address,
    url: wwwRec?.value || null,
    notes: noteRec?.value || null,
    gedcomId: xref,
  };
}

// ─── Main Mapper ────────────────────────────────────────────────────────────

export function mapGedcomRecords(records: GedcomRecord[]): MappedData {
  const persons: MappedPerson[] = [];
  const families: MappedFamily[] = [];
  const sources: MappedSource[] = [];
  const repositories: MappedRepository[] = [];

  for (const record of records) {
    switch (record.tag) {
      case 'INDI':
        persons.push(mapIndividual(record));
        break;
      case 'FAM':
        families.push(mapFamily(record));
        break;
      case 'SOUR':
        sources.push(mapSource(record));
        break;
      case 'REPO':
        repositories.push(mapRepository(record));
        break;
      // HEAD, TRLR, NOTE, OBJE are silently skipped
    }
  }

  return { persons, families, sources, repositories };
}
