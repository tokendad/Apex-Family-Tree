import { useState, type FormEvent } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import styles from './RegisterPage.module.css';

/** #39: eight characters, one number. Mirrors validatePassword on the server. */
function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/\d/.test(password)) return 'Password must contain at least one number.';
  return null;
}

export default function RegisterPage() {
  /* Two ways in. An emailed invitation carries its token in the URL and is
     bound to one address; a code is typed in by someone who was given it. */
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, register } = useAuth();
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!displayName.trim() || !email.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    if (!token && !code.trim()) {
      setError('An invite code is required.');
      return;
    }

    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        token,
        code: token ? undefined : code.trim(),
        email: email.trim(),
        display_name: displayName.trim(),
        password,
      });

      // Already signed in by the time this resolves; #39 opens on the profile.
      navigate('/profile/settings', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.logo}>🌳</div>
        <h1 className={styles.title}>Join Apex Family Tree</h1>
        <p className={styles.subtitle}>
          {token
            ? 'Create your account to accept your invitation.'
            : 'Enter the invite code you were given to create your account.'}
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {!token && (
            <div className={styles.field}>
              <label htmlFor="code">Invite Code</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABCD-1234"
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus
                required
              />
            </div>
          )}
          <div className={styles.field}>
            <label htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              autoFocus={Boolean(token)}
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
              placeholder="you@example.com"
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
              placeholder="At least 8 characters, including a number"
              minLength={8}
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              required
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Creating Account…' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
