import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, formatDbError } from '../lib/supabase';
import { User as UserIcon, Save, CheckCircle2, AlertTriangle, Mail, CalendarDays } from 'lucide-react';

const MIN_LEN = 3;
const MAX_LEN = 30;

function cleanNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function nicknameError(nick: string): string | null {
  if (nick.length < MIN_LEN) return `El nickname debe tener al menos ${MIN_LEN} caracteres.`;
  if (nick.length > MAX_LEN) return `Máximo ${MAX_LEN} caracteres.`;
  if (!/^[\p{L}\p{N} ._\-]+$/u.test(nick)) {
    return 'Solo letras, números, espacios, puntos, guiones y guion bajo.';
  }
  return null;
}

export function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    setNickname(profile?.nickname ?? '');
    setSaveError(null);
    setSaveOk(false);
  }, [profile?.nickname, user?.id]);

  const currentNick = profile?.nickname ?? '';
  const displayName = profile?.displayName ?? '';
  const dirty = cleanNickname(nickname) !== currentNick;

  const handleSave = async () => {
    if (!user) return;
    const nick = cleanNickname(nickname);
    const validation = nicknameError(nick);
    if (validation) {
      setSaveError(validation);
      return;
    }
    if (nick === currentNick) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      // Vía función definer: valida, evita duplicados y omite las RLS.
      const { error } = await supabase.rpc('update_my_nickname', { p_nickname: nick });
      if (error) throw new Error(formatDbError(error));
      await refreshProfile();
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'No se pudo guardar el nickname.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-in fade-in">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
          <UserIcon className="w-6 h-6 text-[#005F2B] dark:text-emerald-400" />
          Mi perfil
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Así te verán otros aspirantes en los duelos y clasificaciones.
        </p>
      </header>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#005F2B] text-white flex items-center justify-center font-black text-2xl flex-shrink-0">
            {(dirty ? cleanNickname(nickname) : displayName)?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 dark:text-white truncate">{displayName || 'Sin nombre'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 truncate">
              <Mail className="w-3 h-3" /> {user?.email}
            </p>
            {user?.created_at && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Miembro desde {new Date(user.created_at).toLocaleDateString('es-CO')}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            Nombre (registro)
          </label>
          <input
            value={profile?.realName ?? ''}
            disabled
            title="Nombre con el que te registraste (no editable)"
            className="w-full text-sm p-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 dark:text-gray-400 outline-none font-medium cursor-not-allowed"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Este es tu nombre de registro y no se puede cambiar.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            Nickname
          </label>
          <input
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setSaveError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSave();
            }}
            placeholder="Ej: AspirantePro2026"
            maxLength={MAX_LEN + 10}
            className="w-full text-sm p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            {MIN_LEN}–{MAX_LEN} caracteres: letras, números, espacios, puntos y guiones.
          </p>
        </div>

        {saveError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{saveError}</span>
          </div>
        )}
        {saveOk && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs rounded-xl flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Nickname actualizado.</span>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#005F2B] hover:bg-[#004D23] disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar nickname'}
        </button>
      </div>
    </div>
  );
}
