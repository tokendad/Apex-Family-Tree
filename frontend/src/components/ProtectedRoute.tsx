import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import type { ReactNode } from 'react';

type Role = 'admin' | 'editor' | 'limited_editor' | 'viewer';

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  limited_editor: 1,
  editor: 2,
  admin: 3,
};

interface ProtectedRouteProps {
  children: ReactNode;
  /** If set, user must have at least this role level or be redirected. */
  minimumRole?: Role;
}

export function ProtectedRoute({ children, minimumRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, needsSetup, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading…</p>
      </div>
    );
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (minimumRole && user) {
    const userRank = ROLE_RANK[user.role as Role] ?? 0;
    const requiredRank = ROLE_RANK[minimumRole];
    if (userRank < requiredRank) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
