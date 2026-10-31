import { describe, expect, it } from 'vitest';
import { firstSentenceEnd, parseResearchSections, slugifyHeading } from './researchSections';

describe('firstSentenceEnd', () => {
  it('ends the sentence at a real terminator', () => {
    const text = 'AND SHE HAS A GRAVE. ST. JOHN\'S CEMETERY in Worcester.';
    expect(text.slice(0, firstSentenceEnd(text))).toBe('AND SHE HAS A GRAVE.');
  });

  /* The notes are full of these, and a naive split on the first period turns
     "AND SHE HAS A GRAVE. ST. JOHN'S..." into a heading ending at "ST.". */
  it('steps over an abbreviation and an initial', () => {
    const initial = 'EMMA K. MOSER IS RIGHT. The 1910 census agrees.';
    expect(initial.slice(0, firstSentenceEnd(initial))).toBe('EMMA K. MOSER IS RIGHT.');

    const saint = 'ST. DAMIEN IS THE PARISH. Her baptism is filed there.';
    expect(saint.slice(0, firstSentenceEnd(saint))).toBe('ST. DAMIEN IS THE PARISH.');
  });

  it('ignores the terminators inside an initialism', () => {
    const text = 'BORN IN THE U.S.A. and never naturalised.';
    // It must run past "U.S.A." to the real end, not stop inside it.
    expect(text.slice(0, firstSentenceEnd(text))).toBe(text);
  });

  it('reports -1 when the paragraph has no terminator at all', () => {
    expect(firstSentenceEnd('A paragraph with no ending')).toBe(-1);
  });
});

describe('slugifyHeading', () => {
  it('builds a readable, prefixed slug', () => {
    expect(slugifyHeading("HER FATHER'S NAME WAS NEVER IN DOUBT AFTER ALL."))
      .toBe('note-her-fathers-name-was-never-in-doubt-after-all');
  });

  it('clips a long heading at a word boundary rather than mid-word', () => {
    const slug = slugifyHeading(
      'TWO OPEN ITEMS IN THE PARAGRAPHS ABOVE ARE NOW CLOSED AND FILED HERE WITH THE REST.',
    );
    expect(slug.length).toBeLessThanOrEqual('note-'.length + 60);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.startsWith('note-two-open-items')).toBe(true);
  });
});

describe('parseResearchSections', () => {
  it('returns nothing for an empty note', () => {
    expect(parseResearchSections(null)).toEqual([]);
    expect(parseResearchSections('   ')).toEqual([]);
  });

  it('reads the heading off a capitalised opening sentence', () => {
    const notes = "HER FATHER'S NAME WAS NEVER IN DOUBT AFTER ALL. For one day in October 2026 "
      + 'this archive was going to rename him Prosper.';

    expect(parseResearchSections(notes)).toEqual([
      {
        slug: 'note-her-fathers-name-was-never-in-doubt-after-all',
        heading: "HER FATHER'S NAME WAS NEVER IN DOUBT AFTER ALL.",
        body: 'For one day in October 2026 this archive was going to rename him Prosper.',
      },
    ]);
  });

  /* The capitals ARE the signal. If this guard ever drifts, every ordinary
     sentence in the archive becomes a section heading, so it gets its own test
     rather than being covered only in passing. */
  it('does not treat a sentence-case opening as a heading', () => {
    for (const notes of [
      'Mother of Emma Kathrine (Moser) LeFort. Named in her 2003 obituary.',
      'Her Father Was Joseph. Title case is not a heading either.',
      'HER FATHER WAS JOSEPh. One lowercase letter disqualifies it.',
    ]) {
      const [section] = parseResearchSections(notes);
      expect(section.heading).toBeNull();
      expect(section.slug).toBeNull();
      expect(section.body).toBe(notes);
    }
  });

  it('keeps an unheaded paragraph rather than dropping its prose', () => {
    const notes = 'Mother of Emma Kathrine (Moser) LeFort.\n\nHER BIRTH MOVED BY A DAY. The act says so.';
    const sections = parseResearchSections(notes);

    expect(sections).toHaveLength(2);
    expect(sections[0]).toEqual({
      slug: null,
      heading: null,
      body: 'Mother of Emma Kathrine (Moser) LeFort.',
    });
    expect(sections[1].heading).toBe('HER BIRTH MOVED BY A DAY.');
  });

  it('treats a wholly capitalised paragraph as a bare heading', () => {
    const [section] = parseResearchSections('REPORTED, NOT YET SEEN.');

    expect(section.heading).toBe('REPORTED, NOT YET SEEN.');
    expect(section.body).toBe('');
  });

  it('leaves capitals inside the body alone', () => {
    const notes = 'TWO OPEN ITEMS ARE NOW CLOSED. "HER BAPTISM REGISTER IS THE OPEN ITEM" '
      + '-- it has been read, and it is filed here.';
    const [section] = parseResearchSections(notes);

    expect(section.heading).toBe('TWO OPEN ITEMS ARE NOW CLOSED.');
    expect(section.body).toContain('"HER BAPTISM REGISTER IS THE OPEN ITEM"');
  });

  /* "REPORTED, NOT YET SEEN." already appears on three different people, so a
     repeat inside one note is a live risk, not a hypothetical. */
  it('disambiguates a heading that repeats within one note', () => {
    const notes = 'REPORTED, NOT YET SEEN.\n\nSome prose.\n\nREPORTED, NOT YET SEEN.';
    const slugs = parseResearchSections(notes).map(section => section.slug);

    expect(slugs).toEqual(['note-reported-not-yet-seen', null, 'note-reported-not-yet-seen-2']);
  });

  it('gives the first occurrence the bare slug so older anchors keep resolving', () => {
    const one = parseResearchSections('REPORTED, NOT YET SEEN.');
    const two = parseResearchSections('REPORTED, NOT YET SEEN.\n\nREPORTED, NOT YET SEEN.');

    expect(two[0].slug).toBe(one[0].slug);
  });

  it('does not mistake a short capitalised fragment for a heading', () => {
    // "NO." is an abbreviation in a citation, not a section of the argument.
    const [section] = parseResearchSections('NO. 14 of the register, which is her entry.');
    expect(section.heading).toBeNull();
  });

  it('splits a real multi-section note in order', () => {
    const notes = [
      "HER FATHER'S NAME WAS NEVER IN DOUBT AFTER ALL. See her father's notes.",
      'TWO OPEN ITEMS IN THE PARAGRAPHS ABOVE ARE NOW CLOSED. It has been read.',
      'HER BIRTH MOVED BY A DAY. Birth 25 June, baptism 26 June.',
      'AND HER SISTER JOSEPHINE IS CONFIRMED. She is still not entered as a person here.',
    ].join('\n\n');

    const sections = parseResearchSections(notes);
    expect(sections).toHaveLength(4);
    expect(sections.every(section => section.slug !== null)).toBe(true);
    expect(sections[2].slug).toBe('note-her-birth-moved-by-a-day');
  });
});
