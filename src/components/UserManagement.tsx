import React, { useEffect, useMemo, useState } from 'react';
import { supabase, formatDbError } from '../lib/supabase';
import { ADMIN_EMAIL } from '../context/AuthContext';
import {
  ShieldCheck, ShieldOff, Crown, RefreshCw, AlertTriangle,
  Ban, Undo2, Trash2, Search, Clock, UserX,
} from 'lucide-react';
import { cn } from './Layout';
import { ConfirmModal } from './ConfirmModal';

const INACTIVE_DAYS = 365;

interface ProfileRow {
  id: string;
  nombre: string | null;
  nickname: string | null;
  email: string | null;
  role: 'user' | 'admin';
  created_at?: string;
}

interface ActivityRow {
  id: string;
  email: string | null;
  nombre: string | null;
  nickname: string | null;
  role: string | null;
  profile_created: string | null;
  user_created: string | null;
  last_sign_in_at: string | null;
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
}

interface ManagedUser {
  id: string;
  nombre: string | null;
  nickname: string | null;
  email: string | null;
  role: 'user' | 'admin';
  registeredAt: string | null;
  lastSeenAt: string | null;
  neverSeen: boolean;
  isBanned: boolean;
  banReason: string | null;
}

type Filter = 'all' | 'inactive' | 'banned';

