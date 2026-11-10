import { describe, expect, it, vi } from 'vitest';

const extractMock = vi.fn();
vi.mock('../../providers/llm/factory.js', () => ({
  createLLMProvider: async () => ({ extract: extractMock }),
}));

const rankCandidatesMock = vi.fn().mockReturnValue([]);
vi.mock('./matching.js', () => ({ rankCandidates: (...args: unknown[]) => rankCandidatesMock(...args) }));

const { extractProposals } = await import('./extraction.js');

const SOURCE_TEXT = 'John Smith was born in 1920 in Boston. He married Jane Doe in 1945.';

function extractResult(proposals: unknown[]) {
  return { data: { proposals }, inputTokens: 100, outputTokens: 50 };
}

describe('extractProposals', () => {
  it('keeps a proposal whose citation verifies against the source text', async () => {
    extractMock.mockResolvedValueOnce(extractResult([
      {
        type: 'person',
        ref: 'person_1',
        givenName: 'John',
        surname: 'Smith',
        birthDate: '1920',
        citations: [{ quote: 'John Smith was born in 1920', locator: null }],
      },
    ]));

    const result = await extractProposals(SOURCE_TEXT);

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].proposal_type).toBe('person');
    const payload = result.proposals[0].payload as { citations: { citationStatus: string }[] };
    expect(payload.citations[0].citationStatus).toBe('verified');
  });

  it('drops a proposal whose citation does not verify (fabricated quote)', async () => {
    extractMock.mockResolvedValueOnce(extractResult([
      {
        type: 'fact',
        statement: 'John Smith liked sailing.',
        subjectRef: 'person_1',
        citations: [{ quote: 'John Smith loved the sea', locator: null }],
      },
    ]));

    const result = await extractProposals(SOURCE_TEXT);

    expect(result.proposals).toHaveLength(0);
  });

  it('drops a proposal with no citations at all', async () => {
    extractMock.mockResolvedValueOnce(extractResult([
      { type: 'fact', statement: 'Unsupported claim.', subjectRef: 'person_1', citations: [] },
    ]));

    const result = await extractProposals(SOURCE_TEXT);

    expect(result.proposals).toHaveLength(0);
  });

  it('ranks candidates for a person proposal', async () => {
    rankCandidatesMock.mockReturnValueOnce([{ personId: 'p1', score: 75, reasons: ['Same normalized primary name'], displayName: 'John Smith', birthYear: 1920 }]);
    extractMock.mockResolvedValueOnce(extractResult([
      {
        type: 'person',
        ref: 'person_1',
        givenName: 'John',
        surname: 'Smith',
        citations: [{ quote: 'John Smith was born in 1920', locator: null }],
      },
    ]));

    const result = await extractProposals(SOURCE_TEXT);

    const payload = result.proposals[0].payload as { matches: { personId: string }[] };
    expect(payload.matches).toEqual([{ personId: 'p1', score: 75, reasons: ['Same normalized primary name'], displayName: 'John Smith', birthYear: 1920 }]);
  });

  it('returns an empty proposal list when the model finds nothing', async () => {
    extractMock.mockResolvedValueOnce(extractResult([]));

    const result = await extractProposals(SOURCE_TEXT);

    expect(result.proposals).toEqual([]);
  });
});
