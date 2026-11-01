import { describe, it, expect } from 'vitest';
import { confidenceKey, confidenceLabel, isUnsettledConfidence } from './confidence';

/* The colour and settled-ness rules four surfaces now share, tested here rather
   than in each of them. */
describe('confidenceKey', () => {
  it('maps each level to its own style key, whatever the casing', () => {
    expect(confidenceKey('Confirmed')).toBe('confirmed');
    expect(confidenceKey('DISPUTED')).toBe('disputed');
    expect(confidenceKey(' possible ')).toBe('possible');
  });

  it('falls back to neutral for anything it does not recognise', () => {
    /* A level someone adds to confidence_levels later must not land on the
       wrong colour -- grey is the honest answer for "no rule for this". */
    expect(confidenceKey('Highly Speculative')).toBe('unknown');
    expect(confidenceKey(null)).toBe('unknown');
    expect(confidenceKey(undefined)).toBe('unknown');
  });
});

describe('isUnsettledConfidence', () => {
  it('counts Confirmed and Rejected as settled', () => {
    /* One is established, the other ruled out. Neither marks a fact, because
       if every settled date carried a badge none would mean anything. */
    expect(isUnsettledConfidence('Confirmed')).toBe(false);
    expect(isUnsettledConfidence('Rejected')).toBe(false);
  });

  it('counts the open middle, and the ungraded, as unsettled', () => {
    expect(isUnsettledConfidence('Probable')).toBe(true);
    expect(isUnsettledConfidence('Disputed')).toBe(true);
    expect(isUnsettledConfidence('Possible')).toBe(true);
    // Ungraded is not the same as agreed.
    expect(isUnsettledConfidence(null)).toBe(true);
  });
});

describe('confidenceLabel', () => {
  it('joins the level and its number', () => {
    expect(confidenceLabel('Disputed', 40)).toBe('Disputed · 40');
  });

  it('omits a number that is not there', () => {
    expect(confidenceLabel('Unknown', null)).toBe('Unknown');
    expect(confidenceLabel('Unknown', undefined)).toBe('Unknown');
  });

  it('says Unknown rather than nothing for a missing level', () => {
    expect(confidenceLabel(null, null)).toBe('Unknown');
    expect(confidenceLabel('   ', null)).toBe('Unknown');
  });
});
