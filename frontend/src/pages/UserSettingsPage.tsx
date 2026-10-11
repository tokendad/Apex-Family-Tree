import { useCallback, useEffect, useState, type FormEvent } from 'react';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Button from '@/components/Button/Button';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import { useAuth } from '@/contexts/AuthContext.js';
import styles from './UserSettingsPage.module.css';

interface HomePerson {
  id: string;
  display_name?: string | null;
}

/** Mirrors validatePassword on the server (#39: 8 characters, 1 number). */
function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/\d/.test(password)) return 'Password must contain at least one number.';
  return null;
}

export default function UserSettingsPage() {
  const { user, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [emailPassword, setEmailPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [homePerson, setHomePerson] = useState<HomePerson | null>(null);
  const [homeMessage, setHomeMessage] = useState('');

  // The context may still be loading on first paint.
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name);
      setEmail(user.email);
    }
  }, [user]);

  const loadHomePerson = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/home-person', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { home_person: HomePerson | null };
      setHomePerson(data.home_person);
    } catch {
      // Not fatal; the picker simply starts empty.
    }
  }, []);

  useEffect(() => { void loadHomePerson(); }, [loadHomePerson]);

  const emailChanged = user ? email.trim() !== user.email : false;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileMessage('');
    setSavingProfile(true);

    try {
      const res = await fetch('/api/v1/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          display_name: displayName.trim(),
          email: email.trim(),
          ...(emailChanged ? { current_password: emailPassword } : {}),
        }),
      });

      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not save your details');

      setEmailPassword('');
      setProfileMessage('Saved.');
      await refreshUser();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save your details');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    const problem = passwordProblem(newPassword);
    if (problem) {
      setPasswordError(problem);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/v1/users/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });

      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not change your password');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(data.message ?? 'Password changed.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not change your password');
    } finally {
      setSavingPassword(false);
    }
  };

  const saveHomePerson = async (personId: string | null) => {
    setHomeMessage('');
    try {
      const res = await fetch('/api/v1/home-person', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ person_id: personId }),
      });
      if (!res.ok) throw new Error('Could not save your home person');

      const data = await res.json() as { home_person: HomePerson | null };
      setHomePerson(data.home_person);
      setHomeMessage(personId ? 'Saved.' : 'Cleared.');
    } catch (err) {
      setHomeMessage(err instanceof Error ? err.message : 'Could not save your home person');
    }
  };

  return (
    <AppShell navbar={<Navbar />}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Your Profile</h1>
          <p className={styles.subtitle}>
            Settings for your account only. Anything that affects the whole archive lives under Admin.
          </p>
        </header>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Your details</h2>
          <form onSubmit={(e) => void saveProfile(e)} className={styles.form}>
            <label className={styles.field}>
              <span>Display name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </label>

            <label className={styles.field}>
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>

            {/* Only asked for when it is actually needed, so the common case of
                fixing a display name does not demand a password. */}
            {emailChanged && (
              <label className={styles.field}>
                <span>Current password</span>
                <input
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="Needed to change your email"
                  required
                />
              </label>
            )}

            {profileError && <p className={styles.error}>{profileError}</p>}
            {profileMessage && <p className={styles.success}>{profileMessage}</p>}

            <Button variant="primary" disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save details'}
            </Button>
          </form>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Password</h2>
          <p className={styles.cardNote}>
            Changing your password signs you out everywhere else. At least 8 characters, including a number.
          </p>
          <form onSubmit={(e) => void changePassword(e)} className={styles.form}>
            <label className={styles.field}>
              <span>Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            <label className={styles.field}>
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <label className={styles.field}>
              <span>Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            {passwordError && <p className={styles.error}>{passwordError}</p>}
            {passwordMessage && <p className={styles.success}>{passwordMessage}</p>}

            <Button variant="primary" disabled={savingPassword}>
              {savingPassword ? 'Changing…' : 'Change password'}
            </Button>
          </form>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>You in the tree</h2>
          <p className={styles.cardNote}>
            Which person in the archive is you. Used as the starting point when the tree opens.
            Optional, and it does not have to be you — pick whoever you want to open on.
          </p>

          <PersonPicker
            label="Home person"
            value={homePerson?.id ?? null}
            onSelect={(person) => void saveHomePerson(person.id)}
            onClear={() => void saveHomePerson(null)}
          />

          {homeMessage && <p className={styles.success}>{homeMessage}</p>}
        </section>
      </div>
    </AppShell>
  );
}
