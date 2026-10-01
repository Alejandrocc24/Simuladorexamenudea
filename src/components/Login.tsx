import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, Mail, Lock, User as UserIcon, AlertTriangle, CheckCircle2, Globe } from 'lucide-react';
import { cn } from './Layout';

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (m.includes('user already registered') || m.includes('already registered')) {
    return 'Este correo ya está registrado. Inicia sesión.';
  }
  if (m.includes('email not confirmed')) {
    return 'Debes confirmar tu correo antes de entrar. Revisa tu bandeja (y spam).';
  }
  if (m.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) {
    return 'El login con Google no está habilitado en Supabase. Usa email y contraseña.';
  }
  return message;
}

export function Login() {
  const { user, login, loginWithEmail, registerWithEmail, resetPassword, loading, bannedNotice } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  React.useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [user, loading, navigate]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email.trim() || !password) {
      setError('Escribe tu correo y contraseña.');
      return;
    }
    if (mode === 'register' && !displayName.trim()) {
      setError('Escribe tu nombre para crear la cuenta.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
        navigate('/', { replace: true });
      } else {
        await registerWithEmail(email, password, displayName);
        setInfo('Cuenta creada. Si Supabase exige confirmación, revisa tu correo; si no, ya quedaste dentro.');
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : 'No se pudo completar la autenticación.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await login();
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : 'Google no disponible.'));
      setGoogleLoading(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Escribe tu correo para enviarte el enlace de recuperación.');
      return;
    }
    try {
      await resetPassword(email);
      setInfo('Te enviamos un enlace de recuperación si el correo existe.');
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : 'No se pudo enviar el correo.'));
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sm:p-8 space-y-5 sm:space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-black text-[#005F2B] dark:text-emerald-400">Simulador UdeA</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Inicia sesión o crea tu cuenta para ver el contenido.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-gray-100 dark:bg-gray-700/50 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => { setMode('login'); setError(null); setInfo(null); }}
            className={cn(
              'py-2 rounded-lg transition-all flex items-center justify-center gap-1.5',
              mode === 'login' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500'
            )}
          >
            <LogIn className="w-3.5 h-3.5" /> Entrar
          </button>
          <button
            onClick={() => { setMode('register'); setError(null); setInfo(null); }}
            className={cn(
              'py-2 rounded-lg transition-all flex items-center justify-center gap-1.5',
              mode === 'register' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500'
            )}
          >
            <UserPlus className="w-3.5 h-3.5" /> Crear cuenta
          </button>
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-3">
          {bannedNotice && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-xl flex items-start gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{bannedNotice}</span>
            </div>
          )}
          {mode === 'register' && (
            <label className="block">
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Nombre</span>
              <div className="mt-1 flex items-center gap-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3">
                <UserIcon className="w-4 h-4 text-gray-400" />
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full bg-transparent py-2.5 text-sm outline-none text-gray-900 dark:text-white"
                />
              </div>
            </label>
          )}

          <label className="block">
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Correo</span>
            <div className="mt-1 flex items-center gap-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3">
              <Mail className="w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com"
                className="w-full bg-transparent py-2.5 text-sm outline-none text-gray-900 dark:text-white"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Contraseña</span>
            <div className="mt-1 flex items-center gap-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3">
              <Lock className="w-4 h-4 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-transparent py-2.5 text-sm outline-none text-gray-900 dark:text-white"
              />
            </div>
          </label>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {info && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs rounded-xl flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{info}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-[#005F2B] hover:bg-[#004D23] disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors"
          >
            {submitting ? 'Procesando...' : mode === 'login' ? 'Entrar con email' : 'Crear cuenta'}
          </button>
        </form>

        <div className="flex items-center justify-between text-xs">
          <button onClick={handleReset} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:underline">
            ¿Olvidaste tu contraseña?
          </button>
          <Link to="/" className="text-gray-400 hover:underline">Volver</Link>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          o continúa con
          <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>

        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <Globe className="w-4 h-4" />
          {googleLoading ? 'Abriendo Google...' : 'Continuar con Google'}
        </button>
        <p className="text-[11px] text-gray-400 text-center">
          Si Google falla, es porque el provider no está activado en Supabase. El email siempre funciona.
        </p>
      </div>
    </div>
  );
}