function timeAgo(iso: string | null): string {
  if (!iso) return 'nunca';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} día${d === 1 ? '' : 's'}`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `hace ${mo} mes${mo === 1 ? '' : 'es'}`;
  const y = Math.floor(mo / 12);
  return `hace ${y} año${y === 1 ? '' : 's'}`;
}

function isInactive(u: ManagedUser): boolean {
  const ref = u.lastSeenAt ?? u.registeredAt;
  if (!ref) return true;
  return Date.now() - new Date(ref).getTime() > INACTIVE_DAYS * 24 * 3600 * 1000;
}

export function UserManagement({ currentUserId }: { currentUserId?: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkDone, setBulkDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moderationReady, setModerationReady] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    setBulkDone(null);
    try {
      // nickname requiere la migración v4b; si falta la columna, reintento legado.
      let profiles: ProfileRow[] | null = null;
      const full = await supabase.from('profiles').select('id,nombre,nickname,email,role,created_at').order('created_at', { ascending: false }).limit(200);
      if (full.error) {
        if (!/nickname|column|columna/i.test(full.error.message)) throw full.error;
        const legacy = await supabase.from('profiles').select('id,nombre,email,role,created_at').order('created_at', { ascending: false }).limit(200);
        if (legacy.error) throw legacy.error;
        profiles = ((legacy.data ?? []) as ProfileRow[]).map((p) => ({ ...p, nickname: null }));
      } else {
        profiles = (full.data ?? []) as ProfileRow[];
      }
      const { data: activityData, error: activityError } = await supabase.rpc('admin_user_activity');

      let activity: ActivityRow[] = [];
      if (activityError) {
        // La migración v4 aún no se aplicó: se gestionan roles, pero sin
        // última conexión, vetos ni borrado.
        setModerationReady(false);
      } else {
        activity = (activityData ?? []) as ActivityRow[];
        // Si hay perfiles pero la actividad viene vacía, la función no nos
        // reconoce como admin: no fiarse de "nunca" ni permitir borrados.
        setModerationReady(activity.length > 0 || (profiles?.length ?? 0) === 0);
      }

      const byId = new Map(activity.map((a) => [a.id, a]));
      const merged: ManagedUser[] = ((profiles ?? []) as ProfileRow[]).map((p) => {
        const a = byId.get(p.id);
        byId.delete(p.id);
        return {
          id: p.id,
          nombre: p.nombre ?? a?.nombre ?? null,
          nickname: p.nickname ?? a?.nickname ?? null,
          email: p.email ?? a?.email ?? null,
          role: p.role,
          registeredAt: p.created_at ?? a?.user_created ?? null,
          lastSeenAt: a?.last_sign_in_at ?? null,
          neverSeen: !a?.last_sign_in_at,
          isBanned: a?.is_banned ?? false,
          banReason: a?.ban_reason ?? null,
        };
      });
      // Cuentas de auth sin fila en profiles (raro, pero no se pierden).
      byId.forEach((a) => {
        merged.push({
          id: a.id,
          nombre: a.nombre,
          nickname: a.nickname ?? null,
          email: a.email,
          role: a.role === 'admin' ? 'admin' : 'user',
          registeredAt: a.user_created,
          lastSeenAt: a.last_sign_in_at,
          neverSeen: !a.last_sign_in_at,
          isBanned: a.is_banned,
          banReason: a.ban_reason,
        });
      });
      setUsers(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === 'inactive' && !isInactive(u)) return false;
      if (filter === 'banned' && !u.isBanned) return false;
      if (!q) return true;
      return (
        (u.nombre ?? '').toLowerCase().includes(q) ||
        (u.nickname ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [users, search, filter]);

  const bannedCount = useMemo(() => users.filter((u) => u.isBanned).length, [users]);

  const isProtected = (u: ManagedUser) =>
    u.id === currentUserId || u.email?.toLowerCase() === ADMIN_EMAIL || u.role === 'admin';

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectInactive = () => {
    setSelectedIds(new Set(filtered.filter((u) => isInactive(u) && !isProtected(u)).map((u) => u.id)));
  };

  const toggleSelectVisible = () => {
    const visibleIds = filtered.filter((u) => !isProtected(u)).map((u) => u.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...visibleIds]));
    }
  };

  const askBulk = (mode: 'ban' | 'delete') => {
    const n = selectedIds.size;
    if (n === 0) return;
    setConfirm({
      title: mode === 'ban' ? `¿Vetar ${n} cuenta(s)?` : `¿Eliminar ${n} cuenta(s)?`,
      message:
        mode === 'ban'
          ? `Se bloqueará su ingreso (podrán seguir existiendo sus datos y podrás quitarles el veto después).`
          : `Se borrarán su perfil, intentos y datos de duelos. Podrán volver a registrarse (no quedan vetadas).`,
      confirmLabel: mode === 'ban' ? `Vetar ${n}` : `Eliminar ${n}`,
      onConfirm: () => {
        setConfirm(null);
        if (mode === 'ban') void runBulkVetoInactive();
        else void runBulkDeleteInactive();
      },
    });
  };

  const setRole = async (target: ManagedUser, role: 'user' | 'admin') => {
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

  const setBanned = async (target: ManagedUser, banned: boolean) => {
    setActionId(target.id);
    setError(null);
    try {
      const { error } = banned
        ? await supabase.rpc('admin_ban_user', { p_user_id: target.id, p_reason: 'Vetado por el administrador' })
        : await supabase.rpc('admin_unban_user', { p_user_id: target.id });
      if (error) throw new Error(formatDbError(error));
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, isBanned: banned } : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el veto.');
    } finally {
      setActionId(null);
    }
  };

  const runBulkVetoInactive = async () => {
    await runBulkAction('ban', Array.from(selectedIds));
  };

  const runBulkDeleteInactive = async () => {
    await runBulkAction('delete', Array.from(selectedIds));
  };

  const runBulkAction = async (mode: 'ban' | 'delete', ids: string[]) => {
    const targets = users.filter((u) => ids.includes(u.id) && !isProtected(u) && (mode === 'ban' ? !u.isBanned : true));
    if (targets.length === 0) return;
    setBulkRunning(true);
    setError(null);
    setBulkDone(null);
    let ok = 0;
    let fail = 0;
    for (const t of targets) {
      setActionId(t.id);
      try {
        if (mode === 'ban') {
          const { error: banError } = await supabase.rpc('admin_ban_user', {
            p_user_id: t.id,
            p_reason: 'Vetado por el administrador',
          });
          if (banError) throw banError;
          setUsers((prev) => prev.map((u) => (u.id === t.id ? { ...u, isBanned: true } : u)));
        } else {
          // Eliminar: borra sus datos, pero puede volver a registrarse.
          const { error: delError } = await supabase.rpc('admin_delete_user', { p_user_id: t.id });
          if (delError) throw delError;
          setUsers((prev) => prev.filter((u) => u.id !== t.id));
        }
        ok++;
      } catch {
        fail++;
      }
    }
    setActionId(null);
    setBulkRunning(false);
    setSelectedIds(new Set());
    const what = mode === 'ban' ? 'vetada(s)' : 'eliminada(s)';
    setBulkDone(`Listo: ${ok} cuenta(s) ${what}${fail > 0 ? `, ${fail} con error (revisa la consola)` : ''}.`);
    void fetchUsers();
  };

  // Eliminar: borra perfil, intentos y datos de duelos. La persona puede
  // volver a registrarse después (no queda vetada).
  const runDelete = async (target: ManagedUser) => {
    setActionId(target.id);
    setError(null);
    try {
      const { error: delError } = await supabase.rpc('admin_delete_user', { p_user_id: target.id });
      if (delError) throw new Error(formatDbError(delError));
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar al usuario.');
    } finally {
      setActionId(null);
    }
  };

  const askDelete = (target: ManagedUser) => {
    setConfirm({
      title: `¿Eliminar a ${target.nombre || target.email || 'este usuario'}?`,
      message: `Se borrarán su perfil, intentos y datos de duelos. La persona podrá volver a registrarse después (no queda vetada; para bloquearle el ingreso usa Vetar).`,
      confirmLabel: 'Eliminar',
      onConfirm: () => {
        setConfirm(null);
        void runDelete(target);
      },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-sm text-gray-500">
        <RefreshCw className="w-4 h-4 animate-spin" /> Cargando usuarios...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-wrap items-center gap-3 justify-between">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-500" /> Usuarios y permisos
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {users.length} cuenta(s) · {bannedCount} vetada(s). Solo los administradores ven esta sección.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, nickname o correo..."
                className="pl-9 pr-3 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 w-52"
              />
            </div>
            <button
              onClick={fetchUsers}
              className="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Recargar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-4 pt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
          {(['all', 'inactive', 'banned'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-full transition-colors',
                filter === f
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              )}
            >
              {f === 'all' && `Todos (${users.length})`}
              {f === 'inactive' && `Inactivos +12m (${users.filter(isInactive).length})`}
              {f === 'banned' && `Vetados (${bannedCount})`}
            </button>
          ))}
          {moderationReady && (
            <button
              onClick={selectInactive}
              title="Marcar las casillas de los inactivos visibles; luego decides si vetarlos o eliminarlos"
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white dark:bg-white dark:text-gray-900 rounded-full"
            >
              <UserX className="w-3.5 h-3.5" />
              Seleccionar inactivos
            </button>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="mx-4 mt-3 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="text-gray-700 dark:text-gray-200">{selectedIds.size} seleccionada(s). Tú decides:</span>
            <button
              onClick={() => askBulk('ban')}
              disabled={bulkRunning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-full disabled:opacity-50"
            >
              <Ban className="w-3.5 h-3.5" />
              {bulkRunning ? 'Procesando...' : 'Vetar'}
            </button>
            <button
              onClick={() => askBulk('delete')}
              disabled={bulkRunning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {bulkRunning ? 'Procesando...' : 'Eliminar'}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Limpiar selección
            </button>
          </div>
        )}

        {!moderationReady && (
          <div className="m-4 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Ejecuta <code>supabase/migration_v4_user_moderation.sql</code> para ver la última conexión, vetar y eliminar usuarios. Por ahora solo se gestionan roles.</span>
          </div>
        )}

        {error && (
          <div className="m-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {bulkDone && (
          <div className="m-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs rounded-xl">
            {bulkDone}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-xs font-bold text-gray-400 uppercase">
                <th className="py-3 pl-4 pr-1 w-8">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.filter((u) => !isProtected(u)).every((u) => selectedIds.has(u.id))}
                    onChange={toggleSelectVisible}
                    title="Seleccionar visibles"
                    className="w-4 h-4 accent-emerald-600 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Usuario</th>
                <th className="py-3 px-4">Última conexión</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((u) => {
                const isSuper = u.email?.toLowerCase() === ADMIN_EMAIL;
                const isSelf = u.id === currentUserId;
                const busy = actionId === u.id || bulkRunning;
                return (
                  <tr key={u.id} className={cn('hover:bg-gray-50 dark:hover:bg-gray-900/50', u.isBanned && 'bg-red-50/40 dark:bg-red-950/20')}>
                    <td className="py-3 pl-4 pr-1">
                      {!isProtected(u) ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(u.id)}
                          onChange={() => toggleSelect(u.id)}
                          title="Seleccionar para acción en lote"
                          className="w-4 h-4 accent-emerald-600 cursor-pointer"
                        />
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {u.nombre || 'Sin nombre'}
                        {isSelf && (
                          <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Tú</span>
                        )}
                        {isSuper && (
                          <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Superadmin</span>
                        )}
                      </p>
                      {u.nickname && (
                        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">@{u.nickname}</p>
                      )}
                      <p className="text-xs text-gray-500 font-mono truncate max-w-[220px]">{u.email || '—'}</p>
                    </td>
                    <td className="py-3 px-4">
                      {moderationReady ? (
                        <>
                          <p className={cn('text-xs font-bold flex items-center gap-1', u.neverSeen ? 'text-gray-400' : isInactive(u) ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                            <Clock className="w-3.5 h-3.5" />
                            {u.neverSeen ? 'nunca' : timeAgo(u.lastSeenAt)}
                          </p>
                          {u.lastSeenAt && (
                            <p className="text-[11px] text-gray-400">{new Date(u.lastSeenAt).toLocaleString('es-CO')}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
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
                        {u.isBanned && (
                          <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300" title={u.banReason ?? ''}>
                            VETADO
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {u.role === 'admin' ? (
                          <button
                            disabled={busy}
                            onClick={() => setRole(u, 'user')}
                            title="Quitar rol de administrador"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 rounded-lg disabled:opacity-50"
                          >
                            <ShieldOff className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">Quitar admin</span>
                          </button>
                        ) : (
                          <button
                            disabled={busy}
                            onClick={() => setRole(u, 'admin')}
                            title="Otorgar rol de administrador"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">Hacer admin</span>
                          </button>
                        )}
                        {moderationReady && !isProtected(u) && (
                          u.isBanned ? (
                            <button
                              disabled={busy}
                              onClick={() => setBanned(u, false)}
                              title="Quitar veto (permitir reingreso)"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 rounded-lg disabled:opacity-50"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              <span className="hidden xl:inline">Quitar veto</span>
                            </button>
                          ) : (
                            <button
                              disabled={busy}
                              onClick={() => setBanned(u, true)}
                              title="Vetar: bloquea su ingreso sin borrar nada"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 rounded-lg disabled:opacity-50"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span className="hidden xl:inline">Vetar</span>
                            </button>
                          )
                        )}
                        {moderationReady && !isProtected(u) && (
                          <button
                            disabled={busy}
                            onClick={() => askDelete(u)}
                            title="Eliminar: borra sus datos; podrá volver a registrarse"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400 rounded-lg disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">Eliminar</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">
              {users.length === 0 ? 'Aún no hay usuarios registrados.' : 'Ningún usuario coincide con el filtro.'}
            </p>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel ?? 'Eliminar'}
        cancelLabel="Cancelar"
        isDestructive={true}
        onConfirm={() => confirm?.onConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
