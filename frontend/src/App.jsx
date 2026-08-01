import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryProvider } from './providers/QueryProvider';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { StreamProvider } from './providers/StreamProvider';
import { Layout } from './components/layout/Layout';

import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { Jobs } from './pages/Jobs';
import { JobEditor } from './pages/JobEditor';
import { Workflows } from './pages/Workflows';
import { Executions } from './pages/Executions';
import { Workers } from './pages/Workers';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400 font-mono text-sm">
        Initializing JobFlow Session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <StreamProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />

              {/* Protected Workspace Layout */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="projects" element={<Projects />} />
                <Route path="jobs" element={<Jobs />} />
                <Route path="jobs/new" element={<JobEditor />} />
                <Route path="jobs/:id/edit" element={<JobEditor />} />
                <Route path="workflows" element={<Workflows />} />
                <Route path="executions" element={<Executions />} />
                <Route path="workers" element={<Workers />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="settings" element={<Settings />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </StreamProvider>
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
