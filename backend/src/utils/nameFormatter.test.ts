/**
 * AFT Name Display System — Name Formatter Tests
 * 
 * Tests for the canonical name formatter implementation.
 * Covers all test cases from the design plan.
 */

import { describe, it, expect } from 'vitest';
import {
  formatName,
  validateGlobalFormatString,
  sanitizeDisplayName,
  normalizeToNull,
} from './nameFormatter.js';
import type { Name } from '../types/db.js';

// Test fixture: sample name data
function createName(overrides: Partial<Name> = {}): Name {
  return {
    id: 'name-1',
    person_id: 'person-1',
    name_type: 'birth',
    prefix: null,
    given_name: 'Jane',
    middle_name: 'Anne',
    surname: 'Smith',
    suffix: null,
    nickname: null,
    is_primary: 1,
    sort_order: 0,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  };
}

describe('formatName', () => {
  describe('Token substitution', () => {
    it('should substitute %f (first name)', () => {
      const name = createName({ given_name: 'John' });
      const result = formatName({ formatString: '%f', primaryName: name });
      expect(result).toBe('John');
    });

    it('should substitute %m (middle name)', () => {
      const name = createName({ middle_name: 'Paul' });
      const result = formatName({ formatString: '%f %m %s', primaryName: name });
      expect(result).toBe('Jane Paul Smith');
    });

    it('should substitute %mi (middle initial)', () => {
      const name = createName({ middle_name: 'Anne' });
      const result = formatName({ formatString: '%f %mi %s', primaryName: name });
      expect(result).toBe('Jane A. Smith');
    });

    it('should substitute %s (surname)', () => {
      const name = createName({ surname: 'Doe' });
      const result = formatName({ formatString: '%s, %f', primaryName: name });
      expect(result).toBe('Doe, Jane');
    });

    it('should substitute %t (title/prefix)', () => {
      const name = createName({ prefix: 'Dr.' });
      const result = formatName({ formatString: '%t %f %s', primaryName: name });
      expect(result).toBe('Dr. Jane Smith');
    });

    it('should substitute %n (nickname)', () => {
      const name = createName({ nickname: 'Janie' });
      const result = formatName({ formatString: '%f "%n" %s', primaryName: name });
      expect(result).toBe('Jane "Janie" Smith');
    });

    it('should substitute %x (suffix)', () => {
      const name = createName({ suffix: 'Jr.' });
      const result = formatName({ formatString: '%f %s %x', primaryName: name });
      expect(result).toBe('Jane Smith Jr.');
    });

    it('should substitute %ms (married surname)', () => {
      const birthName = createName({ surname: 'Smith' });
      const marriedName = createName({
        id: 'name-2',
        name_type: 'married',
        surname: 'Jones',
        is_primary: 0,
      });
      const result = formatName({
        formatString: '%f %ms',
        primaryName: birthName,
        names: [birthName, marriedName],
      });
      expect(result).toBe('Jane Jones');
    });
  });

  describe('Empty token whitespace cleanup', () => {
    it('should remove double spaces when middle name is empty', () => {
      const name = createName({ middle_name: null });
      const result = formatName({ formatString: '%f %m %s', primaryName: name });
      expect(result).toBe('Jane Smith');
    });

    it('should remove trailing space when suffix is empty', () => {
      const name = createName({ suffix: null });
      const result = formatName({ formatString: '%f %s %x', primaryName: name });
      expect(result).toBe('Jane Smith');
    });

    it('should remove leading space when title is empty', () => {
      const name = createName({ prefix: null });
      const result = formatName({ formatString: '%t %f %s', primaryName: name });
      expect(result).toBe('Jane Smith');
    });

    it('should handle multiple empty tokens', () => {
      const name = createName({ prefix: null, middle_name: null, suffix: null });
      const result = formatName({ formatString: '%t %f %m %s %x', primaryName: name });
      expect(result).toBe('Jane Smith');
    });
  });

  describe('Middle initial %mi', () => {
    it('should render first character + period', () => {
      const name = createName({ middle_name: 'Robert' });
      const result = formatName({ formatString: '%f %mi %s', primaryName: name });
      expect(result).toBe('Jane R. Smith');
    });

    it('should return empty when middle_name is null', () => {
      const name = createName({ middle_name: null });
      const result = formatName({ formatString: '%f %mi %s', primaryName: name });
      expect(result).toBe('Jane Smith');
    });

    it('should uppercase the initial', () => {
      const name = createName({ middle_name: 'anne' });
      const result = formatName({ formatString: '%mi', primaryName: name });
      expect(result).toBe('A.');
    });
  });

  describe('%mi vs %m disambiguation', () => {
    it('should parse %mi before %m + literal i', () => {
      const name = createName({ middle_name: 'Marie' });
      const result = formatName({ formatString: '%f %mi%s', primaryName: name });
      // %mi should be parsed as middle initial, not %m followed by 'i'
      expect(result).toBe('Jane M.Smith');
    });
  });

  describe('Person display_name override', () => {
    it('should use display_name when set', () => {
      const name = createName();
      const result = formatName({
        formatString: '%f %s',
        primaryName: name,
        personDisplayName: 'Custom Name',
      });
      expect(result).toBe('Custom Name');
    });

    it('should fall back to format when display_name is null', () => {
      const name = createName();
      const result = formatName({
        formatString: '%f %s',
        primaryName: name,
        personDisplayName: null,
      });
      expect(result).toBe('Jane Smith');
    });

    it('should fall back to format when display_name is empty string', () => {
      const name = createName();
      const result = formatName({
        formatString: '%f %s',
        primaryName: name,
        personDisplayName: '   ',
      });
      expect(result).toBe('Jane Smith');
    });
  });

  describe('Married surname resolution', () => {
    it('should return empty when no married name exists', () => {
      const birthName = createName({ surname: 'Smith' });
      const result = formatName({
        formatString: '%f %ms',
        primaryName: birthName,
        names: [birthName],
      });
      expect(result).toBe('Jane');
    });

    it('should use first married name when multiple exist', () => {
      const birthName = createName({ surname: 'Smith' });
      const marriedName1 = createName({
        id: 'name-2',
        name_type: 'married',
        surname: 'Jones',
        is_primary: 0,
        sort_order: 1,
      });
      const marriedName2 = createName({
        id: 'name-3',
        name_type: 'married',
        surname: 'Brown',
        is_primary: 0,
        sort_order: 2,
      });
      const result = formatName({
        formatString: '%f %ms',
        primaryName: birthName,
        names: [birthName, marriedName1, marriedName2],
      });
      expect(result).toBe('Jane Jones');
    });
  });

  describe('Mononym (single name)', () => {
    it('should handle person with only first name', () => {
      const name = createName({ surname: null });
      const result = formatName({ formatString: '%f %s', primaryName: name });
      expect(result).toBe('Jane');
    });

    it('should handle person with only surname', () => {
      const name = createName({ given_name: null, surname: 'Prince' });
      const result = formatName({ formatString: '%f %s', primaryName: name });
      expect(result).toBe('Prince');
    });
  });

  describe('Special characters and diacritics', () => {
    it('should preserve accented characters', () => {
      const name = createName({ given_name: 'José', surname: 'García' });
      const result = formatName({ formatString: '%f %s', primaryName: name });
      expect(result).toBe('José García');
    });

    it('should preserve non-ASCII characters', () => {
      const name = createName({ given_name: 'Björn', surname: 'Ångström' });
      const result = formatName({ formatString: '%f %s', primaryName: name });
      expect(result).toBe('Björn Ångström');
    });

    it('should preserve Cyrillic characters', () => {
      const name = createName({ given_name: 'Иван', surname: 'Иванов' });
      const result = formatName({ formatString: '%f %s', primaryName: name });
      expect(result).toBe('Иван Иванов');
    });
  });

  describe('Punctuation cleanup', () => {
    it('should preserve comma when first name is empty', () => {
      const name = createName({ given_name: null, surname: 'Smith' });
      const result = formatName({ formatString: '%s, %f', primaryName: name });
      expect(result).toBe('Smith,');
    });

    it('should preserve comma when nickname is empty', () => {
      const name = createName({ nickname: null });
      const result = formatName({ formatString: '%f, %n', primaryName: name });
      expect(result).toBe('Jane,');
    });

    it('should remove space before comma when nickname is empty', () => {
      const name = createName({ nickname: null });
      const result = formatName({ formatString: '%f %n, %s', primaryName: name });
      expect(result).toBe('Jane Smith');
    });

    it('should remove period and space when title is empty', () => {
      const name = createName({ prefix: null });
      const result = formatName({ formatString: '%t. %f %s', primaryName: name });
      expect(result).toBe('Jane Smith');
    });

    it('should preserve literal period at end', () => {
      const name = createName();
      const result = formatName({ formatString: '%f %s.', primaryName: name });
      expect(result).toBe('Jane Smith.');
    });
  });

  describe('Unknown token passthrough', () => {
    it('should pass through unknown tokens as literal text', () => {
      const name = createName();
      const result = formatName({ formatString: '%f %z %s', primaryName: name });
      expect(result).toBe('Jane %z Smith');
    });

    it('should not break on unknown tokens', () => {
      const name = createName();
      const result = formatName({ formatString: '%f %unknown %s', primaryName: name });
      expect(result).toBe('Jane %unknown Smith');
    });
  });

  describe('Empty first name behavior', () => {
    it('should return empty string when no primary name', () => {
      const result = formatName({ formatString: '%f %s', primaryName: undefined });
      expect(result).toBe('');
    });

    it('should return surname only when first name is empty', () => {
      const name = createName({ given_name: null });
      const result = formatName({ formatString: '%f %s', primaryName: name });
      expect(result).toBe('Smith');
    });
  });
});

