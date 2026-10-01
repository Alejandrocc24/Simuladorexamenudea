import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  displayName: string;
  /** Nickname público elegido en /perfil (duelos, rankings). */
  nickname?: string | null;
  /** Nombre de registro (no editable). */
  realName?: string | null;
  email: string;
  photoURL?: string;
  role: 'user' | 'admin';
  rating: number;
  matchesPlayed: number;
  matchesWon: number;
  questionsSolved: number;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  /** Mensaje cuando la cuenta fue vetada (se muestra en /login). */
  bannedNotice: string | null;
  login: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  isAdmin: false,
  bannedNotice: null,
  login: async () => {},
  loginWithEmail: async () => {},
  registerWithEmail: async () => {},
  resetPassword: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
});

export const ADMIN_EMAIL =
  (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.toLowerCase() ??
  'cadavidalejandro2@gmail.com';

function localProfile(user: User, dbRole?: string | null, dbNombre?: string | null, dbNickname?: string | null): UserProfile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  // Orden: nickname público > nombre de registro > metadatos de auth.
  const metaName =
    (meta['displayName'] as string | undefined) ??
    (meta['full_name'] as string | undefined) ??
    (meta['name'] as string | undefined) ??
    user.email?.split('@')[0] ??
    'Aspirante UdeA';
  const displayName = (dbNickname && dbNickname.trim()) || (dbNombre && dbNombre.trim()) || metaName;
  const photoURL =
    (meta['avatar_url'] as string | undefined) ??
    (meta['picture'] as string | undefined) ??
    '';
  const role: 'user' | 'admin' =
    dbRole === 'admin' || user.email?.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user';
  return {
    id: user.id,
    displayName,
    nickname: dbNickname ?? null,
    realName: (dbNombre && dbNombre.trim()) || null,
    email: user.email ?? '',
    photoURL,
    role,
    rating: 1000,
    matchesPlayed: 0,
    matchesWon: 0,
    questionsSolved: 0,
    createdAt: user.created_at,
    updatedAt: new Date().toISOString(),
  };
}

async function ensureProfileRow(user: User): Promise<{ role: string | null; nombre: string | null; nickname: string | null }> {
  const none = { role: null as string | null, nombre: null as string | null, nickname: null as string | null };
  try {
    // Con la migración v4b se lee también nickname; si aún no se aplicó,
    // se reintenta con el esquema anterior (la columna no existe).
    let data: Record<string, unknown> | null = null;
    const full = await supabase.from('profiles').select('id,nombre,nickname,role,email').eq('id', user.id).maybeSingle();
    if (full.error) {
      if (!/nickname|column|columna/i.test(full.error.message)) throw full.error;
      const legacy = await supabase.from('profiles').select('id,nombre,role,email').eq('id', user.id).maybeSingle();
      if (legacy.error) throw legacy.error;
      data = (legacy.data ?? null) as Record<string, unknown> | null;
    } else {
      data = (full.data ?? null) as Record<string, unknown> | null;
    }
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const nombre =
      (meta['displayName'] as string | undefined) ??
      (meta['full_name'] as string | undefined) ??
      user.email?.split('@')[0] ??
      'Aspirante UdeA';
    const isSuperAdmin = user.email?.toLowerCase() === ADMIN_EMAIL;

    if (!data) {
      await supabase.from('profiles').insert({
        id: user.id,
        nombre,
        email: user.email ?? null,
        role: isSuperAdmin ? 'admin' : 'user',
      });
      return { role: isSuperAdmin ? 'admin' : 'user', nombre, nickname: null };
    }

    const row = data as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (!row['nombre'] && nombre) patch['nombre'] = nombre;
    if (!row['email'] && user.email) patch['email'] = user.email;
    if (isSuperAdmin && row['role'] !== 'admin') patch['role'] = 'admin';
    if (Object.keys(patch).length > 0) {
      await supabase.from('profiles').update(patch).eq('id', user.id);
      if (patch['role'] === 'admin')
        return {
          role: 'admin',
          nombre: typeof row['nombre'] === 'string' ? (row['nombre'] as string) : nombre,
          nickname: typeof row['nickname'] === 'string' ? (row['nickname'] as string) : null,
        };
    }
    return {
      role: typeof row['role'] === 'string' ? (row['role'] as string) : null,
      nombre: typeof row['nombre'] === 'string' ? (row['nombre'] as string) : null,
      nickname: typeof row['nickname'] === 'string' ? (row['nickname'] as string) : null,
    };
  } catch (err) {
    console.warn('No se pudo sincronizar profiles:', err);
    return none;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannedNotice, setBannedNotice] = useState<string | null>(null);

  // ¿Está vetado este usuario? Falla en abierto si la migración v4 aún no se aplicó.
  const checkBanned = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('am_i_banned');
      if (error) throw error;
      return data === true;
    } catch {
      return false;
    }
  }, []);

  const forceSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignorar: igual se limpia el estado local
    }
    setUser(null);
    setSession(null);
    setProfile(null);
  }, []);

  const syncUser = useCallback(async (u: User | null) => {
    if (!u) {
      setUser(null);
      setProfile(null);
      return;
    }
    if (await checkBanned()) {
      await forceSignOut();
      setBannedNotice('Tu cuenta fue suspendida por un administrador. Si crees que es un error, contáctanos.');
      return;
    }
    setBannedNotice(null);
    setUser(u);
    const { role: dbRole, nombre: dbNombre, nickname: dbNickname } = await ensureProfileRow(u);
    setProfile(localProfile(u, dbRole, dbNombre, dbNickname));
  }, [checkBanned, forceSignOut]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
      void syncUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
      void syncUser(newSession?.user ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [syncUser]);

  const login = useCallback(async () => {
    setBannedNotice(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setBannedNotice(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  }, []);

  const registerWithEmail = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { displayName: displayName.trim() } },
    });
    if (error) throw error;
    // Si el proyecto no exige confirmación de email, la sesión queda activa de inmediato.
    if (data.session?.user) {
      await syncUser(data.session.user);
    }
  }, [syncUser]);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setSession(null);
    setProfile(null);
    setBannedNotice(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await syncUser(user);
  }, [user, syncUser]);

  const isAdmin = Boolean(
    profile?.role === 'admin' ||
      (user?.email && user.email.toLowerCase() === ADMIN_EMAIL)
  );

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, isAdmin, bannedNotice, login, loginWithEmail, registerWithEmail, resetPassword, logout, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
