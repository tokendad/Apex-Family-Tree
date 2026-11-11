import Anthropic, {
  APIConnectionTimeoutError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  RequestTimeoutError,
} from '@anthropic-ai/sdk';
import type {
  Base64ImageSource,
  Base64PDFSource,
  ContentBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages.js';
import {
  LLMProviderError,
  type ExtractInput,
  type ExtractResult,
  type LLMProvider,
  type TranscribeInput,
  type TranscribeResult,
} from './LLMProvider.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function toSourceBlock(bytes: Buffer, mediaType: string): ContentBlockParam {
  const data = bytes.toString('base64');
  if (mediaType === 'application/pdf') {
    const source: Base64PDFSource = { type: 'base64', media_type: 'application/pdf', data };
    return { type: 'document', source };
  }
  if (ALLOWED_IMAGE_TYPES.has(mediaType)) {
    const source: Base64ImageSource = { type: 'base64', media_type: mediaType as Base64ImageSource['media_type'], data };
    return { type: 'image', source };
  }
  throw new LLMProviderError('invalid_response', `Unsupported media type for Claude: ${mediaType}`);
}

/** Maps the SDK's typed errors onto this app's provider-agnostic error kinds,
 *  so a caller never has to know which SDK threw. */
function toProviderError(error: unknown): LLMProviderError {
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return new LLMProviderError('auth', error.message);
  }
  if (error instanceof RateLimitError) {
    return new LLMProviderError('rate_limit', error.message);
  }
  if (error instanceof APIConnectionTimeoutError || error instanceof RequestTimeoutError) {
    return new LLMProviderError('timeout', error.message);
  }
  if (error instanceof LLMProviderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new LLMProviderError('provider', message);
}

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey, timeout: 120_000 });
    this.model = model;
  }

  async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    try {
      const message = await this.client.messages.create({
        model: this.model,
        // A dense multi-page document can run well past a few thousand
        // tokens of transcript; truncating silently would hand back a
        // partial document with no sign anything was cut, the opposite of
        // this feature's point. 16384 covers a long multi-page scan at
        // normal transcription density.
        max_tokens: 16384,
        messages: [
          {
            role: 'user',
            content: [
              toSourceBlock(input.bytes, input.mediaType),
              {
                type: 'text',
                text: 'Transcribe this document exactly as written, including any marginal notes. Output only the transcription, no commentary.',
              },
            ],
          },
        ],
      });

      if (message.stop_reason === 'refusal') {
        throw new LLMProviderError('refusal', 'The model declined to transcribe this document.');
      }

      const textBlock = message.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new LLMProviderError('invalid_response', 'Claude returned no text content.');
      }

      return {
        text: textBlock.text,
        // Real, usable text either way -- the caller decides what to do
        // with a cut-off transcript rather than losing it to a thrown error.
        truncated: message.stop_reason === 'max_tokens',
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async extract<T>(input: ExtractInput, jsonSchema: object): Promise<ExtractResult<T>> {
    if (!input.text && !input.file) {
      throw new LLMProviderError('invalid_response', 'extract() requires text or a file.');
    }

    try {
      const content: ContentBlockParam[] = [];
      if (input.file) content.push(toSourceBlock(input.file.bytes, input.file.mediaType));
      if (input.text) content.push({ type: 'text', text: input.text });

      const message = await this.client.messages.create({
        model: this.model,
        // Intake extraction (#73) repeats a verbatim quote per extracted
        // fact, so a long pasted document can produce a lot of structured
        // output; matches transcribe()'s ceiling rather than guessing low
        // and throwing on truncation (see the max_tokens stop_reason check
        // below).
        max_tokens: 16384,
        system: input.systemPrompt,
        messages: [{ role: 'user', content }],
        output_config: {
          format: { type: 'json_schema', schema: jsonSchema as Record<string, unknown> },
        },
      });

      if (message.stop_reason === 'refusal') {
        throw new LLMProviderError('refusal', 'The model declined to process this request.');
      }
      if (message.stop_reason === 'max_tokens') {
        throw new LLMProviderError('invalid_response', 'Claude response was truncated before completing.');
      }

      const textBlock = message.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new LLMProviderError('invalid_response', 'Claude returned no structured content.');
      }

      let data: T;
      try {
        data = JSON.parse(textBlock.text) as T;
      } catch {
        throw new LLMProviderError('invalid_response', 'Claude returned malformed JSON.');
      }

      return {
        data,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        stopReason: message.stop_reason ?? 'unknown',
      };
    } catch (error) {
      throw toProviderError(error);
    }
  }
}
