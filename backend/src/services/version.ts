import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves the running application version.
 *
 * `package.json` is the authoritative source because it is correct in every
 * context: CI bumps it before building, local builds reflect the checked-out
 * tree, and it ships inside the image. The env fallbacks exist only for the
 * cases where that file cannot be read.
 *
 * `npm_package_version` alone is not enough — the container runs
 * `node backend/dist/index.js` directly, so npm never sets it, which is why the
 * health endpoint previously reported a hardcoded placeholder in production.
 *
 * Both `src/services/` and `dist/services/` sit two levels below
 * `backend/package.json`, so this path resolves in dev and in the image alike.
 */
function resolveVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // Fall through to the environment below.
  }

  // APP_VERSION is set from the Docker build arg; npm_package_version is set
  // when started through an npm script.
  return process.env.APP_VERSION || process.env.npm_package_version || 'unknown';
}

/** Resolved once at startup — the version cannot change while the process runs. */
export const APP_VERSION = resolveVersion();
