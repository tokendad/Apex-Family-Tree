import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_TYPES,
  formatEventType,
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
    expect(formatEventType('military')).toBe('Military Service');
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
