interface DatedEvent {
  event_type: string;
  event_date: string | null;
}

function yearOf(events: DatedEvent[], type: string): string | null {
  const match = events.find((e) => e.event_type === type)?.event_date?.match(/\b(\d{4})\b/);
  return match ? match[1] : null;
}

/** "1931–2008" style lifespan from birth/death events; null when neither year is known. */
export function lifespanLabel(events: DatedEvent[]): string | null {
  const birth = yearOf(events, 'birth');
  const death = yearOf(events, 'death');
  if (!birth && !death) return null;
  return `${birth ?? ''}–${death ?? ''}`;
}
