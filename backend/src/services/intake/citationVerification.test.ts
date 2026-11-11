import { describe, expect, it } from 'vitest';
import { hasVerifiedCitation, verifyCitations, verifyQuote } from './citationVerification.js';

describe('verifyQuote', () => {
  it('matches an exact substring', () => {
    expect(verifyQuote('John Smith was born', 'In 1920, John Smith was born in Boston.')).toBe(true);
  });

  it('matches across whitespace/line-wrap differences', () => {
    expect(verifyQuote('John Smith\n  was born', 'In 1920, John Smith was born in Boston.')).toBe(true);
  });

  it('rejects a quote not present in the source', () => {
    expect(verifyQuote('Jane Doe was born', 'In 1920, John Smith was born in Boston.')).toBe(false);
  });

  it('rejects an empty quote', () => {
    expect(verifyQuote('   ', 'Anything at all.')).toBe(false);
  });
});

describe('verifyCitations / hasVerifiedCitation', () => {
  const sourceText = 'John Smith was born in 1920 in Boston.';

  it('marks a real quote verified and a fabricated one unverified', () => {
    const payload = {
      citations: [
        { quote: 'John Smith was born in 1920', citationStatus: 'unverified' as const },
        { quote: 'fabricated nonsense', citationStatus: 'unverified' as const },
      ],
    };
    const result = verifyCitations(payload, sourceText);
    expect(result.citations[0].citationStatus).toBe('verified');
    expect(result.citations[1].citationStatus).toBe('unverified');
  });

  it('drops a proposal whose every citation is unverified', () => {
    const payload = { citations: [{ quote: 'fabricated nonsense', citationStatus: 'unverified' as const }] };
    const verified = verifyCitations(payload, sourceText);
    expect(hasVerifiedCitation(verified)).toBe(false);
  });

  it('keeps a proposal with at least one verified citation', () => {
    const payload = {
      citations: [
        { quote: 'John Smith was born in 1920', citationStatus: 'unverified' as const },
        { quote: 'fabricated nonsense', citationStatus: 'unverified' as const },
      ],
    };
    const verified = verifyCitations(payload, sourceText);
    expect(hasVerifiedCitation(verified)).toBe(true);
  });

  it('drops a proposal with zero citations', () => {
    expect(hasVerifiedCitation({ citations: [] })).toBe(false);
  });
});
