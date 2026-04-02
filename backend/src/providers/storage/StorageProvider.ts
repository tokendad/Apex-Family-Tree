export interface StorageProvider {
  upload(filePath: string, destination: string): Promise<string>;
  download(remotePath: string, localPath: string): Promise<void>;
  delete(remotePath: string): Promise<void>;
  getSignedUrl(remotePath: string, expiresInMinutes?: number): Promise<string>;
  exists(remotePath: string): Promise<boolean>;
}
