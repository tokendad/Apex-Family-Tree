import { describe, it, expect } from 'vitest';
import { soundex } from './soundex.js';

describe('soundex', () => {
  it('returns empty string for empty input', () => {
    expect(soundex('')).toBe('');
  });

  it('returns empty string for null-like input', () => {
    expect(soundex(undefined as unknown as string)).toBe('');
  });

  it('encodes Robert → R163', () => {
    expect(soundex('Robert')).toBe('R163');
  });

  it('encodes Rupert → R163 (same as Robert)', () => {
    expect(soundex('Rupert')).toBe('R163');
  });

  it('encodes Ashcraft → A261 (H/W rule)', () => {
    expect(soundex('Ashcraft')).toBe('A261');
  });

  it('encodes Tymczak → T522', () => {
    expect(soundex('Tymczak')).toBe('T522');
  });

  it('handles short names with zero-padding', () => {
    expect(soundex('Al')).toBe('A400');
  });

  it('handles single letter', () => {
    expect(soundex('A')).toBe('A000');
  });

  it('is case-insensitive', () => {
    expect(soundex('smith')).toBe(soundex('SMITH'));
    expect(soundex('Smith')).toBe(soundex('SMITH'));
  });

  it('strips non-alpha characters (apostrophes, hyphens)', () => {
    expect(soundex("O'Brien")).toBe(soundex('OBrien'));
    expect(soundex('Le-Fort')).toBe(soundex('LeFort'));
  });

  it('handles strings with only non-alpha characters', () => {
    expect(soundex('123')).toBe('');
  });

  it('produces same code for phonetically similar names', () => {
    // LeFort / Lefort / LeForte should match
    expect(soundex('LeFort')).toBe(soundex('Lefort'));
    expect(soundex('LeFort')).toBe(soundex('LeForte'));
  });

  it('distinguishes phonetically different names', () => {
    expect(soundex('Smith')).not.toBe(soundex('Jones'));
    expect(soundex('Robert')).not.toBe(soundex('Smith'));
  });
});
