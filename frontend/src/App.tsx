import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

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
      <Routes>
        {/* Auth routes */}
        <Route path="/login" element={<PlaceholderPage title="Login" />} />
        <Route path="/setup" element={<PlaceholderPage title="Admin Setup" />} />
        <Route path="/register/:token" element={<PlaceholderPage title="Register" />} />
        <Route path="/forgot-password" element={<PlaceholderPage title="Forgot Password" />} />
        <Route path="/reset-password" element={<PlaceholderPage title="Reset Password" />} />

        {/* Main app routes */}
        <Route path="/" element={<PlaceholderPage title="Family Tree Canvas" />} />
        <Route path="/tree" element={<Navigate to="/" replace />} />
        <Route path="/people" element={<PlaceholderPage title="People List" />} />
        <Route path="/people/:id" element={<PlaceholderPage title="Person Detail" />} />
        <Route path="/families" element={<PlaceholderPage title="Families" />} />
        <Route path="/families/:id" element={<PlaceholderPage title="Family Detail" />} />
        <Route path="/sources" element={<PlaceholderPage title="Sources" />} />
        <Route path="/media" element={<PlaceholderPage title="Media Gallery" />} />

        {/* Import/Export */}
        <Route path="/import" element={<PlaceholderPage title="GEDCOM Import" />} />
        <Route path="/export" element={<PlaceholderPage title="GEDCOM Export" />} />

        {/* Admin routes */}
        <Route path="/admin/users" element={<PlaceholderPage title="User Management" />} />
        <Route path="/admin/settings" element={<PlaceholderPage title="Settings" />} />

        {/* Catch-all */}
        <Route path="*" element={<PlaceholderPage title="404 — Page Not Found" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
