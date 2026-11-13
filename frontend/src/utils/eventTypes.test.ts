import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_TYPES,
  EVENT_TYPE_LABELS,
  displayEventDate,
  formatEventType,
  groupedTypeOptions,
  isAttributeType,
  partitionByKind,
  payloadLabel,
} from './eventTypes';

describe('eventTypes', () => {
  it('classifies GEDCOM attribute tags as attributes, not events', () => {
    for (const type of ['occupation', 'residence', 'education', 'religion', 'ssn', 'title']) {
      expect(isAttributeType(type)).toBe(true);
    }
  });

  it('keeps occurrences classified as events', () => {
    for (const type of ['birth', 'death', 'marriage', 'divorce', 'burial', 'census', 'military']) {
      expect(isAttributeType(type)).toBe(false);
    }
  });

  it('treats an unknown type as an event rather than an attribute', () => {
    expect(isAttributeType('handfasting')).toBe(false);
  });

  it('labels an attribute payload a value and an event payload a description', () => {
    expect(payloadLabel('occupation')).toBe('Value');
    expect(payloadLabel('birth')).toBe('Description');
  });

  it('humanizes unknown types instead of showing the raw key', () => {
    expect(formatEventType('birth')).toBe('Birth');
    expect(formatEventType('military_service')).toBe('Military Service');
    expect(formatEventType('bar_mitzvah')).toBe('Bar Mitzvah');
  });

  it('splits a mixed list, preserving order within each group', () => {
    const { events, attributes } = partitionByKind([
      { id: 1, event_type: 'birth' },
      { id: 2, event_type: 'occupation' },
      { id: 3, event_type: 'census' },
      { id: 4, event_type: 'residence' },
      { id: 5, event_type: 'death' },
    ]);
    expect(events.map((e) => e.id)).toEqual([1, 3, 5]);
    expect(attributes.map((a) => a.id)).toEqual([2, 4]);
  });

  it('exports every attribute type with a human label', () => {
    for (const type of ATTRIBUTE_TYPES) {
      expect(formatEventType(type)).not.toBe(type);
    }
  });
});

describe('eventTypes — database agreement', () => {
  // The picker used to offer 'military', which events.event_type's CHECK
  // constraint rejects, so saving a military event failed outright.
  const ALLOWED = new Set([
    'birth', 'death', 'burial', 'wake', 'cremation', 'baptism', 'christening',
    'bar_mitzvah', 'bat_mitzvah', 'confirmation', 'first_communion',
    'graduation', 'immigration', 'emigration', 'naturalization',
    'census', 'residence', 'occupation', 'retirement',
    'military_service', 'medical', 'custom',
    'probate', 'will', 'other', 'education', 'religion', 'ssn', 'title',
    'marriage', 'divorce', 'annulment', 'engagement', 'anniversary',
    'marriage_bann', 'marriage_contract', 'marriage_license',
    'marriage_settlement',
  ]);

  it('offers only types the events table accepts', () => {
    const offered = Object.keys(EVENT_TYPE_LABELS);
    expect(offered.filter((t) => !ALLOWED.has(t))).toEqual([]);
  });

  it('spells military service the way the database does', () => {
    expect(EVENT_TYPE_LABELS.military_service).toBe('Military Service');
    expect(EVENT_TYPE_LABELS.military).toBeUndefined();
  });

  it('classifies military service as an event, not an attribute', () => {
    expect(isAttributeType('military_service')).toBe(false);
  });

  // Before 062 the only way to record a golden wedding was 'other', which
  // renders as the bare word "Event" and leaves the meaning to the description.
  it('names an anniversary rather than falling back to "Event"', () => {
    expect(formatEventType('anniversary')).toBe('Anniversary');
    expect(formatEventType('anniversary')).not.toBe('Event');
  });

  it('treats an anniversary as a dated occurrence, not an attribute', () => {
    expect(isAttributeType('anniversary')).toBe(false);
    expect(payloadLabel('anniversary')).toBe('Description');
  });

  it('offers an anniversary in the type picker', () => {
    const { events, attributes } = groupedTypeOptions();
    expect(events.map(([type]) => type)).toContain('anniversary');
    expect(attributes.map(([type]) => type)).not.toContain('anniversary');
  });
});

/* #33: event_date never carries a span's end past the API boundary once
   EventRepository splits a bounded span -- event_date_end is where it lives
   now. A display spot that still read event_date alone would quietly stop
   showing the end it used to show as part of a verbatim "FROM x TO y". */
describe('displayEventDate', () => {
  it('shows both ends of a span', () => {
    expect(displayEventDate({ event_date: '1982', event_date_end: '1990' })).toBe('1982–1990');
  });

  it('shows a plain date with no end unchanged', () => {
    expect(displayEventDate({ event_date: '1982', event_date_end: null })).toBe('1982');
  });

  it('shows a known end with no known start', () => {
    expect(displayEventDate({ event_date: null, event_date_end: '1990' })).toBe('to 1990');
  });

  it('shows nothing for an undated event', () => {
    expect(displayEventDate({ event_date: null, event_date_end: null })).toBeNull();
  });

  it('treats a missing event_date_end the same as null', () => {
    expect(displayEventDate({ event_date: 'FROM 1982' })).toBe('FROM 1982');
  });

  /* A one-sided "FROM 1982" is stored verbatim rather than split, so adding
     an end later through its own field leaves event_date still carrying the
     keyword -- the display must strip it, the same way the backend's
     export composer does, or it reads "FROM 1982–1990". */
  it('strips a leading FROM once an end makes the keyword redundant', () => {
    expect(displayEventDate({ event_date: 'FROM 1982', event_date_end: '1990' })).toBe('1982–1990');
  });
});
