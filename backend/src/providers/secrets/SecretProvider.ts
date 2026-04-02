export interface SecretProvider {
  getSecret(name: string): Promise<string | null>;
  setSecret(name: string, value: string): Promise<void>;
}
