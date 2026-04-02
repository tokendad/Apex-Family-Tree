import type { StorageProvider } from './storage/StorageProvider.js';
import type { SecretProvider } from './secrets/SecretProvider.js';
import type { LoggingProvider } from './logging/LoggingProvider.js';
import { LocalStorageProvider } from './storage/LocalStorageProvider.js';
import { GCSStorageProvider } from './storage/GCSStorageProvider.js';
import { LocalSecretProvider } from './secrets/LocalSecretProvider.js';
import { GCPSecretManagerProvider } from './secrets/GCPSecretManagerProvider.js';
import { LocalLoggingProvider } from './logging/LocalLoggingProvider.js';
import { GCPLoggingProvider } from './logging/GCPLoggingProvider.js';

export function createStorageProvider(): StorageProvider {
  const backend = process.env.STORAGE_BACKEND || 'local';
  switch (backend) {
    case 'gcs':
      return new GCSStorageProvider();
    case 'local':
    default:
      return new LocalStorageProvider();
  }
}

export function createSecretProvider(): SecretProvider {
  const backend = process.env.SECRET_BACKEND || 'local';
  switch (backend) {
    case 'gcp-secret-manager':
      return new GCPSecretManagerProvider();
    case 'local':
    default:
      return new LocalSecretProvider();
  }
}

export function createLoggingProvider(): LoggingProvider {
  const backend = process.env.LOG_BACKEND || 'local';
  switch (backend) {
    case 'gcp-logging':
      return new GCPLoggingProvider();
    case 'local':
    default:
      return new LocalLoggingProvider();
  }
}
