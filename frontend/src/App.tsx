import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
const ImportPage = React.lazy(() => import('./pages/ImportPage'));
const ExportPage = React.lazy(() => import('./pages/ExportPage'));

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <span>Loading…</span>
    </div>
  );
}

// Placeholder page component
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>{title}</h1>
      <p>This page will be implemented in a future phase.</p>
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
              <Route path="/login" element={<PlaceholderPage title="Login" />} />
              <Route path="/setup" element={<PlaceholderPage title="Admin Setup" />} />
              <Route path="/register/:token" element={<PlaceholderPage title="Register" />} />
              <Route path="/forgot-password" element={<PlaceholderPage title="Forgot Password" />} />
              <Route path="/reset-password" element={<PlaceholderPage title="Reset Password" />} />

              {/* Main app routes (protected) */}
              <Route path="/" element={<ProtectedRoute><TreePage /></ProtectedRoute>} />
              <Route path="/tree" element={<Navigate to="/" replace />} />
              <Route path="/people" element={<ProtectedRoute><PeoplePage /></ProtectedRoute>} />
              <Route path="/people/:id" element={<ProtectedRoute><PlaceholderPage title="Person Detail" /></ProtectedRoute>} />
              <Route path="/families" element={<ProtectedRoute><PlaceholderPage title="Families" /></ProtectedRoute>} />
              <Route path="/families/:id" element={<ProtectedRoute><PlaceholderPage title="Family Detail" /></ProtectedRoute>} />
              <Route path="/sources" element={<ProtectedRoute><PlaceholderPage title="Sources" /></ProtectedRoute>} />
              <Route path="/media" element={<ProtectedRoute><PlaceholderPage title="Media Gallery" /></ProtectedRoute>} />

              {/* Import/Export (protected) */}
              <Route path="/import" element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />
              <Route path="/export" element={<ProtectedRoute><ExportPage /></ProtectedRoute>} />

              {/* Admin routes (protected, admin only) */}
              <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
              <Route path="/admin/settings" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />

              {/* Catch-all */}
              <Route path="*" element={<PlaceholderPage title="404 — Page Not Found" />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
