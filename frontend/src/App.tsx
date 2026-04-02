import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import TreePage from './pages/TreePage';

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
    <BrowserRouter>
      <AuthProvider>
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
          <Route path="/people" element={<ProtectedRoute><PlaceholderPage title="People List" /></ProtectedRoute>} />
          <Route path="/people/:id" element={<ProtectedRoute><PlaceholderPage title="Person Detail" /></ProtectedRoute>} />
          <Route path="/families" element={<ProtectedRoute><PlaceholderPage title="Families" /></ProtectedRoute>} />
          <Route path="/families/:id" element={<ProtectedRoute><PlaceholderPage title="Family Detail" /></ProtectedRoute>} />
          <Route path="/sources" element={<ProtectedRoute><PlaceholderPage title="Sources" /></ProtectedRoute>} />
          <Route path="/media" element={<ProtectedRoute><PlaceholderPage title="Media Gallery" /></ProtectedRoute>} />

          {/* Import/Export (protected) */}
          <Route path="/import" element={<ProtectedRoute><PlaceholderPage title="GEDCOM Import" /></ProtectedRoute>} />
          <Route path="/export" element={<ProtectedRoute><PlaceholderPage title="GEDCOM Export" /></ProtectedRoute>} />

          {/* Admin routes (protected) */}
          <Route path="/admin/users" element={<ProtectedRoute><PlaceholderPage title="User Management" /></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute><PlaceholderPage title="Settings" /></ProtectedRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<PlaceholderPage title="404 — Page Not Found" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
