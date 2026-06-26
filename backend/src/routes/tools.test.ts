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

vi.mock('../services/tools/treeIssues.js', () => ({
  getTreeIssueSummary: vi.fn(() => ({
    open: 1,
    bySeverity: { high: 1, medium: 0, low: 0 },
    byType: { multiple_active_marriages: 1 },
    lastScanAt: '2026-06-25 17:00:00.000',
  })),
  listTreeIssues: vi.fn(() => ({
    data: [
      {
        id: 'issue-1',
        type: 'multiple_active_marriages',
        severity: 'high',
        status: 'open',
        title: 'John Doe has 2 active marriages',
        summary: 'This person appears in more than one active family.',
        primary_entity_type: 'person',
        primary_entity_id: 'p1',
        related_entities_json: '[]',
        fingerprint: 'multiple-active-marriages:p1',
        detected_at: '2026-06-25 17:00:00.000',
        last_seen_at: '2026-06-25 17:00:00.000',
        resolved_at: null,
        dismissed_at: null,
        note: null,
      },
    ],
    next_cursor: null,
  })),
  scanTreeIssues: vi.fn(() => ({
    detected: 1,
    created: 1,
    updated: 0,
    reopened: 0,
    dismissed: 0,
    open: 1,
  })),
  updateTreeIssue: vi.fn((id, input) => ({ id, status: input.status ?? 'open', note: input.note ?? null })),
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

  it('allows viewers to read tree issue summaries', async () => {
    const response = await fetch(`${baseUrl}/api/v1/tools/tree-issues/summary`, {
      headers: { 'x-test-role': 'viewer' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ open: 1 });
  });

  it('allows viewers to list tree issues', async () => {
    const response = await fetch(`${baseUrl}/api/v1/tools/tree-issues`, {
      headers: { 'x-test-role': 'viewer' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [{ id: 'issue-1', type: 'multiple_active_marriages' }],
      next_cursor: null,
    });
  });

  it('rejects viewers from scanning tree issues', async () => {
    const response = await fetch(`${baseUrl}/api/v1/tools/tree-issues/scan`, {
      method: 'POST',
      headers: { 'x-test-role': 'viewer' },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Insufficient permissions' });
  });

  it('allows editors to scan tree issues', async () => {
    const response = await fetch(`${baseUrl}/api/v1/tools/tree-issues/scan`, {
      method: 'POST',
      headers: { 'x-test-role': 'editor' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ detected: 1, open: 1 });
  });

  it('requires a note when dismissing a tree issue', async () => {
    const response = await fetch(`${baseUrl}/api/v1/tools/tree-issues/issue-1`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-role': 'editor',
      },
      body: JSON.stringify({ status: 'dismissed' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Dismissed tree issues require a note' });
  });
});
