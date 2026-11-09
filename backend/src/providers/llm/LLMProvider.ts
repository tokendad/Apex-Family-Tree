/**
 * The app's only LLM-facing interface. Two call shapes, not a generic
 * "send a prompt, get text back": transcribe() is OCR (issue #75, no
 * structured output needed), extract() is schema-constrained fact
 * extraction (issue #73's intake pipeline). Keeping them separate means a
 * provider that can't do one doesn't have to fake it with prompting.
 */
export interface TranscribeInput {
  bytes: Buffer;
  mediaType: string;
}

export interface TranscribeResult {
  text: string;
  /** True when the model hit the output length limit before finishing --
   *  the text is real but cut off mid-document, not a failure to hide. */
  truncated: boolean;
  inputTokens: number;
  outputTokens: number;
}

export interface ExtractInput {
  text?: string;
  file?: { bytes: Buffer; mediaType: string };
  systemPrompt: string;
}

export interface ExtractResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}

/** Normalized across providers so a caller can react to *why* a call failed
 *  without knowing which SDK threw it. */
export type LLMProviderErrorKind = 'auth' | 'rate_limit' | 'timeout' | 'invalid_response' | 'refusal' | 'provider';

export class LLMProviderError extends Error {
  constructor(public kind: LLMProviderErrorKind, message: string) {
    super(message);
    this.name = 'LLMProviderError';
  }
}

export interface LLMProvider {
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
  extract<T>(input: ExtractInput, jsonSchema: object): Promise<ExtractResult<T>>;
}
