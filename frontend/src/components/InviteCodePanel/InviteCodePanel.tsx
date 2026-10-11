import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/Button/Button';
import styles from './InviteCodePanel.module.css';

interface InviteCode {
  id: string;
  code: string;
  role: string;
  note: string | null;
  uses_left: number;
  max_uses: number;
  expires_at: string;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  limited_editor: 'Limited Editor',
  viewer: 'Viewer',
};

const EXPIRY_CHOICES = [
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
];

function formatExpiry(value: string): string {
  const expires = new Date(value.replace(' ', 'T') + 'Z');
  const hoursLeft = (expires.getTime() - Date.now()) / 3_600_000;

  if (hoursLeft < 1) return 'expires within the hour';
  if (hoursLeft < 24) return `expires in ${Math.round(hoursLeft)} hours`;
  return `expires ${expires.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export default function InviteCodePanel() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [role, setRole] = useState('editor');
  const [note, setNote] = useState('');
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [maxUses, setMaxUses] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  /** The code generated in this session, highlighted so it is not lost in the list. */
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/invite-codes', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load invite codes');
      const data = await res.json() as { invite_codes: InviteCode[] };
      setCodes(data.invite_codes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load invite codes');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch('/api/v1/admin/invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, note: note.trim() || null, expires_in_hours: expiresInHours, max_uses: maxUses }),
      });
      const data = await res.json() as { invite_code?: InviteCode; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not create the code');

      setJustCreated(data.invite_code!.code);
      setCopied(false);
      setNote('');
      setIsOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the code');
    } finally {
      setIsSaving(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/admin/invite-codes/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Could not revoke the code');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke the code');
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard access is refused in some contexts; the code is on screen anyway.
      setError('Could not copy automatically — the code is shown above.');
    }
  };

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Invite Codes</h2>
          <p className={styles.subtitle}>
            Give someone a code and they can create their own account. One use, 24 hours, unless you say otherwise.
          </p>
        </div>
        {/* Dismissing the form is not the main action, and styling it like one
            puts the heaviest button on the screen next to the thing it undoes. */}
        <Button
          variant={isOpen ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? 'Cancel' : 'Generate code'}
        </Button>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {isOpen && (
        <div className={styles.form}>
          <label className={styles.field}>
            <span>Who is it for?</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Rachel's cousin"
            />
          </label>

          <label className={styles.field}>
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Good for</span>
            <select value={expiresInHours} onChange={(e) => setExpiresInHours(Number(e.target.value))}>
              {EXPIRY_CHOICES.map((choice) => (
                <option key={choice.hours} value={choice.hours}>{choice.label}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Number of people</span>
            <input
              type="number"
              min={1}
              max={50}
              value={maxUses}
              onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>

          <Button variant="primary" onClick={() => void generate()} disabled={isSaving}>
            {isSaving ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      )}

      {justCreated && (
        <div className={styles.fresh}>
          <p className={styles.freshLabel}>New code — pass this on:</p>
          <div className={styles.freshRow}>
            <code className={styles.freshCode}>{justCreated}</code>
            <Button variant="secondary" size="sm" onClick={() => void copy(justCreated)}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {codes.length === 0 ? (
        <p className={styles.empty}>No codes are waiting to be used.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr><th>Code</th><th>For</th><th>Role</th><th>Uses</th><th>Expires</th><th /></tr>
          </thead>
          <tbody>
            {codes.map((entry) => (
              <tr key={entry.id} className={entry.code === justCreated ? styles.isFresh : undefined}>
                <td><code className={styles.code}>{entry.code}</code></td>
                <td>{entry.note ?? '—'}</td>
                <td>{ROLE_LABELS[entry.role] ?? entry.role}</td>
                <td>{entry.uses_left} of {entry.max_uses}</td>
                <td className={styles.expiry}>{formatExpiry(entry.expires_at)}</td>
                <td>
                  <Button variant="ghost" size="sm" onClick={() => void revoke(entry.id)}>Revoke</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
