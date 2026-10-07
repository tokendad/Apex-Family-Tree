import { describe, expect, it } from 'vitest';
import { objectPath } from './objectPath';

describe('objectPath', () => {
  it.each([
    ['person', '/people/abc'],
    ['artifact', '/artifacts/abc'],
    ['event', '/events/abc'],
    ['place', '/places/abc'],
    ['collection', '/collections/abc'],
    ['claim', '/claims/abc'],
    ['story', '/stories/abc'],
    ['source', '/sources/abc'],
  ])('routes %s objects', (type, expected) => {
    expect(objectPath(type, 'abc')).toBe(expected);
  });

  it('degrades to a dead link for an unknown type', () => {
    // Object types come from the API; an unrecognised one should not break the
    // page that is rendering the link.
    expect(objectPath('something_new', 'abc')).toBe('#');
  });
});
