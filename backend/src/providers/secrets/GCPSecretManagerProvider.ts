import type { SecretProvider } from './SecretProvider.js';

/**
 * Google Cloud Secret Manager provider.
 *
 * Requires the `@google-cloud/secret-manager` package to be installed:
 *   npm install @google-cloud/secret-manager
 *
 * Enable by setting SECRET_BACKEND=gcp-secret-manager and GCP_PROJECT_ID in your environment.
 */
export class GCPSecretManagerProvider implements SecretProvider {
  private projectId: string;

  constructor() {
    const projectId = process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP_PROJECT_ID environment variable is required when using GCP Secret Manager');
    }
    this.projectId = projectId;
  }

  private getClient(): never {
    throw new Error(
      'Google Cloud Secret Manager SDK is not installed. Install it with: npm install @google-cloud/secret-manager'
    );
  }

  async getSecret(name: string): Promise<string | null> {
    void name;
    void this.projectId;
    this.getClient();
    return null;
  }

  async setSecret(name: string, value: string): Promise<void> {
    void name;
    void value;
    this.getClient();
  }
}
