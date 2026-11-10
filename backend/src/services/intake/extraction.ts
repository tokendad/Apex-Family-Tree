import { createLLMProvider } from '../../providers/llm/factory.js';
import { LLMProviderError } from '../../providers/llm/LLMProvider.js';
import { hasVerifiedCitation, verifyCitations } from './citationVerification.js';
import { rankCandidates } from './matching.js';
import type { ProposalPayload, RawProposal } from '../../types/intake.js';

/**
 * JSON schema the model's output is constrained to. Every variant requires at
 * least one citation with a non-empty quote -- the system prompt backs this
 * up with an instruction to omit anything unquotable, and
 * citationVerification.ts backs *that* up by actually checking the quote
 * against the source text after the call returns, dropping anything that
 * doesn't verify. Neither layer alone is the enforcement; both together are.
 */
// Anthropic structured outputs accept only a constrained subset of JSON
// Schema: `anyOf`, not `oneOf`; no `minLength`/`maxLength`; `minItems` only as
// 0 or 1; nullable fields as `anyOf: [{type}, {type: 'null'}]`, not a `type`
// array; and every object needs `additionalProperties: false`. Anything else
// is a 400 before the model ever runs.
const NULLABLE_STRING = { anyOf: [{ type: 'string' }, { type: 'null' }] };

