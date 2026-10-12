/**
 * The two fields every event form keeps for its source link (#41), kept apart
 * from the components so a form can import the shape without importing JSX.
 */
export interface EventSourceForm {
  source_url: string;
  source_url_checked_at: string;
}

export const EMPTY_EVENT_SOURCE: EventSourceForm = {
  source_url: '',
  source_url_checked_at: '',
};

/** Today as YYYY-MM-DD in the viewer's own timezone, which is what they mean. */
export function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
