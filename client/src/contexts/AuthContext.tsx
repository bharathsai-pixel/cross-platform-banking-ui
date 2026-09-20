/**
 * client/src/contexts/AuthContext.tsx
 *
 * All auth state lives here. login() and register() hit the real backend.
 * Session is persisted to sessionStorage (or localStorage when "remember me"
 * is checked) so it survives page refreshes and browser restarts.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  accountNumber: string;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  password: string;
  dateOfBirth?: string;
  accountNumber?: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  login: (username: string, password: string, remember?: boolean) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = "banking_session";
const REMEMBER_KEY = "banking_remember";

async function readAuthResponse(res: Response): Promise<{ user?: User; error?: string }> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as { user?: User; error?: string };
  }

  return {
    error: "The authentication service is unavailable. Please try again shortly.",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Rehydrate session on mount */
  useEffect(() => {
    try {
      const raw =
        sessionStorage.getItem(SESSION_KEY) ??
        localStorage.getItem(SESSION_KEY);
      if (raw) setUser(JSON.parse(raw) as User);
    } catch {
      /* corrupted storage – ignore */
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* ── login ──────────────────────────────────────────────────── */
  const login = useCallback(
    async (username: string, password: string, remember = false) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), password }),
        });

        const json = await readAuthResponse(res);

        if (!res.ok) {
          throw new Error(json.error ?? "Login failed. Please try again.");
        }

        const loggedInUser = json.user!;
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem(SESSION_KEY, JSON.stringify(loggedInUser));
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, username.trim().toLowerCase());
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
        setUser(loggedInUser);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Login failed.";
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /* ── register ───────────────────────────────────────────────── */
  const register = useCallback(async (input: RegisterInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const json = await readAuthResponse(res);

      if (!res.ok) {
        throw new Error(json.error ?? "Registration failed. Please try again.");
      }

      // Auto-login after successful registration
      const createdUser = json.user!;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(createdUser));
      setUser(createdUser);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed.";
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* ── logout ─────────────────────────────────────────────────── */
  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        error,
        clearError,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
