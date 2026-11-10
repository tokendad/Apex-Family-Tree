/**
 * Mechanical enforcement of #73's "every fact must cite the source text or
 * be dropped" rule. The system prompt asks the model to only extract facts
 * it can quote verbatim, but a prompt is not a guarantee -- this is the
 * check that actually drops anything it got wrong, rather than trusting it.
 */

/** Collapses runs of whitespace (including newlines) to a single space and
 *  trims, so a quote that differs from the source only in line-wrapping or
 *  incidental spacing still verifies. */
function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function verifyQuote(quote: string, sourceText: string): boolean {
  const normalizedQuote = normalizeWhitespace(quote);
  if (!normalizedQuote) return false;
  return normalizeWhitespace(sourceText).includes(normalizedQuote);
}

interface CitationLike {
  quote: string;
  citationStatus: 'verified' | 'unverified' | 'unconfirmed_image';
}

export interface CitedPayload {
  citations: CitationLike[];
}

/**
 * Marks each citation against the source. `sourceText` is `null` for an
 * image/PDF submission (#73 Phase 2) -- there is no text to substring-match
 * a quote against, so every citation there is marked 'unconfirmed_image'
 * instead of mechanically checked. Confirming it against the document is the
 * reviewer's job in that case, same as an 'edit' decision already requires
 * human judgment elsewhere in this pipeline.
 *
 * Returns the payload unchanged structurally -- callers decide whether to
 * keep a proposal whose citations all failed.
 */
export function verifyCitations<T extends CitedPayload>(payload: T, sourceText: string | null): T {
  return {
    ...payload,
    citations: payload.citations.map((citation) => ({
      ...citation,
      citationStatus: sourceText === null
        ? 'unconfirmed_image' as const
        : verifyQuote(citation.quote, sourceText) ? 'verified' as const : 'unverified' as const,
    })),
  };
}

/** A proposal with zero citations, or every citation unverified, has nothing
 *  backing it -- #73's hard rule is that it gets dropped, not staged for
 *  review with a warning. 'unconfirmed_image' counts as backing: the quote
 *  is still required and still shown, just not mechanically checked. */
export function hasVerifiedCitation(payload: CitedPayload): boolean {
  return payload.citations.some((citation) => citation.citationStatus === 'verified' || citation.citationStatus === 'unconfirmed_image');
}
