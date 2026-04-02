import React, { useState, useEffect, useRef } from 'react';
import Button from '@/components/Button/Button';
import { Label, Input, Select, Textarea } from '@/components/Form';
import FormGroup from '@/components/Form/FormGroup';
import styles from './InviteUserModal.module.css';

interface InviteUserModalProps {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}

const InviteUserModal: React.FC<InviteUserModalProps> = ({ open, onClose, onInvited }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setEmail('');
      setRole('viewer');
      setMessage('');
      setError('');
      setSuccess('');
      setInviteToken('');
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setInviteToken('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, role, message: message || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send invite');
        return;
      }

      if (data.inviteToken) {
        setInviteToken(data.inviteToken);
        setSuccess('Invite created. Email not configured — share the token manually.');
      } else {
        setSuccess(`Invite sent to ${email}`);
      }

      onInvited();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-label="Invite User">
        <div className={styles.header}>
          <h2 className={styles.title}>Invite User</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            <FormGroup>
              <Label htmlFor="invite-email" required>Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                disabled={loading}
              />
            </FormGroup>

            <FormGroup>
              <Label htmlFor="invite-role" required>Role</Label>
              <Select
                id="invite-role"
                value={role}
                onChange={e => setRole(e.target.value)}
                disabled={loading}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="limited_editor">Limited Editor</option>
              </Select>
            </FormGroup>

            <FormGroup>
              <Label htmlFor="invite-message">Message (optional)</Label>
              <Textarea
                id="invite-message"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Add a personal message to the invite..."
                rows={3}
                disabled={loading}
              />
            </FormGroup>

            {error && <p className={styles.errorMsg}>{error}</p>}
            {success && <p className={styles.successMsg}>{success}</p>}
            {inviteToken && (
              <div className={styles.tokenBox}>
                Invite token: {inviteToken}
              </div>
            )}
          </div>

          <div className={styles.footer}>
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" loading={loading} disabled={!!success}>
              Send Invite
            </Button>
          </div>
        </form>
      </div>
    </>
  );
};

export default InviteUserModal;