const CITATION_SCHEMA = {
  type: 'array',
  minItems: 1,
  items: {
    type: 'object',
    properties: {
      quote: { type: 'string' },
      locator: NULLABLE_STRING,
    },
    required: ['quote', 'locator'],
    additionalProperties: false,
  },
};

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      items: {
        anyOf: [
          {
            type: 'object',
            properties: {
              type: { const: 'person' },
              ref: { type: 'string' },
              givenName: { type: 'string' },
              surname: NULLABLE_STRING,
              birthDate: NULLABLE_STRING,
              deathDate: NULLABLE_STRING,
              citations: CITATION_SCHEMA,
            },
            required: ['type', 'ref', 'givenName', 'surname', 'birthDate', 'deathDate', 'citations'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: { const: 'relationship' },
              personARef: { type: 'string' },
              personBRef: { type: 'string' },
              relType: { enum: ['spouse_of', 'parent_of', 'child_of'] },
              citations: CITATION_SCHEMA,
            },
            required: ['type', 'personARef', 'personBRef', 'relType', 'citations'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: { const: 'event' },
              personRef: { type: 'string' },
              eventType: { type: 'string' },
              date: NULLABLE_STRING,
              place: NULLABLE_STRING,
              citations: CITATION_SCHEMA,
            },
            required: ['type', 'personRef', 'eventType', 'date', 'place', 'citations'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: { const: 'fact' },
              statement: { type: 'string' },
              subjectRef: { type: 'string' },
              citations: CITATION_SCHEMA,
            },
            required: ['type', 'statement', 'subjectRef', 'citations'],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  required: ['proposals'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are a genealogy research assistant. Read the supplied source -- which may be
plain text, or a scanned document/photo/PDF -- and extract discrete, citable facts about
people: identities, relationships (spouse/parent/child), life events (birth, death,
marriage, etc.), and any other named fact worth recording.

Rules:
- Every fact you extract MUST include at least one citation with a verbatim excerpt,
  transcribed exactly as it appears in the source, that supports it. If the source is an
  image or document, transcribe the relevant words exactly as written/printed, including
  original spelling -- do not paraphrase or correct it. If you cannot quote the source
  verbatim to support a fact, omit that fact entirely -- do not guess, infer, or extract
  anything you can't quote.
- Every "person" proposal has its own "ref" string (e.g. "person_1"), which you choose.
  personARef/personBRef/personRef/subjectRef on relationship/event/fact proposals must
  match the "ref" of a "person" proposal elsewhere in this same response -- that is how a
  fact is linked to the person it is about. Use the same ref for the same person across
  every proposal that mentions them, and give every distinct person their own ref.
- Keep statements factual and specific. Do not editorialize or speculate about meaning.
- Write every date as a bare year ("1920"), an ISO date ("1920-11-29"), or with one of these
  qualifiers: "ABT 1920", "BEF 1920", "AFT 1920", "BET 1920 AND 1925", "CAL 1920", "EST 1920".
  Do not write a date any other way (no "circa", no month names written out, no slashes).
- If the text contains no extractable facts, return an empty proposals array.`;

interface RawExtractedProposal {
  type: ProposalPayload['type'];
  [key: string]: unknown;
}

function toPayload(raw: RawExtractedProposal): ProposalPayload {
  const citations = (Array.isArray(raw.citations) ? raw.citations : []).map((citation) => ({
    quote: String((citation as { quote?: unknown }).quote ?? ''),
    locator: (citation as { locator?: string | null }).locator ?? null,
    region: null,
    citationStatus: 'unverified' as const,
  }));

  switch (raw.type) {
    case 'person':
      return {
        type: 'person',
        ref: String(raw.ref ?? ''),
        givenName: String(raw.givenName ?? ''),
        surname: (raw.surname as string | null) ?? null,
        birthDate: (raw.birthDate as string | null) ?? null,
        deathDate: (raw.deathDate as string | null) ?? null,
        citations,
        matches: [],
      };
    case 'relationship':
      return {
        type: 'relationship',
        personARef: String(raw.personARef ?? ''),
        personBRef: String(raw.personBRef ?? ''),
        relType: raw.relType as 'spouse_of' | 'parent_of' | 'child_of',
        citations,
      };
    case 'event':
      return {
        type: 'event',
        personRef: String(raw.personRef ?? ''),
        eventType: String(raw.eventType ?? ''),
        date: (raw.date as string | null) ?? null,
        place: (raw.place as string | null) ?? null,
        citations,
      };
    case 'fact':
      return {
        type: 'fact',
        statement: String(raw.statement ?? ''),
        subjectRef: String(raw.subjectRef ?? ''),
        citations,
      };
    default:
      throw new LLMProviderError('invalid_response', `Unknown proposal type: ${String(raw.type)}`);
  }
}

export interface ExtractionResult {
  proposals: RawProposal[];
  inputTokens: number;
  outputTokens: number;
}

export interface ExtractionSource {
  /** Pasted text. May accompany a file (a caption or context note alongside
   *  an attached photo), or be the only source. */
  text?: string;
  /** An uploaded image or PDF (#73 Phase 2). When present, citations cannot
   *  be substring-verified against anything -- see citationVerification.ts. */
  file?: { bytes: Buffer; mediaType: string };
}

/**
 * Runs extraction against the given source (text, a file, or both), verifies
 * every citation, drops any proposal with no citable evidence, and ranks
 * person proposals against the existing tree. What comes back is exactly
 * what gets staged as intake_proposals -- nothing downstream re-checks
 * citations.
 */
export async function extractProposals(source: ExtractionSource): Promise<ExtractionResult> {
  if (!source.text && !source.file) throw new LLMProviderError('invalid_response', 'extractProposals requires text or a file.');

  const provider = await createLLMProvider();
  const result = await provider.extract<{ proposals: RawExtractedProposal[] }>(
    { text: source.text, file: source.file, systemPrompt: SYSTEM_PROMPT },
    EXTRACTION_SCHEMA,
  );

  // No source text to substring-match a quote against once a file is
  // involved -- citationVerification.ts marks every citation
  // 'unconfirmed_image' in that case instead of mechanically checking it.
  const sourceTextForVerification = source.file ? null : (source.text ?? '');

  const proposals: RawProposal[] = [];
  for (const raw of result.data.proposals ?? []) {
    const payload = verifyCitations(toPayload(raw), sourceTextForVerification);
    if (!hasVerifiedCitation(payload)) continue;

    if (payload.type === 'person') {
      payload.matches = rankCandidates({
        givenName: payload.givenName,
        surname: payload.surname,
        birthDate: payload.birthDate,
        deathDate: payload.deathDate,
      });
    }

    proposals.push({ proposal_type: payload.type, payload, confidence: null });
  }

  return { proposals, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}
