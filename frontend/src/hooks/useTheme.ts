import { useContext } from 'react';
import { ThemeContext, type ThemeContextValue } from '@/contexts/themeContextValue';

/** The account's theme choice and the setter that persists it (#11). */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside a ThemeProvider');
  return value;
}
