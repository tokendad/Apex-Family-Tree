import { describe, expect, it } from 'vitest';
import { sortEventsForTimeline } from '@/utils/eventTypes';

type Event = Parameters<typeof sortEventsForTimeline>[0][number];

function ev(type: string, date: string | null, key: number | null): Event {
  return {
    id: `${type}-${date ?? 'none'}`,
    event_type: type,
    event_date: date,
    event_date_sort_key: key,
    event_place: null,
    description: null,
  } as Event;
}

const order = (events: Event[]) => sortEventsForTimeline(events).map((e) => e.event_type);

describe('timeline ordering', () => {
  /* David Higgins, exactly as the page showed him: birth, then a celebration
     of life, then the marriage, then the death. */
  it('puts a life in the order it was lived', () => {
    const events = [
      ev('birth', '15 MAR 1959', 19590315),
      ev('other', '1 JUL 2014', 20140701),
      ev('marriage', 'ABT 1986', 19860000),
      ev('death', '24 JUN 2014', 20140624),
    ];

    expect(order(events)).toEqual(['birth', 'marriage', 'death', 'other']);
  });

  /* The old sort compared the GEDCOM strings, where "1 JUL 2014" precedes
     "ABT 1986" because "1" precedes "A". */
  it('does not compare dates as text', () => {
    const events = [ev('other', '1 JUL 2014', 20140701), ev('marriage', 'ABT 1986', 19860000)];

    expect(order(events)).toEqual(['marriage', 'other']);
  });

  /* Death was pinned last whatever its date, so a funeral held afterwards
     appeared above it. */
  it('lets an event that happened after a death appear after it', () => {
    const events = [ev('burial', '19 APR 1993', 19930419), ev('death', '16 APR 1993', 19930416)];

    expect(order(events)).toEqual(['death', 'burial']);
  });

  it('keeps undated events at the end', () => {
    const events = [
      ev('occupation', null, null),
      ev('birth', '12 OCT 1926', 19261012),
      ev('death', '16 APR 1993', 19930416),
    ];

    expect(order(events)).toEqual(['birth', 'death', 'occupation']);
  });

  /* Two things recorded on one day still read sensibly. */
  it('falls back to type order on the same date', () => {
    const events = [ev('baptism', '5 JAN 1922', 19220105), ev('birth', '5 JAN 1922', 19220105)];

    expect(order(events)).toEqual(['birth', 'baptism']);
  });

  it('is stable for undated events of the same kind', () => {
    const events = [ev('residence', null, null), ev('occupation', null, null)];

    expect(order(events)).toHaveLength(2);
  });
});
