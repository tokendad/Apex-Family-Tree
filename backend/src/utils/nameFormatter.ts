/**
 * AFT Name Display System — Canonical Name Formatter
 * 
 * Formats person names according to a token-based format string.
 * Implements the token system and parser rules defined in the design plan.
 */

import type { Name } from '../types/db.js';

export interface NameFormatterInput {
  /** Person's display_name override (if set) */
  personDisplayName?: string | null;
  /** Primary name record (or first name if no primary) */
  primaryName?: Name;
  /** All name records for this person (for married surname lookup) */
  names?: Name[];
  /** Global format string from app_settings */
  formatString: string;
}

/**
 * Format a person's name according to the format string.
 * 
 * @param input - Name data and format configuration
 * @returns Formatted name string, trimmed and cleaned
 */
export function formatName(input: NameFormatterInput): string {
  const { personDisplayName, primaryName, names = [], formatString } = input;

  // If person has a display_name override set, use it directly
  if (personDisplayName && personDisplayName.trim()) {
    return personDisplayName.trim();
  }

  // No primary name? Return empty string
  if (!primaryName) {
    return '';
  }

  // Parse and substitute tokens
  return parseFormatString(formatString, primaryName, names);
}

/**
 * Parse a format string and substitute tokens with actual name values.
 * Implements longest-match-first parsing and whitespace cleanup rules.
 */
function parseFormatString(format: string, primaryName: Name, allNames: Name[]): string {
  let result = format;

  // Token definitions (order matters - longest first for disambiguation)
  const tokens: Array<{ token: string; getValue: () => string }> = [
    { token: '%mi', getValue: () => getMiddleInitial(primaryName.middle_name) },
    { token: '%ms', getValue: () => getMarriedSurname(allNames) },
    { token: '%f', getValue: () => primaryName.given_name || '' },
    { token: '%m', getValue: () => primaryName.middle_name || '' },
    { token: '%s', getValue: () => primaryName.surname || '' },
    { token: '%t', getValue: () => primaryName.prefix || '' },
    { token: '%n', getValue: () => primaryName.nickname || '' },
    { token: '%x', getValue: () => primaryName.suffix || '' },
  ];

  // Replace tokens with values, tracking which resolved to empty
  const emptyTokens: string[] = [];
  for (const { token, getValue } of tokens) {
    if (result.includes(token)) {
      const value = getValue();
      if (!value) {
        emptyTokens.push(token);
      }
      result = result.replaceAll(token, value);
    }
  }

  // Clean up whitespace and punctuation around empty tokens
  result = cleanupEmptyTokens(result, emptyTokens);

  // Final cleanup: collapse multiple spaces, trim
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Get middle initial from middle name (first char + period)
 */
function getMiddleInitial(middleName: string | null | undefined): string {
  if (!middleName || !middleName.trim()) return '';
  return middleName.trim().charAt(0).toUpperCase() + '.';
}

/**
 * Get married surname from first married name record
 */
function getMarriedSurname(names: Name[]): string {
  const marriedName = names.find(n => n.name_type === 'married');
  return marriedName?.surname || '';
}

/**
 * Clean up whitespace and punctuation adjacent to empty token positions.
 * 
 * Rules (from design plan):
 * - Adjacent whitespace before an empty token is consumed
 * - Commas/periods immediately adjacent (no space) to empty tokens are preserved
 * - Punctuation with space before empty token is consumed with the token
 */
function cleanupEmptyTokens(text: string, emptyTokens: string[]): string {
  if (emptyTokens.length === 0) return text;

  let result = text;

  // Pattern: space before empty position, or trailing space after last content
  // Replace patterns like "  " (double space where token was) with single space
  result = result.replace(/\s{2,}/g, ' ');

  // Remove leading/trailing spaces
  result = result.trim();

  // Handle specific punctuation cases:
  // " , " -> "" (remove space-comma-space where token was empty)
  result = result.replace(/\s+,\s+/g, ' ');
  
  // ". " at start (empty title with period) -> ""
  result = result.replace(/^\.\s+/, '');
  
  // "Smith, " -> "Smith," (preserve comma, remove trailing space)
  result = result.replace(/,\s+$/, ',');
  result = result.replace(/\.\s+$/, '.');

  // "Dr. " at start with no following content -> "Dr."
  result = result.replace(/^(\w+\.)\s+$/, '$1');

  return result;
}

/**
 * Validate a format string for use as the global name_display_format setting.
 * 
 * @param formatString - Format string to validate
 * @returns Error message if invalid, null if valid
 */
export function validateGlobalFormatString(formatString: string): string | null {
  if (!formatString || !formatString.trim()) {
    return 'Format string cannot be empty';
  }

  // Reject %D token in global format (prevents infinite recursion)
  if (formatString.includes('%D')) {
    return 'Global name format cannot contain %D token';
  }

  return null; // Valid
}

/**
 * Sanitize display_name input to prevent XSS/HTML injection.
 * Strips all HTML tags and encodes special characters.
 */
export function sanitizeDisplayName(input: string | null | undefined): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Encode special chars FIRST (before stripping tags to catch < >)
  let sanitized = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Now strip any encoded HTML-like patterns (tags that were already encoded)
  sanitized = sanitized.replace(/&lt;[^&]*&gt;/g, '');

  return sanitized || null;
}

/**
 * Sanitize component name fields before database storage.
 * Keeps plain text punctuation intact while stripping HTML tags.
 */
export function sanitizeNameField(input: string | null | undefined): string | null {
  const normalized = normalizeToNull(input);
  if (!normalized) return null;

  const sanitized = normalized.replace(/<[^>]*>/g, '').trim();
  return sanitized || null;
}

/**
 * Normalize empty string to null (for database storage)
 */
export function normalizeToNull(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  return value.trim();
}
