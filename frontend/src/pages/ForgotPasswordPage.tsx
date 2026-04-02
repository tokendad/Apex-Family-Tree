import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import styles from './LoginPage.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setSubmitting(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <div className={styles.logo}>📧</div>
          <h1 className={styles.title}>Check Your Email</h1>
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            If an account with that email exists, a password reset link has been sent.
          </p>
          <div className={styles.footer}>
            <Link to="/login">Back to login</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.logo}>🔑</div>
        <h1 className={styles.title}>Reset Password</h1>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              required
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>

        <div className={styles.footer}>
          <Link to="/login">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
