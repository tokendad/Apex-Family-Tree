import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Applied migrations are immutable, and this is what stops someone forgetting.
 *
 * runMigrations records a sha256 of every migration it applies and refuses to
 * start when a file no longer matches: "Applied migrations must not be
 * modified." That check is correct and it fires at the worst possible moment --
 * on boot, in whatever environment pulled the change, after the image is built
 * and shipped.
 *
 * It has already happened once. Generalising a comment in 163 changed a file
 * that every existing database had applied, which meant production would have
 * crashed on startup the moment it pulled the image. Nothing in the repository
 * noticed, because nothing in the repository knows what a database somewhere
 * else has already run.
 *
 * So the checksums are committed instead, and this test compares them. Editing
 * an existing migration now fails here, loudly, before it can reach anybody's
 * boot. Adding a migration means adding its line to the manifest, which is a
 * deliberate act rather than an accident.
 *
 * Regenerate with:
 *   cd backend/src/migrations && for f in *.sql; do \
 *     printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$f"; done | sort -k2 > CHECKSUMS.txt
 */
const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const manifestPath = path.join(migrationsDir, 'CHECKSUMS.txt');

function readManifest(): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of fs.readFileSync(manifestPath, 'utf8').split('\n')) {
    const match = /^([0-9a-f]{64})\s+(.+\.sql)$/.exec(line.trim());
    if (match) entries.set(match[2], match[1]);
  }
  return entries;
}

function checksumOf(file: string): string {
  // The same hash over the same bytes runMigrations reads.
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(migrationsDir, file), 'utf8')).digest('hex');
}

describe('migration checksums', () => {
  const manifest = readManifest();
  const onDisk = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  it('has a manifest entry for every migration file', () => {
    const missing = onDisk.filter(f => !manifest.has(f));
    expect(missing, `New migration(s) with no CHECKSUMS.txt entry: ${missing.join(', ')}. Regenerate the manifest.`)
      .toEqual([]);
  });

  it('has no manifest entry for a migration that no longer exists', () => {
    const stale = [...manifest.keys()].filter(f => !onDisk.includes(f));
    expect(stale, `CHECKSUMS.txt lists file(s) that are gone: ${stale.join(', ')}.`).toEqual([]);
  });

  it('finds every migration unchanged since it was recorded', () => {
    const changed = onDisk.filter(f => manifest.has(f) && manifest.get(f) !== checksumOf(f));
    expect(
      changed,
      `These migrations were modified: ${changed.join(', ')}.\n`
      + 'An applied migration cannot be edited -- not even its comments. Every database that\n'
      + 'has already run it stored a checksum of the original bytes, and runMigrations will\n'
      + 'refuse to start against a changed file. Revert the edit and put the change in a new\n'
      + 'migration. If the file genuinely has never been applied anywhere, regenerate\n'
      + 'CHECKSUMS.txt deliberately.',
    ).toEqual([]);
  });
});