describe('validateGlobalFormatString', () => {
  it('should accept valid format string', () => {
    expect(validateGlobalFormatString('%f %m %s')).toBeNull();
  });

  it('should reject empty string', () => {
    expect(validateGlobalFormatString('')).toBe('Format string cannot be empty');
  });

  it('should reject whitespace-only string', () => {
    expect(validateGlobalFormatString('   ')).toBe('Format string cannot be empty');
  });

  it('should reject format string containing %D token', () => {
    expect(validateGlobalFormatString('%D')).toBe(
      'Global name format cannot contain %D token'
    );
  });

  it('should reject format string with %D anywhere', () => {
    expect(validateGlobalFormatString('%f %D %s')).toBe(
      'Global name format cannot contain %D token'
    );
  });
});

describe('sanitizeDisplayName', () => {
  it('should strip HTML tags', () => {
    expect(sanitizeDisplayName('<script>alert("xss")</script>John')).toBe(
      'alert(&quot;xss&quot;)John'
    );
  });

  it('should encode and remove HTML-like patterns', () => {
    // The sanitizer should remove anything that looks like HTML tags
    expect(sanitizeDisplayName('John & Jane <Smith>')).toBe('John &amp; Jane ');
  });

  it('should return null for empty string', () => {
    expect(sanitizeDisplayName('')).toBeNull();
  });

  it('should return null for whitespace-only string', () => {
    expect(sanitizeDisplayName('   ')).toBeNull();
  });

  it('should trim input', () => {
    expect(sanitizeDisplayName('  John  ')).toBe('John');
  });

  it('should return null for null input', () => {
    expect(sanitizeDisplayName(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(sanitizeDisplayName(undefined)).toBeNull();
  });
});

describe('normalizeToNull', () => {
  it('should return null for empty string', () => {
    expect(normalizeToNull('')).toBeNull();
  });

  it('should return null for whitespace-only string', () => {
    expect(normalizeToNull('   ')).toBeNull();
  });

  it('should return trimmed string for non-empty input', () => {
    expect(normalizeToNull('  John  ')).toBe('John');
  });

  it('should return null for null input', () => {
    expect(normalizeToNull(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(normalizeToNull(undefined)).toBeNull();
  });
});
