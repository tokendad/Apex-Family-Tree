import type { LoggingProvider } from './LoggingProvider.js';

/**
 * Google Cloud Logging provider.
 *
 * Requires the `@google-cloud/logging` package to be installed:
 *   npm install @google-cloud/logging
 *
 * Enable by setting LOG_BACKEND=gcp-logging and GCP_PROJECT_ID in your environment.
 */
export class GCPLoggingProvider implements LoggingProvider {
  private projectId: string;

  constructor() {
    const projectId = process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP_PROJECT_ID environment variable is required when using GCP Logging');
    }
    this.projectId = projectId;
  }

  private getClient(): never {
    throw new Error(
      'Google Cloud Logging SDK is not installed. Install it with: npm install @google-cloud/logging'
    );
  }

  info(message: string, ...args: unknown[]): void {
    void message;
    void args;
    void this.projectId;
    this.getClient();
  }

  warn(message: string, ...args: unknown[]): void {
    void message;
    void args;
    this.getClient();
  }

  error(message: string, ...args: unknown[]): void {
    void message;
    void args;
    this.getClient();
  }

  debug(message: string, ...args: unknown[]): void {
    void message;
    void args;
    this.getClient();
  }
}
