import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'editor' | 'limited_editor' | 'viewer';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsSetup: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { code?: string; token?: string; email: string; display_name: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  setup: (data: { email: string; display_name: string; password: string }) => Promise<void>;
  refreshUser: () => Promise<void>;
}

/* The access cookie lives 15 minutes (setAuthCookies in routes/auth.ts). Renew
   well inside that, so a write never lands on a token that died while the page
   sat open. Ten minutes leaves a five-minute margin for a slow or failed tick. */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/* /api/auth/refresh rotates: it deletes the old refresh_tokens row before
   issuing a new one. Two overlapping calls therefore make the loser present a
   token that no longer exists, and the server answers 401 and clears both
   cookies -- signing the user out of every tab. A ref guards against that
   within a tab; this key guards across them, since all tabs share one cookie
   jar and would otherwise all tick at once. */
const REFRESH_COOLDOWN_MS = 60 * 1000;
const LAST_REFRESH_KEY = 'aft:auth:last-refresh';

function readLastRefresh(): number {
  try {
    return Number(window.localStorage.getItem(LAST_REFRESH_KEY)) || 0;
  } catch {
    // Private mode, or site data blocked. Losing cross-tab coordination only
    // costs an extra refresh; it must not stop the session being renewed.
    return 0;
  }
}

function writeLastRefresh(at: number): void {
  try {
    window.localStorage.setItem(LAST_REFRESH_KEY, String(at));
  } catch {
    /* see readLastRefresh */
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const refreshInFlight = useRef<Promise<boolean> | null>(null);

  /**
   * Mint a fresh access cookie from the refresh cookie.
   *
   * `force` skips the cooldown, for the case where we already know the access
   * token is dead (a 401) rather than merely suspecting it may be getting old.
   */
  const renewSession = useCallback(async (options?: { force?: boolean }): Promise<boolean> => {
    if (refreshInFlight.current) return refreshInFlight.current;

    if (!options?.force && Date.now() - readLastRefresh() < REFRESH_COOLDOWN_MS) {
      // Another tab just rotated the cookie; ours is fresh by virtue of sharing it.
      return true;
    }

    const attempt = (async (): Promise<boolean> => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (!res.ok) {
          // The refresh token is spent, expired or revoked: genuinely signed out.
          setUser(null);
          return false;
        }

        const data = await res.json() as { user: User };
        writeLastRefresh(Date.now());
        setUser(data.user);
        setNeedsSetup(false);
        return true;
      } catch {
        // A dropped connection is not a sign-out. Leave the user in place and
        // let the next tick try again.
        return false;
      }
    })();

    refreshInFlight.current = attempt;
    void attempt.finally(() => {
      refreshInFlight.current = null;
    });
    return attempt;
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });

      if (res.status === 401) {
        // Access token expired — attempt silent refresh before logging out
        await renewSession({ force: true });
        return;
      }

      if (res.status === 503) {
        const data = await res.json();
        if (data.error === 'setup_required') {
          setNeedsSetup(true);
          setUser(null);
          return;
        }
      }

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setNeedsSetup(false);
      }
    } catch {
      setUser(null);
    }
  }, [renewSession]);

  useEffect(() => {
    refreshUser().finally(() => setIsLoading(false));
  }, [refreshUser]);

  const isAuthenticated = !!user;

  /* Keep the session alive for as long as the app is open.
     Previously the silent refresh above ran once, on mount, and nothing renewed
     the cookie afterwards. An idle page therefore passed 15 minutes and every
     write began failing with "Authentication required", while the UI still
     looked signed in because React was holding the user object. */
  useEffect(() => {
    if (!isAuthenticated) return;

    const tick = () => { void renewSession(); };
    const interval = window.setInterval(tick, REFRESH_INTERVAL_MS);

    /* Timers are throttled or stopped outright in a backgrounded tab, which on
       a phone is any tab you have switched away from. The interval alone would
       miss that entirely, so renew on the way back in as well. */
    const onForeground = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('focus', onForeground);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('focus', onForeground);
    };
  }, [isAuthenticated, renewSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Login failed');
    }

    const data = await res.json();
    writeLastRefresh(Date.now());
    setUser(data.user);
    setNeedsSetup(false);
  }, []);

  /* Registration signs the new account in: the endpoint sets the same cookies
     login does, so sending them to a login screen afterwards would ask them to
     type a password they chose ten seconds ago. */
  const register = useCallback(async (input: {
    code?: string; token?: string; email: string; display_name: string; password: string;
  }) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });

    const data = await res.json() as { user?: User; error?: string };
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    writeLastRefresh(Date.now());
    setUser(data.user!);
    setNeedsSetup(false);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    writeLastRefresh(0);
    setUser(null);
  }, []);

  const setup = useCallback(async (data: { email: string; display_name: string; password: string }) => {
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Setup failed');
    }

    const resData = await res.json();
    writeLastRefresh(Date.now());
    setUser(resData.user);
    setNeedsSetup(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        needsSetup,
        login,
        register,
        logout,
        setup,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
