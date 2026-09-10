import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, PenTool, LayoutDashboard, Trophy, Download, Settings, Swords, LogIn, LogOut } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../store/useStore';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { user, profile, isAdmin, loading: authLoading, logout } = useAuth();
  const focusMode = useStore((s) => s.focusMode);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, adminOnly: false },
    { name: 'Práctica', path: '/practice', icon: BookOpen, adminOnly: false },
    { name: 'Simulacro', path: '/mock-exam', icon: Trophy, adminOnly: false },
    { name: 'Competir (1v1)', path: '/competition', icon: Swords, adminOnly: false },
    { name: 'Pizarra', path: '/whiteboard', icon: PenTool, adminOnly: false },
    { name: 'Administración', path: '/admin', icon: Settings, adminOnly: true },
  ].filter((item) => !item.adminOnly || isAdmin);

  // Close menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Sin sesión: mostrar solo el contenido (login) sin menú lateral ni encabezado móvil.
  // NOTA: el modo enfoque NO usa esta rama: ocultar el sidebar con CSS (sin cambiar
  // la estructura del árbol) evita que React desmonte la vista activa y se pierda su estado.
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        {!isOnline && (
          <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-lg">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            Modo Offline
          </div>
        )}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="w-full max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col md:flex-row">
      {!isOnline && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-lg">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          Modo Offline
        </div>
      )}

      {/* Mobile Header fijo + menú desplegable superpuesto (no empuja el contenido).
          En modo enfoque se oculta con CSS para no desmontar la vista activa. */}
      <div className={cn("md:hidden sticky top-0 z-30", focusMode && "hidden")}>
      <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-lg font-bold text-[#005F2B] dark:text-emerald-400">Simulador UdeA</h1>
        <div className="flex items-center gap-2">
          {user ? (
            <div className="w-8 h-8 rounded-full bg-[#005F2B] text-white flex items-center justify-center font-bold text-xs">
              {profile?.displayName?.charAt(0) || 'U'}
            </div>
          ) : (
            <Link
              to="/login"
              className="text-xs font-bold text-[#005F2B] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1.5 rounded-lg flex items-center gap-1"
            >
              <LogIn className="w-3.5 h-3.5" />
              Entrar
            </Link>
          )}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={isMobileMenuOpen}
            className="p-2.5 -mr-1 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen 
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Menú móvil: panel superpuesto con fondo para cerrar al tocar fuera */}
      {isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/40"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden
          />
          <div className="absolute top-full left-0 right-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-xl max-h-[75vh] overflow-y-auto overscroll-contain">
            <nav className="px-3 py-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5 rounded-xl text-[15px] font-medium transition-colors active:scale-[0.99]",
                      isActive
                        ? "bg-[#005F2B]/10 text-[#005F2B] dark:bg-[#005F2B]/30 dark:text-emerald-300 font-bold"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                    )}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
            <div className="p-4 pt-1 space-y-2">
              {user ? (
                <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#005F2B] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {profile?.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                        {profile?.displayName || user.email}
                      </p>
                      <p className="text-[11px] font-semibold text-[#005F2B] dark:text-emerald-400">
                        ⚡ {profile?.rating || 1000} ELO
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg"
                  >
                    <LogOut className="w-4 h-4" />
                    Salir
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-[#005F2B] text-white rounded-xl text-sm font-bold"
                >
                  <LogIn className="w-4 h-4" />
                  Iniciar sesión / Crear cuenta
                </Link>
              )}
              {!isInstalled && isInstallable && (
                <button
                  onClick={install}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  <Download className="w-4 h-4" />
                  Instalar App
                </button>
              )}
            </div>
          </div>
        </>
      )}
      </div>

      {/* Sidebar Navigation (desktop) */}
      <aside className={cn(
        "w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-col shrink-0",
        focusMode ? "hidden" : "hidden md:flex"
      )}>
        <div className="p-6 hidden md:block">
          <h1 className="text-2xl font-bold text-[#005F2B] dark:text-emerald-400">Simulador UdeA</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Plataforma de preparación</p>
        </div>
        <nav className="flex-1 px-4 py-4 md:py-0 space-y-2 mb-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-[#005F2B]/10 text-[#005F2B] dark:bg-[#005F2B]/30 dark:text-emerald-300 font-bold" 
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                )}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* User Profile Card */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40">
          {user ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#005F2B] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {profile?.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                    {profile?.displayName || user.email}
                  </p>
                  <p className="text-[11px] font-semibold text-[#005F2B] dark:text-emerald-400">
                    ⚡ {profile?.rating || 1000} ELO
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#005F2B] hover:bg-[#004D23] text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Iniciar sesión / Crear cuenta
            </Link>
          )}
        </div>

        {/* PWA Install Area */}
        <div className="p-4 mt-auto">
          {!isInstalled && isInstallable && (
            <button
              onClick={install}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#005F2B] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#004D23] transition"
            >
              <Download className="w-4 h-4" />
              Instalar App
            </button>
          )}
          {!isInstalled && isIOS && (
            <>
              <button
                onClick={() => setShowIOSGuide(true)}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 transition"
              >
                <Download className="w-4 h-4" />
                Instalar en iOS
              </button>
              {showIOSGuide && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Instalar en iPhone / iPad</h3>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                      1. Toca el botón <strong>Compartir</strong> en la barra de Safari.<br />
                      2. Desliza hacia abajo y toca <strong>Agregar a inicio</strong>.
                    </p>
                    <button
                      onClick={() => setShowIOSGuide(false)}
                      className="mt-4 w-full rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 min-h-0 p-4 md:p-8 pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto overflow-x-clip">
        <div className="w-full max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
