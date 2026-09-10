import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ADMIN_EMAIL } from '../context/AuthContext';
import { ShieldCheck, ShieldOff, Crown, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from './Layout';

interface ProfileRow {
  id: string;
  nombre: string | null;
  email: string | null;
  role: 'user' | 'admin';
  created_at?: string;
}

export function UserManagement({ currentUserId }: { currentUserId?: string }) {
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,nombre,email,role,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setUsers((data ?? []) as ProfileRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
  }, []);

  const setRole = async (target: ProfileRow, role: 'user' | 'admin') => {
    if (target.id === currentUserId && role === 'user') {
      setError('No puedes quitarte el rol de administrador a ti mismo.');
      return;
    }
    if (target.email?.toLowerCase() === ADMIN_EMAIL && role === 'user') {
      setError('No se puede degradar al superadministrador definido en VITE_ADMIN_EMAIL.');
      return;
    }
    setActionId(target.id);
    setError(null);
    try {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', target.id);
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, role } : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el rol.');
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-sm text-gray-500">
        <RefreshCw className="w-4 h-4 animate-spin" /> Cargando usuarios...
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-500" /> Usuarios y permisos
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {users.length} cuenta(s). Solo los administradores ven esta sección.
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          title="Recargar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="m-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 text-xs font-bold text-gray-400 uppercase">
              <th className="py-3 px-4">Usuario</th>
              <th className="py-3 px-4">Correo</th>
              <th className="py-3 px-4">Rol</th>
              <th className="py-3 px-4 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {users.map((u) => {
              const isSuper = u.email?.toLowerCase() === ADMIN_EMAIL;
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                  <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
                    {u.nombre || 'Sin nombre'}
                    {isSelf && (
                      <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Tú</span>
                    )}
                    {isSuper && (
                      <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Superadmin</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-xs font-mono">{u.email || '—'}</td>
                  <td className="py-3 px-4">
                    <span
                      className={cn(
                        'text-[11px] px-2 py-0.5 rounded font-bold',
                        u.role === 'admin'
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      )}
                    >
                      {u.role === 'admin' ? 'ADMIN' : 'USER'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {u.role === 'admin' ? (
                      <button
                        disabled={actionId === u.id}
                        onClick={() => setRole(u, 'user')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 rounded-lg disabled:opacity-50"
                      >
                        <ShieldOff className="w-3.5 h-3.5" />
                        Quitar admin
                      </button>
                    ) : (
                      <button
                        disabled={actionId === u.id}
                        onClick={() => setRole(u, 'admin')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Hacer admin
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">Aún no hay usuarios registrados.</p>
        )}
      </div>
    </div>
  );
}
