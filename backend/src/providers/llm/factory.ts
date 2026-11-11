import { SettingsRepository } from '../../repositories/SettingsRepository.js';
import { LocalSecretProvider } from '../secrets/LocalSecretProvider.js';
import { ClaudeProvider } from './ClaudeProvider.js';
import { LLMProviderError, type LLMProvider } from './LLMProvider.js';

/**
 * Reads llm_provider/llm_model from app_settings and the key through
 * LocalSecretProvider (never SettingsRepository.getSettingValue() -- that
 * does not decrypt despite the column name). Throws LLMProviderError('auth')
 * if no key is configured, so a route can turn that into a clean 4xx rather
 * than a provider crashing on an empty string.
 */
export async function createLLMProvider(): Promise<LLMProvider> {
  const settings = new SettingsRepository();
  const providerId = settings.getSettingValue('llm_provider') || 'anthropic';
  const model = settings.getSettingValue('llm_model') || 'claude-opus-5-5';

  const apiKey = await new LocalSecretProvider().getSecret('llm_api_key');
  if (!apiKey) {
    throw new LLMProviderError('auth', 'No LLM API key is configured. Set one in Admin Settings.');
  }

  switch (providerId) {
    case 'anthropic':
      return new ClaudeProvider(apiKey, model);
    default:
      throw new LLMProviderError('provider', `Unknown LLM provider: ${providerId}`);
  }
}
