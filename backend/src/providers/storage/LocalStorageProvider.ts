import fs from 'fs/promises';
import path from 'path';
import type { StorageProvider } from './StorageProvider.js';

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const MEDIA_ROOT = process.env.MEDIA_PATH || `${DATA_DIR}/media`;

export class LocalStorageProvider implements StorageProvider {
  async upload(filePath: string, destination: string): Promise<string> {
    const destPath = path.join(MEDIA_ROOT, destination);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(filePath, destPath);
    return destination;
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    const srcPath = path.join(MEDIA_ROOT, remotePath);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.copyFile(srcPath, localPath);
  }

  async delete(remotePath: string): Promise<void> {
    const fullPath = path.join(MEDIA_ROOT, remotePath);
    try {
      await fs.unlink(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async getSignedUrl(remotePath: string, _expiresInMinutes?: number): Promise<string> {
    // For local storage, return a relative URL path
    return `/media/${remotePath}`;
  }

  async exists(remotePath: string): Promise<boolean> {
    const fullPath = path.join(MEDIA_ROOT, remotePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
