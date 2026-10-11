import { describe, expect, it } from 'vitest';
import { validatePassword, generateTemporaryPassword } from './auth.js';

describe('validatePassword', () => {
  it('requires eight characters', () => {
    expect(validatePassword('abc1')).toMatch(/8 characters/);
  });

  /* #39 adds the digit rule; length alone was all that was ever checked. */
  it('requires a number', () => {
    expect(validatePassword('abcdefgh')).toMatch(/number/);
  });

  it('accepts a password that meets both', () => {
    expect(validatePassword('abcdefg1')).toBeNull();
  });

  it('rejects a missing or non-string password', () => {
    expect(validatePassword(undefined)).toMatch(/required/);
    expect(validatePassword('')).toMatch(/required/);
    expect(validatePassword(12345678)).toMatch(/required/);
  });
});

describe('generateTemporaryPassword', () => {
  /* It gets read down a phone to a relative who then types it on a handset. */
  it('is two words and three digits', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateTemporaryPassword()).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
    }
  });

  it('always satisfies the password rules it will be checked against', () => {
    for (let i = 0; i < 500; i++) {
      expect(validatePassword(generateTemporaryPassword())).toBeNull();
    }
  });

  /* A doubled word reads as a mistake and halves the number of choices. */
  it('never repeats the same word', () => {
    for (let i = 0; i < 500; i++) {
      const [first, second] = generateTemporaryPassword().split('-');
      expect(first).not.toBe(second);
    }
  });

  it('does not keep handing out the same password', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateTemporaryPassword()));
    expect(seen.size).toBeGreaterThan(150);
  });
});
