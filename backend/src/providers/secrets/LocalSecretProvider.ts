import { SettingsRepository } from '../../repositories/SettingsRepository.js';
import { encrypt, decrypt } from '../../services/encryption.js';
import type { SecretProvider } from './SecretProvider.js';

export class LocalSecretProvider implements SecretProvider {
  private settings: SettingsRepository;

  constructor() {
    this.settings = new SettingsRepository();
  }

  async getSecret(name: string): Promise<string | null> {
    const setting = this.settings.getSetting(name);
    if (!setting || setting.value === null) return null;

    if (setting.value_type === 'encrypted') {
      return decrypt(setting.value);
    }

    return setting.value;
  }

  async setSecret(name: string, value: string): Promise<void> {
    const encrypted = encrypt(value);
    this.settings.setSetting(name, encrypted, 'encrypted');
  }
}
