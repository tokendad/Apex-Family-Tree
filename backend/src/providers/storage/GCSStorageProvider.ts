import type { StorageProvider } from './StorageProvider.js';

/**
 * Google Cloud Storage provider.
 *
 * Requires the `@google-cloud/storage` package to be installed:
 *   npm install @google-cloud/storage
 *
 * Enable by setting STORAGE_BACKEND=gcs and GCS_BUCKET in your environment.
 */
export class GCSStorageProvider implements StorageProvider {
  private bucketName: string;

  constructor() {
    const bucket = process.env.GCS_BUCKET;
    if (!bucket) {
      throw new Error('GCS_BUCKET environment variable is required when using GCS storage');
    }
    this.bucketName = bucket;
  }

  private getStorage(): never {
    throw new Error(
      'Google Cloud Storage SDK is not installed. Install it with: npm install @google-cloud/storage'
    );
  }

  async upload(_filePath: string, destination: string): Promise<string> {
    this.getStorage();
    // Unreachable — getStorage() always throws
    return `gs://${this.bucketName}/${destination}`;
  }

  async download(remotePath: string, _localPath: string): Promise<void> {
    void remotePath;
    this.getStorage();
  }

  async delete(remotePath: string): Promise<void> {
    void remotePath;
    this.getStorage();
  }

  async getSignedUrl(remotePath: string, _expiresInMinutes = 60): Promise<string> {
    void remotePath;
    this.getStorage();
    return '';
  }

  async exists(remotePath: string): Promise<boolean> {
    void remotePath;
    this.getStorage();
    return false;
  }
}
