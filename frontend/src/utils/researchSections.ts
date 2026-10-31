/**
 * Research notes, split into addressable sections.
 *
 * Issue #52 needs a claim to point at the passage that argues it, and issue #51
 * left the notes as one TEXT column rendered as a single paragraph -- nothing
 * inside it could be addressed.
 *
 * The prose turns out to already carry its own structure: paragraphs separated
 * by a blank line, and the ones that matter open with a sentence in capitals
 * ("HER FATHER'S NAME WAS NEVER IN DOUBT AFTER ALL."). That convention is in
 * the notes data itself, not only in the migration comments, so this reads the
 * headings off the prose rather than asking anyone to re-enter them.
 *
 * Nothing here is stored. A claim records only the slug, so re-ordering a note
 * cannot silently repoint an anchor at the wrong paragraph -- the way a stored
 * paragraph index would, given migrations rewrite whole notes strings.
 */

export interface ResearchSection {
  /** Stable id for the heading, or null when the paragraph has no heading. */
  slug: string | null;
  /** The capitalised opening sentence, trimmed, or null. */
  heading: string | null;
  /** The paragraph with its heading removed; may be empty for a bare heading. */
  body: string;
}

/* These notes are full of abbreviations inside capitalised headings -- "EMMA K.
   MOSER", "ST. JOHN'S CEMETERY", "ENG. CAN." -- and splitting on the first
   period turns "AND SHE HAS A GRAVE. ST. JOHN'S..." into a heading ending at
   "ST.". Word length cannot be the test: real headings end in short words
   ("AFTER ALL.", "BY A DAY."), so a period only fails to end the sentence after
   an initial or one of these. */
const ABBREVIATIONS = new Set([
  'st', 'mt', 'dr', 'mr', 'mrs', 'ms', 'jr', 'sr', 'co', 'no', 'vol', 'pp',
  'eng', 'can', 'us', 'usa', 'ave', 'rd', 'est', 'approx', 'cf', 'ca',
]);

/* Long enough that a stray "NO." or an initial cannot become a heading. */
const MIN_HEADING_LENGTH = 8;

/* Slugs reach the URL, so they are capped at a word boundary rather than
   carrying a whole sentence into the address bar. */
const MAX_SLUG_LENGTH = 60;

function hasLowercase(text: string): boolean {
  return /[a-z]/.test(text);
}

/**
 * The index just past the first sentence terminator that really ends a
 * sentence, or -1. Exported for the tests; the rest of the module is the API.
 */
export function firstSentenceEnd(paragraph: string): number {
  const terminator = /[.!?:]/g;
  let match = terminator.exec(paragraph);

  while (match) {
    const end = match.index + 1;
    const next = paragraph[end];
    // A terminator mid-word ("U.S") does not end a sentence.
    if (next === undefined || /\s/.test(next)) {
      const before = paragraph.slice(0, match.index);
      const word = before.match(/([A-Za-z0-9]+)[^A-Za-z0-9]*$/);
      const token = word?.[1] ?? '';
      const isAbbreviation = token.length === 1 || ABBREVIATIONS.has(token.toLowerCase());
      if (token && !isAbbreviation) {
        return end;
      }
    }
    match = terminator.exec(paragraph);
  }

  return -1;
}

export function slugifyHeading(heading: string): string {
  const base = heading
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (base.length <= MAX_SLUG_LENGTH) return `note-${base}`;

  const clipped = base.slice(0, MAX_SLUG_LENGTH);
  const lastBreak = clipped.lastIndexOf('-');
  return `note-${lastBreak > 0 ? clipped.slice(0, lastBreak) : clipped}`;
}

/**
 * Split a notes column into sections. Paragraphs are kept in order, including
 * the ones with no heading -- dropping them would lose prose.
 */
export function parseResearchSections(notes: string | null | undefined): ResearchSection[] {
  if (!notes?.trim()) return [];

  const paragraphs = notes
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);

  /* Headings repeat across this archive -- "REPORTED, NOT YET SEEN." appears on
     three different people. Within one note a repeat would make the slug
     ambiguous, so later copies are suffixed and the first keeps the bare slug,
     which means an anchor recorded before a repeat appeared still resolves. */
  const used = new Map<string, number>();

  return paragraphs.map((paragraph) => {
    const end = firstSentenceEnd(paragraph);
    const candidate = end === -1 ? paragraph : paragraph.slice(0, end);

    const isHeading =
      !hasLowercase(candidate) &&
      candidate.trim().length >= MIN_HEADING_LENGTH &&
      candidate.trim().split(/\s+/).length >= 2;

    if (!isHeading) {
      return { slug: null, heading: null, body: paragraph };
    }

    const heading = candidate.trim();
    const base = slugifyHeading(heading);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);

    return {
      slug: seen === 0 ? base : `${base}-${seen + 1}`,
      heading,
      body: (end === -1 ? '' : paragraph.slice(end)).trim(),
    };
  });
}
