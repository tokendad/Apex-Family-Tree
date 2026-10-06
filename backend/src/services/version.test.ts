import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { APP_VERSION } from './version.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('APP_VERSION', () => {
  it('matches the version declared in backend/package.json', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8')
    ) as { version: string };

    expect(APP_VERSION).toBe(pkg.version);
  });

  it('is a real version rather than a placeholder', () => {
    // The health endpoint previously reported a hardcoded '0.1.0' in production
    // because npm_package_version is unset when the container runs node directly.
    // Guard against regressing to any such stand-in.
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(APP_VERSION).not.toBe('0.1.0');
    expect(APP_VERSION).not.toBe('0.0.0');
    expect(APP_VERSION).not.toBe('unknown');
  });
});
