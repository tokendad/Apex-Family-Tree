import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import styles from './SetupPage.module.css';

function getPasswordStrength(pw: string): { level: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { level: 20, label: 'Weak', color: 'var(--color-error)' };
  if (score <= 2) return { level: 40, label: 'Fair', color: 'var(--color-warning)' };
  if (score <= 3) return { level: 60, label: 'Good', color: 'var(--color-accent-500)' };
  if (score <= 4) return { level: 80, label: 'Strong', color: 'var(--color-success)' };
  return { level: 100, label: 'Very strong', color: 'var(--color-success)' };
}

export default function SetupPage() {
  const { setup, needsSetup, isAuthenticated, isLoading } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return null;
  if (!needsSetup && isAuthenticated) return <Navigate to="/" replace />;
  if (!needsSetup) return <Navigate to="/login" replace />;

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!displayName.trim() || !email.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await setup({ email: email.trim(), display_name: displayName.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.logo}>🌳</div>
        <h1 className={styles.title}>Apex Family Tree</h1>
        <p className={styles.subtitle}>Welcome! Let's create your admin account to get started.</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              autoFocus
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
            />
            {password.length > 0 && (
              <>
                <div className={styles.strengthBar}>
                  <div
                    className={styles.strengthFill}
                    style={{ width: `${strength.level}%`, backgroundColor: strength.color }}
                  />
                </div>
                <div className={styles.strengthLabel} style={{ color: strength.color }}>
                  {strength.label}
                </div>
              </>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              autoComplete="new-password"
              required
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Creating Account…' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
