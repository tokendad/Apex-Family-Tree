import { describe, expect, it } from 'vitest';
import { toSqliteBool } from './sqliteBool.js';

describe('toSqliteBool', () => {
  it('converts JSON booleans, which better-sqlite3 refuses to bind', () => {
    expect(toSqliteBool(true, 0)).toBe(1);
    expect(toSqliteBool(false, 1)).toBe(0);
  });

  it('passes numbers through as 0 or 1', () => {
    expect(toSqliteBool(1, 0)).toBe(1);
    expect(toSqliteBool(0, 1)).toBe(0);
    expect(toSqliteBool(7, 0)).toBe(1);
  });

  it('accepts string forms, since query strings carry no real booleans', () => {
    expect(toSqliteBool('true', 0)).toBe(1);
    expect(toSqliteBool('on', 0)).toBe(1);
    expect(toSqliteBool('false', 1)).toBe(0);
    expect(toSqliteBool('', 1)).toBe(0);
  });

  it('falls back when the value is absent or meaningless', () => {
    expect(toSqliteBool(undefined, 1)).toBe(1);
    expect(toSqliteBool(null, 0)).toBe(0);
    expect(toSqliteBool({}, 1)).toBe(1);
  });
});
