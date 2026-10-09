/**
 * Event type metadata, shared by every surface that renders an event.
 *
 * GEDCOM 5.5.1 distinguishes INDIVIDUAL_EVENT_STRUCTURE — things that happened
 * at a point in time — from INDIVIDUAL_ATTRIBUTE_STRUCTURE, which describes
 * what a person *was* and merely carries a date. An occupation of "Segment
 * Treater" dated 1982 is the latter: Raymond did not become a Segment Treater
 * in 1982, he was one as of 1982. Attributes therefore do not belong in a
 * chronological timeline, and their payload is a value rather than a
 * description.
 *
 * See https://github.com/tokendad/Apex-Family-Tree/issues/32.
 */

export const EVENT_TYPE_LABELS: Record<string, string> = {
  birth: 'Birth',
  death: 'Death',
  marriage: 'Marriage',
  divorce: 'Divorce',
  burial: 'Burial',
  baptism: 'Baptism',
  christening: 'Christening',
  graduation: 'Graduation',
  military_service: 'Military Service',
  immigration: 'Immigration',
  emigration: 'Emigration',
  naturalization: 'Naturalization',
  cremation: 'Cremation',
  confirmation: 'Confirmation',
  first_communion: 'First Communion',
  bar_mitzvah: 'Bar Mitzvah',
  bat_mitzvah: 'Bat Mitzvah',
  census: 'Census',
  probate: 'Probate',
  will: 'Will',
  retirement: 'Retirement',
  medical: 'Medical',
  annulment: 'Annulment',
  engagement: 'Engagement',
  marriage_bann: 'Marriage Bann',
  marriage_contract: 'Marriage Contract',
  marriage_license: 'Marriage Licence',
  marriage_settlement: 'Marriage Settlement',
  custom: 'Event',
  other: 'Event',
  // Attributes — see ATTRIBUTE_TYPES below.
  occupation: 'Occupation',
  residence: 'Residence',
  education: 'Education',
  religion: 'Religion',
  ssn: 'Social Security Number',
  title: 'Title',
};

/**
 * Types that describe a person rather than an occurrence. These map to GEDCOM's
 * attribute tags (OCCU, RESI, EDUC, RELI, SSN, TITL) and are the set the
 * exporter already knows how to write as attributes.
 */
export const ATTRIBUTE_TYPES = new Set([
  'occupation',
  'residence',
  'education',
  'religion',
  'ssn',
  'title',
]);

/** Events that should appear first, keyed to their sort priority (lower = earlier). */
export const EVENT_EARLY_ORDER: Record<string, number> = {
  birth: 0,
  baptism: 1,
  christening: 1,
};

export function isAttributeType(eventType: string): boolean {
  return ATTRIBUTE_TYPES.has(eventType);
}

export function formatEventType(type: string): string {
  return (
    EVENT_TYPE_LABELS[type] ??
    type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * The label for an event's free-text payload. Attributes store their value in
 * the same column events use for a description, so the column is shared but the
 * meaning is not: "Segment Treater" is a value, not a description.
 */
export function payloadLabel(eventType: string): string {
  return isAttributeType(eventType) ? 'Value' : 'Description';
}

interface TypedEvent {
  event_type: string;
}

/** Splits a mixed list into chronological events and descriptive attributes. */
export function partitionByKind<T extends TypedEvent>(
  items: T[],
): { events: T[]; attributes: T[] } {
  const events: T[] = [];
  const attributes: T[] = [];
  for (const item of items) {
    (isAttributeType(item.event_type) ? attributes : events).push(item);
  }
  return { events, attributes };
}

/** The type picker's options, grouped so attributes are not offered as events. */
export function groupedTypeOptions(): {
  events: [string, string][];
  attributes: [string, string][];
} {
  const events: [string, string][] = [];
  const attributes: [string, string][] = [];
  for (const entry of Object.entries(EVENT_TYPE_LABELS)) {
    (isAttributeType(entry[0]) ? attributes : events).push(entry);
  }
  return { events, attributes };
}
