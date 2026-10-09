import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './safeRedirect';

const ORIGIN = 'https://aft.example.com';
const safe = (value: string | null | undefined) => safeRedirectPath(value, ORIGIN);

describe('safeRedirectPath — keeps a post-login redirect on this site', () => {
  it('allows an ordinary in-app path', () => {
    expect(safe('/people/abc123')).toBe('/people/abc123');
    expect(safe('/collections')).toBe('/collections');
  });

  it('keeps the query string and fragment', () => {
    expect(safe('/search?q=lefort#results')).toBe('/search?q=lefort#results');
  });

  it('falls back when there is no redirect at all', () => {
    expect(safe(null)).toBe('/');
    expect(safe(undefined)).toBe('/');
    expect(safe('')).toBe('/');
  });

  // The previous guard was redirect.startsWith('/'), which each of these passes
  // while still sending the browser somewhere else entirely.
  it('refuses a protocol-relative URL', () => {
    expect(safe('//evil.com')).toBe('/');
    expect(safe('//evil.com/phish')).toBe('/');
  });

  it('refuses backslash variants (GHSA-wrjc-x8rr-h8h6)', () => {
    expect(safe('/\\evil.com')).toBe('/');
    expect(safe('/\\/evil.com')).toBe('/');
    expect(safe('\\\\evil.com')).toBe('/');
    expect(safe('/people\\..\\..\\evil.com')).toBe('/');
  });

  it('refuses an absolute URL to another origin', () => {
    expect(safe('https://evil.com')).toBe('/');
    expect(safe('http://evil.com/x')).toBe('/');
  });

  it('refuses a scheme that is not navigation at all', () => {
    expect(safe('javascript:alert(1)')).toBe('/');
    expect(safe('data:text/html,<script>alert(1)</script>')).toBe('/');
  });

  it('refuses credentials smuggled into the authority', () => {
    expect(safe('//aft.example.com@evil.com/')).toBe('/');
  });

  it('allows an absolute URL back to this very origin, reduced to its path', () => {
    expect(safeRedirectPath(`${ORIGIN}/people/1`, ORIGIN)).toBe('/');
  });

  it('honours a caller-supplied fallback', () => {
    expect(safeRedirectPath('//evil.com', ORIGIN, '/dashboard')).toBe('/dashboard');
  });
});
