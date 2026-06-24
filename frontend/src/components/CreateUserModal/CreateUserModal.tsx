import React, { useState, useEffect, useRef } from 'react';
import Button from '@/components/Button/Button';
import { Label, Input, Select } from '@/components/Form';
import FormGroup from '@/components/Form/FormGroup';
import styles from './CreateUserModal.module.css';

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({ open, onClose, onCreated }) => {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('viewer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setEmail('');
      setDisplayName('');
      setPassword('');
      setConfirmPassword('');
      setRole('viewer');
      setError('');
      setSuccess('');
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

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, display_name: displayName, password, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create user');
        return;
      }

      setSuccess(`Account created for ${email}`);
      onCreated();
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
      <div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-label="Create User">
        <div className={styles.header}>
          <h2 className={styles.title}>Create User</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            <FormGroup>
              <Label htmlFor="create-name" required>Display Name</Label>
              <Input
                id="create-name"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Jane Smith"
                required
                disabled={loading || !!success}
              />
            </FormGroup>

            <FormGroup>
              <Label htmlFor="create-email" required>Email</Label>
              <Input
                id="create-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                disabled={loading || !!success}
              />
            </FormGroup>

            <FormGroup>
              <Label htmlFor="create-role" required>Role</Label>
              <Select
                id="create-role"
                value={role}
                onChange={e => setRole(e.target.value)}
                disabled={loading || !!success}
              >
                <option value="viewer">Viewer</option>
                <option value="limited_editor">Limited Editor</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </Select>
            </FormGroup>

            <FormGroup>
              <Label htmlFor="create-password" required>Password</Label>
              <Input
                id="create-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                disabled={loading || !!success}
              />
            </FormGroup>

            <FormGroup>
              <Label htmlFor="create-confirm" required>Confirm Password</Label>
              <Input
                id="create-confirm"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required
                disabled={loading || !!success}
              />
            </FormGroup>

            {error && <p className={styles.errorMsg}>{error}</p>}
            {success && <p className={styles.successMsg}>{success}</p>}
          </div>

          <div className={styles.footer}>
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={loading}>
              {success ? 'Close' : 'Cancel'}
            </Button>
            {!success && (
              <Button variant="primary" size="sm" type="submit" loading={loading}>
                Create Account
              </Button>
            )}
          </div>
        </form>
      </div>
    </>
  );
};

export default CreateUserModal;
