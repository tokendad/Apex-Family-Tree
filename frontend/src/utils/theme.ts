/**
 * Night mode (#11).
 *
 * The choice is per account, not per device: it is stored in `user_settings`
 * under the key below, so signing in on a phone brings the same theme as the
 * desktop. The browser's own `localStorage` is used only as a cache, for one
 * job — applying the theme before the first paint, which is earlier than any
 * request to the server can answer. The server stays the source of truth and
 * overwrites the cache as soon as settings load.
 *
 * `system` is resolved here rather than in CSS. Keeping one `[data-theme]`
 * selector in tokens.css means the dark palette is written once; the cost is
 * that this module has to watch `prefers-color-scheme` and re-apply when the
 * device flips, which it does.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** The user_settings key. Also written by the pre-paint script in index.html. */
export const THEME_SETTING_KEY = 'theme';

/** The localStorage key holding the last known choice for this device. */
export const THEME_CACHE_KEY = 'aft.theme';

export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

function darkMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia('(prefers-color-scheme: dark)');
}

/** What `choice` means on this device right now. */
export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'light' || choice === 'dark') return choice;
  return darkMediaQuery()?.matches ? 'dark' : 'light';
}

/** Put the resolved theme on <html>, which is what the CSS keys off. */
export function applyTheme(choice: ThemeChoice): ResolvedTheme {
  const resolved = resolveTheme(choice);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
  }
  return resolved;
}

/** Storage can throw in a private window or with site data blocked, and a
    theme is never worth failing a page load over. */
export function readCachedChoice(): ThemeChoice | null {
  try {
    const value = window.localStorage.getItem(THEME_CACHE_KEY);
    return isThemeChoice(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeCachedChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_CACHE_KEY, choice);
  } catch {
    /* no cache; the setting still lives on the server */
  }
}

/**
 * Follow the device while the choice is `system`.
 *
 * Returns an unsubscribe function. Does nothing for an explicit choice, so a
 * caller can subscribe unconditionally.
 */
export function watchSystemTheme(choice: ThemeChoice, onChange: (theme: ResolvedTheme) => void): () => void {
  if (choice !== 'system') return () => {};
  const query = darkMediaQuery();
  if (!query) return () => {};

  const listener = (event: MediaQueryListEvent) => onChange(event.matches ? 'dark' : 'light');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

export const THEME_LABELS: Record<ThemeChoice, { label: string; description: string }> = {
  system: {
    label: 'Match this device',
    description: 'Follow the light or dark setting of whatever you are reading on.',
  },
  light: {
    label: 'Light',
    description: 'The archive as it has always looked.',
  },
  dark: {
    label: 'Night',
    description: 'Dark surfaces, for reading in a dim room.',
  },
};
