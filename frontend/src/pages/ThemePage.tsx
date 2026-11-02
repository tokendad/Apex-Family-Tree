import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import { useTheme } from '@/hooks/useTheme';
import { THEME_CHOICES, THEME_LABELS, type ThemeChoice } from '@/utils/theme';
import styles from './UserSettingsPage.module.css';
import themeStyles from './ThemePage.module.css';

/**
 * Night mode, chosen per account (#11).
 *
 * The choice is written to user_settings, not to this browser, so it follows
 * the person to their phone. The device cache behind it exists only to apply
 * the theme before the first paint — see utils/theme.ts.
 */
export default function ThemePage() {
  const { choice, resolved, isLoading, setChoice, error } = useTheme();

  return (
    <AppShell navbar={<Navbar />}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Theme</h1>
          <p className={styles.subtitle}>
            How the archive looks. This applies to your account rather than the whole instance, so
            everyone else keeps their own choice.
          </p>
        </header>

        <section className={styles.card} aria-labelledby="theme-choice-heading">
          <h2 className={styles.cardTitle} id="theme-choice-heading">Appearance</h2>

          <div className={themeStyles.choices} role="radiogroup" aria-label="Theme">
            {THEME_CHOICES.map((option: ThemeChoice) => {
              const { label, description } = THEME_LABELS[option];
              const isSelected = choice === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isLoading}
                  className={`${themeStyles.choice} ${isSelected ? themeStyles.choiceSelected : ''}`}
                  onClick={() => { void setChoice(option); }}
                >
                  <span className={themeStyles.swatch} data-variant={option} aria-hidden="true" />
                  <span className={themeStyles.choiceText}>
                    <strong>{label}</strong>
                    <span>{description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className={styles.cardNote}>
            {choice === 'system'
              ? `Matching this device, which is currently ${resolved === 'dark' ? 'dark' : 'light'}.`
              : `Set to ${THEME_LABELS[choice].label.toLowerCase()} on every device you sign in on.`}
          </p>

          {error && <p className={styles.error} role="alert">{error}</p>}
        </section>
      </div>
    </AppShell>
  );
}
