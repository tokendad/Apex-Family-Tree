import { describe, it, expectTypeOf } from 'vitest';
import type { PersonSummary, FamilySummary } from './genealogy';

describe('PersonSummary', () => {
  it('has required id and nullable name fields', () => {
    expectTypeOf<PersonSummary>().toHaveProperty('id');
    expectTypeOf<PersonSummary['given_name']>().toEqualTypeOf<string | null>();
    expectTypeOf<PersonSummary['surname']>().toEqualTypeOf<string | null>();
  });
});

describe('FamilySummary', () => {
  it('has nullable spouse ids and optional spouse objects', () => {
    expectTypeOf<FamilySummary['spouse1_id']>().toEqualTypeOf<string | null>();
    expectTypeOf<FamilySummary['spouse1']>().toEqualTypeOf<PersonSummary | null>();
  });
});
