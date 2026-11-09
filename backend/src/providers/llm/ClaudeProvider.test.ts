import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAuthenticationError extends Error {}
class FakePermissionDeniedError extends Error {}
class FakeRateLimitError extends Error {}
class FakeAPIConnectionTimeoutError extends Error {}
class FakeRequestTimeoutError extends Error {}

const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = { create: createMock };
  }
  return {
    default: FakeAnthropic,
    AuthenticationError: FakeAuthenticationError,
    PermissionDeniedError: FakePermissionDeniedError,
    RateLimitError: FakeRateLimitError,
    APIConnectionTimeoutError: FakeAPIConnectionTimeoutError,
    RequestTimeoutError: FakeRequestTimeoutError,
  };
});

const { ClaudeProvider } = await import('./ClaudeProvider.js');
const { LLMProviderError } = await import('./LLMProvider.js');

function message(overrides: Partial<{ stop_reason: string; content: unknown[]; usage: { input_tokens: number; output_tokens: number } }> = {}) {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'hello' }],
    usage: { input_tokens: 10, output_tokens: 20 },
    ...overrides,
  };
}

describe('ClaudeProvider', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  describe('transcribe', () => {
    it('returns the text block and token counts', async () => {
      createMock.mockResolvedValueOnce(message({ content: [{ type: 'text', text: 'transcribed text' }] }));
      const provider = new ClaudeProvider('key', 'claude-opus-5-5');

      const result = await provider.transcribe({ bytes: Buffer.from('fake'), mediaType: 'image/png' });

      expect(result).toEqual({ text: 'transcribed text', truncated: false, inputTokens: 10, outputTokens: 20 });
    });

    it('reports truncated:true instead of throwing when cut off by max_tokens', async () => {
      createMock.mockResolvedValueOnce(message({
        stop_reason: 'max_tokens',
        content: [{ type: 'text', text: 'partial transcript that ran out of' }],
      }));
      const provider = new ClaudeProvider('key', 'claude-opus-5-5');

      const result = await provider.transcribe({ bytes: Buffer.from('x'), mediaType: 'image/png' });

      // The real, usable text is returned, not discarded -- the caller
      // decides what to do with a cut-off transcript.
      expect(result.text).toBe('partial transcript that ran out of');
      expect(result.truncated).toBe(true);
    });

    it('throws a refusal LLMProviderError when the model declines', async () => {
      createMock.mockResolvedValueOnce(message({ stop_reason: 'refusal' }));
      const provider = new ClaudeProvider('key', 'claude-opus-5-5');

      await expect(provider.transcribe({ bytes: Buffer.from('x'), mediaType: 'image/png' }))
        .rejects.toMatchObject({ kind: 'refusal' });
    });

    it('maps the SDK AuthenticationError onto kind "auth"', async () => {
      createMock.mockRejectedValueOnce(new FakeAuthenticationError('bad key'));
      const provider = new ClaudeProvider('key', 'claude-opus-5-5');

      await expect(provider.transcribe({ bytes: Buffer.from('x'), mediaType: 'image/png' }))
        .rejects.toMatchObject({ kind: 'auth' });
    });

    it('maps the SDK RateLimitError onto kind "rate_limit"', async () => {
      createMock.mockRejectedValueOnce(new FakeRateLimitError('slow down'));
      const provider = new ClaudeProvider('key', 'claude-opus-5-5');

      await expect(provider.transcribe({ bytes: Buffer.from('x'), mediaType: 'image/png' }))
        .rejects.toMatchObject({ kind: 'rate_limit' });
    });

    it('maps a timeout error onto kind "timeout"', async () => {
      createMock.mockRejectedValueOnce(new FakeAPIConnectionTimeoutError('timed out'));
      const provider = new ClaudeProvider('key', 'claude-opus-5-5');

      await expect(provider.transcribe({ bytes: Buffer.from('x'), mediaType: 'image/png' }))
        .rejects.toMatchObject({ kind: 'timeout' });
    });

    it('maps an unrecognized error onto kind "provider"', async () => {
      createMock.mockRejectedValueOnce(new Error('something else'));
      const provider = new ClaudeProvider('key', 'claude-opus-5-5');

      await expect(provider.transcribe({ bytes: Buffer.from('x'), mediaType: 'image/png' }))
        .rejects.toMatchObject({ kind: 'provider' });
    });

    it('rejects an unsupported media type before calling the API', async () => {
      const provider = new ClaudeProvider('key', 'claude-opus-5-5');

      await expect(provider.transcribe({ bytes: Buffer.from('x'), mediaType: 'text/plain' }))
        .rejects.toMatchObject({ kind: 'invalid_response' });
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  describe('extract', () => {
    it('parses the JSON text block as the result', async () => {
      createMock.mockResolvedValueOnce(message({ content: [{ type: 'text', text: '{"facts":["a"]}' }] }));
      const provider = new ClaudeProvider('key', 'claude-opus-5-5');

      const result = await provider.extract<{ facts: string[] }>(
        { text: 'some source text', systemPrompt: 'extract facts' },
        { type: 'object', properties: {} },
      );

      expect(result.data).toEqual({ facts: ['a'] });
      expect(result.stopReason).toBe('end_turn');
    });

    it('throws invalid_response for malformed JSON', async () => {
      createMock.mockResolvedValueOnce(message({ content: [{ type: 'text', text: 'not json' }] }));
      const provider = new ClaudeProvider('key', 'claude-opus-5-5');

      await expect(provider.extract({ text: 'x', systemPrompt: 'p' }, {}))
        .rejects.toMatchObject({ kind: 'invalid_response' });
    });

    it('throws invalid_response when truncated by max_tokens', async () => {
      createMock.mockResolvedValueOnce(message({ stop_reason: 'max_tokens' }));
      const provider = new ClaudeProvider('key', 'claude-opus-5-5');

      await expect(provider.extract({ text: 'x', systemPrompt: 'p' }, {}))
        .rejects.toMatchObject({ kind: 'invalid_response' });
    });

    it('requires text or a file', async () => {
      const provider = new ClaudeProvider('key', 'claude-opus-5-5');

      await expect(provider.extract({ systemPrompt: 'p' }, {}))
        .rejects.toMatchObject({ kind: 'invalid_response' });
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  it('LLMProviderError carries its kind and message', () => {
    const error = new LLMProviderError('auth', 'no key');
    expect(error.kind).toBe('auth');
    expect(error.message).toBe('no key');
    expect(error).toBeInstanceOf(Error);
  });
});
