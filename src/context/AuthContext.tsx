import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  displayName: string;
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

function localProfile(user: User, dbRole?: string | null): UserProfile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (meta['displayName'] as string | undefined) ??
    (meta['full_name'] as string | undefined) ??
    (meta['name'] as string | undefined) ??
    user.email?.split('@')[0] ??
    'Aspirante UdeA';
  const photoURL =
    (meta['avatar_url'] as string | undefined) ??
    (meta['picture'] as string | undefined) ??
    '';
  const role: 'user' | 'admin' =
    dbRole === 'admin' || user.email?.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user';
  return {
    id: user.id,
    displayName,
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

async function ensureProfileRow(user: User): Promise<string | null> {
  try {
    const { data } = await supabase.from('profiles').select('id,nombre,role,email').eq('id', user.id).maybeSingle();
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
      return isSuperAdmin ? 'admin' : 'user';
    }

    const row = data as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (!row['nombre'] && nombre) patch['nombre'] = nombre;
    if (!row['email'] && user.email) patch['email'] = user.email;
    if (isSuperAdmin && row['role'] !== 'admin') patch['role'] = 'admin';
    if (Object.keys(patch).length > 0) {
      await supabase.from('profiles').update(patch).eq('id', user.id);
      if (patch['role'] === 'admin') return 'admin';
    }
    return typeof row['role'] === 'string' ? (row['role'] as string) : null;
  } catch (err) {
    console.warn('No se pudo sincronizar profiles:', err);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const syncUser = useCallback(async (u: User | null) => {
    setUser(u);
    if (!u) {
      setProfile(null);
      return;
    }
    const dbRole = await ensureProfileRow(u);
    setProfile(localProfile(u, dbRole));
  }, []);

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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
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
      value={{ user, session, profile, loading, isAdmin, login, loginWithEmail, registerWithEmail, resetPassword, logout, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
