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
  anniversary: 'Anniversary',
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


/** The fields an event needs for the timeline to place it. */
export interface TimelineEvent {
  event_type: string;
  event_date_sort_key?: number | null;
}

/**
 * Chronological order, oldest first.
 *
 * This used to sort by event type and only then by date, comparing the raw
 * GEDCOM strings: "1 JUL 2014" sorted before "ABT 1986" because "1" precedes
 * "A". Death was also pinned last whatever its date, so a funeral or a
 * celebration of life held after it appeared above it.
 *
 * The numeric sort key the backend derives is the thing to order on. Type
 * order survives only as a tie-break, so a birth and a baptism recorded on one
 * day still read in the sensible order, and undated events -- an occupation, a
 * residence with no year -- fall to the end rather than to the beginning.
 */
export function sortEventsForTimeline<T extends TimelineEvent>(events: T[]): T[] {
  const sortKey = (event: TimelineEvent): number | null =>
    typeof event.event_date_sort_key === 'number' ? event.event_date_sort_key : null;

  return [...events].sort((a, b) => {
    const aKey = sortKey(a);
    const bKey = sortKey(b);

    if (aKey !== null && bKey !== null && aKey !== bKey) return aKey - bKey;
    if (aKey !== null && bKey === null) return -1;
    if (aKey === null && bKey !== null) return 1;

    const aOrder = EVENT_EARLY_ORDER[a.event_type] ?? 50;
    const bOrder = EVENT_EARLY_ORDER[b.event_type] ?? 50;
    if (aOrder !== bOrder) return aOrder - bOrder;

    return a.event_type.localeCompare(b.event_type);
  });
}
