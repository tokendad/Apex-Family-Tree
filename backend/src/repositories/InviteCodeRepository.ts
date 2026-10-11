import { BaseRepository } from './base.js';

export interface InviteCode {
  id: string;
  code: string;
  role: 'admin' | 'editor' | 'limited_editor' | 'viewer';
  note: string | null;
  max_uses: number;
  use_count: number;
  expires_at: string;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
}

/**
 * Characters that cannot be confused when read aloud or copied off a screen:
 * no O or 0, no I, l or 1. The code gets dictated over the phone.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

/** Upper case, letters and digits only. What someone types is matched by this. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** `K7M2-R9TX`: grouped for reading, though the group has no meaning. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export class InviteCodeRepository extends BaseRepository {
  create(data: {
    role: InviteCode['role'];
    note?: string | null;
    expiresInHours?: number;
    maxUses?: number;
    createdBy: string;
  }): InviteCode {
    const id = this.generateId();
    const expiresAt = new Date(Date.now() + (data.expiresInHours ?? 24) * 3600_000)
      .toISOString().replace('T', ' ').replace('Z', '');

    // Retry on the vanishingly unlikely collision rather than returning a code
    // that belongs to somebody else's invitation.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateCode();
      const existing = this.db.prepare('SELECT 1 FROM invite_codes WHERE code = ?').get(code);
      if (existing) continue;

      this.db.prepare(
        `INSERT INTO invite_codes (id, code, role, note, max_uses, use_count, expires_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      ).run(id, code, data.role, data.note?.trim() || null, data.maxUses ?? 1, expiresAt, data.createdBy, this.now());

      return this.findById(id)!;
    }

    throw new Error('Could not generate a unique invite code');
  }

  private generateCode(): string {
    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);
    // Modulo bias is negligible here: 256 % 32 === 0, so the mapping is exact.
    return Array.from(bytes).map((b) => ALPHABET[b % ALPHABET.length]).join('');
  }

  findById(id: string): InviteCode | undefined {
    return this.db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(id) as InviteCode | undefined;
  }

  /** Looks up whatever the user typed, however they typed it. */
  findByCode(input: string): InviteCode | undefined {
    const code = normalizeCode(input);
    if (!code) return undefined;
    return this.db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code) as InviteCode | undefined;
  }

  /** Codes still worth showing an admin: live, unspent, unrevoked. */
  findActive(): InviteCode[] {
    return this.db.prepare(
      `SELECT * FROM invite_codes
       WHERE revoked_at IS NULL AND use_count < max_uses AND expires_at > ?
       ORDER BY created_at DESC`,
    ).all(this.now()) as InviteCode[];
  }

  revoke(id: string): boolean {
    return this.db.prepare(
      'UPDATE invite_codes SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
    ).run(this.now(), id).changes > 0;
  }

  /**
   * Spends one use, and says whether there was one to spend.
   *
   * The conditions are in the UPDATE rather than checked beforehand so that two
   * people redeeming the last use of a code at the same moment cannot both win:
   * SQLite serialises the writes, and the second matches no row.
   */
  consume(id: string): boolean {
    return this.db.prepare(
      `UPDATE invite_codes SET use_count = use_count + 1
       WHERE id = ? AND revoked_at IS NULL AND use_count < max_uses AND expires_at > ?`,
    ).run(id, this.now()).changes > 0;
  }

  /** Why a code cannot be used, or null when it can. */
  rejectionReason(code: InviteCode | undefined): string | null {
    if (!code) return 'That invite code is not valid';
    if (code.revoked_at) return 'That invite code has been revoked';
    if (code.use_count >= code.max_uses) return 'That invite code has already been used';
    if (code.expires_at <= this.now()) return 'That invite code has expired';
    return null;
  }
}
