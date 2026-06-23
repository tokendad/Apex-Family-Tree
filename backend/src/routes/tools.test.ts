import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'http';

type TestRole = 'admin' | 'editor' | 'limited_editor' | 'viewer';

vi.mock('../services/tools/personDedup.js', () => ({
  scanPeopleDuplicates: vi.fn(() => ({ groups: [] })),
  previewPeopleMerge: vi.fn((input) => ({
    groupId: input.groupId,
    canonicalPersonId: input.canonicalPersonId,
    duplicatePersonIds: input.duplicatePersonIds,
    conflicts: [],
    transferCounts: {
      names: 0,
      events: 0,
      families: 0,
      sourceCitations: 0,
      mediaLinks: 0,
      mediaRegions: 0,
      userHomePeople: 0,
      exportScopes: 0,
    },
  })),
  applyPeopleMerge: vi.fn((input) => ({
    groupId: input.groupId,
    canonicalPersonId: input.canonicalPersonId,
    duplicatePersonIds: input.duplicatePersonIds,
    conflicts: [],
    transferCounts: {
      names: 0,
      events: 0,
      families: 0,
      sourceCitations: 0,
      mediaLinks: 0,
      mediaRegions: 0,
      userHomePeople: 0,
      exportScopes: 0,
    },
    mergedPersonIds: input.duplicatePersonIds,
  })),
}));

const { toolsRouter } = await import('./tools.js');

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.header('x-test-role');
    if (role) {
      req.user = { userId: 'user-1', email: 'user@example.test', role: role as TestRole };
    }
    next();
  });
  app.use('/api/v1/tools', toolsRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

describe('tools routes', () => {
  it('allows editors to scan for people duplicates', async () => {
    const response = await fetch(`${baseUrl}/api/v1/tools/people-dedup/scan`, {
      headers: { 'x-test-role': 'editor' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ groups: [] });
  });

  it('rejects viewers from people de-duplication routes', async () => {
    const response = await fetch(`${baseUrl}/api/v1/tools/people-dedup/scan`, {
      headers: { 'x-test-role': 'viewer' },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Insufficient permissions' });
  });

  it('returns a structured 400 for invalid merge input', async () => {
    const response = await fetch(`${baseUrl}/api/v1/tools/people-dedup/preview`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-role': 'admin',
      },
      body: JSON.stringify({ groupId: 'bad' }),
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error?: string };
    expect(body.error).toContain('canonicalPersonId');
  });
});
