import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  children: ReactNode;
}

/**
 * Wraps any route that requires authentication.
 * Redirects unauthenticated users to /login while
 * preserving a loading state so there is no flash.
 */
export default function ProtectedRoute({ children }: Props) {
  const { isAuthenticated, isLoading } = useAuth();

  // Still rehydrating the session — show nothing to avoid flash
  if (isLoading) {
    return (
      <div className="auth-full-loader" aria-label="Loading…">
        <span className="auth-spinner auth-spinner--lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}
