import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDbError } from '../lib/supabase';
import { BookOpen, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from './Layout';

interface AprendeLeccionRow {
  id: string;
  modulo: string;
  titulo: string;
  alcance: string | null;
  requisitos: string[];
  json_completo: any;
}

interface AprendeEjercicioRow {
  id: string;
  tema: string;
  nivel: number;
  enunciado: string;
  leccion_id: string | null;
}

interface AprendeProgresoRow {
  ejercicio_id: string;
  estado: string;
}

export function AprendeIndex() {
  const { user } = useAuth();
  const [lecciones, setLecciones] = useState<AprendeLeccionRow[]>([]);
  const [ejercicios, setEjercicios] = useState<AprendeEjercicioRow[]>([]);
  const [progreso, setProgreso] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [lRes, eRes, pRes] = await Promise.all([
          supabase.from('aprende_lecciones').select('*').order('modulo', { ascending: true }),
          supabase.from('aprende_ejercicios').select('*').order('tema', { ascending: true }),
          user
            ? supabase.from('aprende_progreso').select('ejercicio_id, estado').eq('user_id', user.id)
            : supabase.from('aprende_progreso').select('ejercicio_id, estado').eq('user_id', '00000000-0000-0000-0000-000000000000'),
        ]);
        if (lRes.error) throw lRes.error;
        if (eRes.error) throw eRes.error;
        if (pRes.error) throw pRes.error;
        if (!cancelled) {
          setLecciones((lRes.data ?? []) as AprendeLeccionRow[]);
          setEjercicios((eRes.data ?? []) as AprendeEjercicioRow[]);
          const pMap: Record<string, string> = {};
          (pRes.data ?? []).forEach((r: any) => {
            pMap[r.ejercicio_id] = r.estado;
          });
          setProgreso(pMap);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : formatDbError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Agrupar por módulo
  const modulos = useMemo(() => {
    const map = new Map<string, AprendeLeccionRow[]>();
    lecciones.forEach((l) => {
      const arr = map.get(l.modulo) ?? [];
      arr.push(l);
      map.set(l.modulo, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [lecciones]);

  const conteoEjerciciosPorLeccion = useMemo(() => {
    const map = new Map<string, number>();
    ejercicios.forEach((e) => {
      if (e.leccion_id) {
        map.set(e.leccion_id, (map.get(e.leccion_id) ?? 0) + 1);
      }
    });
    return map;
  }, [ejercicios]);

  const completadosPorLeccion = useMemo(() => {
    const map = new Map<string, number>();
    ejercicios.forEach((e) => {
      if (e.leccion_id && progreso[e.leccion_id] === 'correcto') {
        map.set(e.leccion_id, (map.get(e.leccion_id) ?? 0) + 1);
      }
    });
    return map;
  }, [ejercicios, progreso]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-sm text-gray-500">
        <RefreshCw className="w-4 h-4 animate-spin" /> Cargando lecciones de Aprende...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }

  if (lecciones.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm my-12 animate-in fade-in">
        <BookOpen className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white">Sin lecciones aún</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          No hay lecciones de Aprende cargadas. Pídele al administrador que suba un archivo JSON desde la sección de Administración.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-8 animate-in fade-in">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[#005F2B] dark:text-emerald-400" />
            Aprende
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Lee las lecciones y haz los ejercicios de autoevaluación. No afectan tu puntuación de Práctica ni Simulacro.
          </p>
        </div>
      </div>

      {modulos.map(([modulo, leccionesModulo]) => (
        <div key={modulo} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{modulo}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {leccionesModulo.length} lección{leccionesModulo.length !== 1 ? 'es' : ''}
            </p>
          </div>
          <div className="p-4 space-y-2">
            {leccionesModulo.map((l) => {
              const total = conteoEjerciciosPorLeccion.get(l.id) ?? 0;
              const completados = completadosPorLeccion.get(l.id) ?? 0;
              const pct = total > 0 ? Math.round((completados / total) * 100) : 0;
              return (
                <div key={l.id} className="group border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden hover:border-gray-200 dark:hover:border-gray-600">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 cursor-pointer" onClick={() => {}}>
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{l.titulo}</h3>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {completados}/{total}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">ejercicios</p>
                    </div>
                  </div>
                  <div className="p-3 pt-1">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="h-2 bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-right mt-1">
                      {pct}% completado
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
