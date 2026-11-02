import { createContext } from 'react';
import type { ResolvedTheme, ThemeChoice } from '@/utils/theme';

/** The context object lives apart from the provider component so the module
    exporting the component exports nothing else — otherwise fast refresh
    stops working for it. */
export interface ThemeContextValue {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  /** True until the account's setting has been read (or has failed to read). */
  isLoading: boolean;
  /** Persists to the account and applies immediately. */
  setChoice: (choice: ThemeChoice) => Promise<void>;
  error: string | null;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
