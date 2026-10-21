import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDbError } from '../lib/supabase';
import { MathRenderer } from './MathRenderer';
import { BookOpen, ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from './Layout';
import type { AprendeLeccionJSON, AprendeBloque } from '../lib/aprende';

/** Tipos de ejercicio para Aprende (independiente de questions del simulador) */
interface AprendeEjercicioRow {
  id: string;
  tema: string;
  nivel: number;
  enunciado: string;
  descripcion: string | null;
  svg: string | null;
  opciones: any;
  correcta: string | null;
  pista: string | null;
  explicacion: any;
  errores: any;
  tip: string | null;
  comprobacion: string | null;
  leccion_id: string | null;
  verificado: boolean;
}

interface AprendeProgresoRow {
  ejercicio_id: string;
  estado: string;
}

export function AprendeLeccion() {
  const { leccionId } = useParams<{ leccionId: string }>();
  const { user } = useAuth();
  const [leccion, setLeccion] = useState<AprendeLeccionJSON | null>(null);
  const [ejercicios, setEjercicios] = useState<AprendeEjercicioRow[]>([]);
  const [progreso, setProgreso] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modoRevision, setModoRevision] = useState(false);

  // Cargar lección, ejercicios de esa lección y progreso del usuario
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [lRes, eRes, pRes] = await Promise.all([
          supabase.from('aprende_lecciones').select('*').eq('id', leccionId).maybeSingle(),
          supabase.from('aprende_ejercicios').select('*').eq('leccion_id', leccionId).order('id', { ascending: true }),
          user
            ? supabase.from('aprende_progreso').select('ejercicio_id, estado').eq('user_id', user.id)
            : supabase.from('aprende_progreso').select('ejercicio_id, estado').eq('user_id', '00000000-0000-0000-0000-000000000000'),
        ]);
        if (lRes.error) throw lRes.error;
        if (eRes.error) throw eRes.error;
        if (pRes.error) throw pRes.error;
        if (!cancelled) {
          // El JSON completo se guarda en json_completo; leer los bloques desde ahí
          const row = lRes.data ?? null;
          setLeccion((row?.json_completo ?? null) as AprendeLeccionJSON | null);
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
  }, [leccionId, user?.id]);

  // Detectar modo revisión desde la URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setModoRevision(params.get('revision') === '1');
  }, []);

  const bloques = leccion?.bloques ?? [];
  const ejerciciosDeLeccion = ejercicios;

  const renderBloque = (b: AprendeBloque, idx: number) => {
    switch (b.bloque) {
      case 'texto':
        return (
          <div key={idx} className="space-y-2">
            {b.titulo && (
              <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-1">{b.titulo}</h3>
            )}
            {b.contenido.map((c, ci) => (
              <div key={ci} className="prose-max-w text-gray-700 dark:text-gray-300 leading-relaxed space-y-1">
                {c.t === 'p' && <MathRenderer text={c.texto} />}
                {c.t === 'lista' && (
                  <ul className="list-disc list-outside ml-6 space-y-1 text-gray-700 dark:text-gray-300">
                    {c.items.map((item, ii) => (
                      <li key={ii} className="leading-relaxed">
                        <MathRenderer text={item} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        );
      case 'definicion':
        return (
          <div key={idx} className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Definición</span>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 rounded">{b.termino}</span>
            </div>
            <MathRenderer text={b.contenido} className="text-gray-700 dark:text-gray-300" />
          </div>
        );
      case 'notacion':
        return (
          <div key={idx} className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Notación</span>
              <code className="text-xs bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded text-gray-800 dark:text-gray-200">{b.simbolo}</code>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              <span className="font-semibold text-blue-700 dark:text-blue-400">Se lee:</span> <MathRenderer text={b.se_lee} className="inline" />
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              <span className="font-semibold text-blue-700 dark:text-blue-400">Ejemplo:</span>{' '}
              <MathRenderer text={b.ejemplo} className="inline" />
            </div>
          </div>
        );
      case 'repaso':
        return (
          <details key={idx} className="group">
            <summary className="flex items-center gap-2 cursor-pointer list-none p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 font-semibold text-indigo-700 dark:text-indigo-300">
              <span>🔁</span> Repaso: {b.titulo}
            </summary>
            <div className="p-4 mt-2 space-y-2 text-gray-700 dark:text-gray-300 leading-relaxed">
              {b.contenido_bloques ? (
                b.contenido_bloques.map((c, ci) => (
                  <div key={ci} className="prose-max-w">
                    {c.t === 'p' && <MathRenderer text={c.texto} />}
                    {c.t === 'lista' && (
                      <ul className="list-disc list-outside ml-6 space-y-1">
                        {c.items.map((item, ii) => (
                          <li key={ii} className="leading-relaxed">
                            <MathRenderer text={item} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              ) : (
                <MathRenderer text={b.contenido} />
              )}
            </div>
          </details>
        );
      case 'prueba':
        return (
          <AprendePregunta key={idx} ejercicio={null as any} modoRevision={modoRevision} />
        );
      case 'autoevaluacion':
        return (
          <AprendePregunta key={idx} ejercicio={null as any} modoRevision={modoRevision} />
        );
      case 'ejemplo':
        return (
          <div key={idx} className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl space-y-3">
            {b.titulo && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Ejemplo</span>
                <span className="text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded">{b.titulo}</span>
              </div>
            )}
            <MathRenderer text={b.enunciado} className="text-gray-700 dark:text-gray-300 leading-relaxed" />
            {b.paso.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Pasos:</p>
                {b.paso.map((p, pi) => (
                  <div key={pi} className="pl-4 border-l-2 border-blue-200 dark:border-blue-800 ml-2">
                    <MathRenderer text={p.texto} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed" />
                  </div>
                ))}
              </div>
            )}
            {b.comprobacion && (
              <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Comprobación:</p>
                <MathRenderer text={b.comprobacion} className="text-sm text-gray-700 dark:text-gray-300" />
              </div>
            )}
          </div>
        );
      case 'svg':
        if (!modoRevision && b.revision) return null;
        return (
          <div key={idx} className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            {b.descripcion && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{b.descripcion}</p>
            )}
            <div className="flex justify-center overflow-x-auto bg-white dark:bg-gray-800 rounded-lg p-2">
              <div dangerouslySetInnerHTML={{ __html: b.svg }} className="max-w-full max-h-[64vh] object-contain" />
            </div>
          </div>
        );
      case 'error_comun':
        return (
          <div key={idx} className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="flex items-start gap-2">
              <span className="text-amber-700 dark:text-amber-400 mt-0.5">⚠️</span>
              <MathRenderer text={b.texto} className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed" />
            </div>
          </div>
        );
      case 'tip':
        return (
          <div key={idx} className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="flex items-start gap-2">
              <span className="text-blue-700 dark:text-blue-400 mt-0.5">💡</span>
              <div>
                {b.titulo && <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">{b.titulo}</p>}
                <MathRenderer text={b.contenido} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed" />
              </div>
            </div>
          </div>
        );
      case 'antes_de_empezar':
        return (
          <div key={idx} className="p-4 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl">
            <div className="flex items-start gap-2">
              <span className="text-purple-700 dark:text-purple-400 mt-0.5">📋</span>
              <MathRenderer text={b.texto ?? b.contenido ?? ''} className="text-sm text-purple-800 dark:text-purple-300 leading-relaxed" />
            </div>
          </div>
        );
      case 'fuentes':
        if (!modoRevision) return null;
        return (
          <div key={idx} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl">
            <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Fuentes</h4>
            <ul className="list-disc list-outside ml-6 text-xs text-gray-600 dark:text-gray-400 space-y-1">
              {b.items.map((item, ii) => (
                <li key={ii} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-sm text-gray-500">
        <RefreshCw className="w-4 h-4 animate-spin" /> Cargando lección...
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

  if (!leccion) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm my-12 animate-in fade-in">
        <AlertTriangle className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white">Lección no encontrada</h2>
        <p className="text-gray-500 dark:text-gray-400">No se pudo cargar la lección. Verifica que el ID sea correcto.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[#005F2B] dark:text-emerald-400" />
            {leccion.titulo}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{leccion.alcance}</p>
        </div>
        {modoRevision && (
          <button
            onClick={() => setModoRevision(false)}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Ocultar modo revisión
          </button>
        )}
        {!modoRevision && (
          <button
            onClick={() => setModoRevision(true)}
            className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
          >
            Modo revisión (docente)
          </button>
        )}
        <Link to="/aprende" className="text-xs font-bold text-gray-600 dark:text-gray-300 hover:underline">
          ← Volver a Aprende
        </Link>
      </div>

      {bloques.length > 0 ? (
        <div className="space-y-6">
          {bloques.map((b, i) => renderBloque(b, i))}
          {ejerciciosDeLeccion.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2">
                Ejercicios de esta lección ({ejerciciosDeLeccion.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ejerciciosDeLeccion.map((ej) => {
                  const estado = progreso[ej.id];
                  return (
                    <a
                      key={ej.id}
                      href={`/aprende/ejercicio/${ej.id}`}
                      className={cn(
                        'block p-3 rounded-xl border transition-colors',
                        estado === 'correcto'
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 dark:border-emerald-500 text-emerald-700 dark:text-emerald-300'
                          : estado === 'incorrecto'
                          ? 'bg-red-50 dark:bg-red-950/30 border-red-500 dark:border-red-500 text-red-700 dark:text-red-300'
                          : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{ej.id}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{ej.enunciado}</p>
                        </div>
                        <span className="text-xs font-bold">
                          {estado === 'correcto' ? '✓' : estado === 'incorrecto' ? '✗' : '○'}
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto p-8 text-center bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm my-12 animate-in fade-in">
          <BookOpen className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white">Sin bloques aún</h2>
          <p className="text-gray-500 dark:text-gray-400">Esta lección no tiene bloques de contenido cargados.</p>
        </div>
      )}
    </div>
  );
}

/** Componente pequeño para bloques de prueba dentro de una lección */
function AprendePregunta({ ejercicio, modoRevision }: { ejercicio: AprendeEjercicioRow | null; modoRevision: boolean }) {
  return null; // Se renderiza desde AprendeEjercicio separado
}
