import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Practice } from './components/Practice';
import { Whiteboard } from './components/Whiteboard';
import { MockExam } from './components/MockExam';
import { Admin } from './components/Admin';
import { CompetitionMode } from './components/CompetitionMode';
import { NotFound } from './components/NotFound';
import { Login } from './components/Login';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Profile } from './components/Profile';
import { useStore } from './store/useStore';

// Simple PWA Register Hook implementation for Vite PWA
function ReloadPrompt() {
  // In a real app with vite-plugin-pwa we'd use virtual:pwa-register
  return null;
}

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-gray-500 font-medium">Verificando sesión...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

function AppRoutes() {
  const fetchExams = useStore((state) => state.fetchExams);
  const { user } = useAuth();

  useEffect(() => {
    if (user) fetchExams();
  }, [fetchExams, user]);

  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/practice" element={<RequireAuth><Practice /></RequireAuth>} />
        <Route path="/mock-exam" element={<RequireAuth><MockExam /></RequireAuth>} />
        <Route path="/competition" element={<RequireAuth><CompetitionMode /></RequireAuth>} />
        <Route path="/whiteboard" element={<RequireAuth><Whiteboard /></RequireAuth>} />
        <Route path="/perfil" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ReloadPrompt />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
