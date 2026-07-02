import { describe, expect, it } from 'vitest';
import { lifespanLabel } from './personEvents';

describe('lifespanLabel', () => {
  it('formats birth and death years', () => {
    expect(lifespanLabel([
      { event_type: 'birth', event_date: '1931-04-02' },
      { event_type: 'death', event_date: '2008' },
    ])).toBe('1931–2008');
  });

  it('handles birth only', () => {
    expect(lifespanLabel([{ event_type: 'birth', event_date: 'abt 1931' }])).toBe('1931–');
  });

  it('handles death only', () => {
    expect(lifespanLabel([{ event_type: 'death', event_date: '2008-01-01' }])).toBe('–2008');
  });

  it('returns null without years', () => {
    expect(lifespanLabel([{ event_type: 'residence', event_date: '1950' }])).toBeNull();
    expect(lifespanLabel([{ event_type: 'birth', event_date: null }])).toBeNull();
    expect(lifespanLabel([])).toBeNull();
  });
});
