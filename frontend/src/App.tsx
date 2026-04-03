import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { AdminRoute } from './components/AdminRoute.js';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner/OfflineBanner';

// Lazy-loaded page components
const TreePage = React.lazy(() => import('./pages/TreePage'));
const PeoplePage = React.lazy(() => import('./pages/PeoplePage'));
const AdminUsersPage = React.lazy(() => import('./pages/AdminUsersPage'));
const AdminSettingsPage = React.lazy(() => import('./pages/AdminSettingsPage'));
const AdminPage = React.lazy(() => import('./pages/AdminPage'));
const FamiliesPage = React.lazy(() => import('./pages/FamiliesPage'));
const FamilyDetailPage = React.lazy(() => import('./pages/FamilyDetailPage'));
const PersonDetailPage = React.lazy(() => import('./pages/PersonDetailPage'));
const SourcesPage = React.lazy(() => import('./pages/SourcesPage'));
const ImportPage = React.lazy(() => import('./pages/ImportPage'));
const ExportPage = React.lazy(() => import('./pages/ExportPage'));
const SetupPage = React.lazy(() => import('./pages/SetupPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = React.lazy(() => import('./pages/ResetPasswordPage'));
const MediaPage = React.lazy(() => import('./pages/MediaPage'));

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <span>Loading…</span>
    </div>
  );
}

function ComingSoonPage({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem' }}>
      <span style={{ fontSize: '3rem' }}>🚧</span>
      <h1 style={{ margin: 0 }}>{title}</h1>
      <p style={{ color: 'var(--color-text-secondary)' }}>This feature is coming soon.</p>
      <button
        onClick={() => navigate(-1)}
        style={{ padding: '0.5rem 1.5rem', background: 'var(--color-primary-600)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'var(--font-family)' }}
      >
        Go Back
      </button>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <OfflineBanner />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Auth routes (public) */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/register/:token" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Main app routes (protected) */}
              <Route path="/" element={<ProtectedRoute><TreePage /></ProtectedRoute>} />
              <Route path="/tree" element={<Navigate to="/" replace />} />
              <Route path="/people" element={<ProtectedRoute><PeoplePage /></ProtectedRoute>} />
              <Route path="/people/:id" element={<ProtectedRoute><PersonDetailPage /></ProtectedRoute>} />
              <Route path="/families" element={<ProtectedRoute><FamiliesPage /></ProtectedRoute>} />
              <Route path="/families/:id" element={<ProtectedRoute><FamilyDetailPage /></ProtectedRoute>} />
              <Route path="/sources" element={<ProtectedRoute><SourcesPage /></ProtectedRoute>} />
              <Route path="/media" element={<ProtectedRoute><MediaPage /></ProtectedRoute>} />

              {/* Import/Export (protected) */}
              <Route path="/import" element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />
              <Route path="/export" element={<ProtectedRoute><ExportPage /></ProtectedRoute>} />

              {/* Admin routes (protected, admin only) */}
              <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
              <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
              <Route path="/admin/settings" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />

              {/* Catch-all */}
              <Route path="*" element={<ComingSoonPage title="404 — Page Not Found" />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
