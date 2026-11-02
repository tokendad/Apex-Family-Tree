import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeContext } from './themeContextValue';
import {
  THEME_SETTING_KEY,
  applyTheme,
  isThemeChoice,
  readCachedChoice,
  watchSystemTheme,
  writeCachedChoice,
  type ResolvedTheme,
  type ThemeChoice,
} from '@/utils/theme';

/**
 * Holds the account's theme choice and keeps <html data-theme> in step (#11).
 *
 * Order of events on load: the pre-paint script in index.html has already
 * applied whatever this device last cached, so nothing flashes. This provider
 * then asks the server for the account's setting and applies that, which is
 * what makes the choice follow the person to another device rather than
 * staying with the browser.
 *
 * A failed read leaves the cached theme in place. Not knowing the preference
 * is not a reason to throw the page away.
 */

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readCachedChoice() ?? 'system');
  const [resolved, setResolved] = useState<ResolvedTheme>(() => applyTheme(readCachedChoice() ?? 'system'));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The account's setting, which outranks the device cache.
  useEffect(() => {
    const controller = new AbortController();

    void fetch('/api/v1/users/me/settings', { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() as Promise<{ settings?: Record<string, unknown> }> : null))
      .then((json) => {
        const stored = json?.settings?.[THEME_SETTING_KEY];
        if (isThemeChoice(stored)) {
          setChoiceState(stored);
          writeCachedChoice(stored);
          setResolved(applyTheme(stored));
        }
      })
      .catch(() => { /* signed out, offline, or aborted: the cache stands */ })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, []);

  // While the choice is "match this device", follow the device.
  useEffect(() => watchSystemTheme(choice, () => setResolved(applyTheme(choice))), [choice]);

  const setChoice = useCallback(async (next: ThemeChoice) => {
    // Applied first: the switch should feel immediate, and a failed save is
    // reported rather than undone -- the person can see what they asked for.
    setChoiceState(next);
    setResolved(applyTheme(next));
    writeCachedChoice(next);
    setError(null);

    try {
      const res = await fetch('/api/v1/users/me/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [THEME_SETTING_KEY]: next }),
      });
      if (!res.ok) throw new Error('Could not save the theme to your account');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the theme to your account');
    }
  }, []);

  const value = useMemo(
    () => ({ choice, resolved, isLoading, setChoice, error }),
    [choice, resolved, isLoading, setChoice, error],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
