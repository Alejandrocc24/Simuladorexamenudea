import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDbError } from '../lib/supabase';
import { MathRenderer } from './MathRenderer';
import { BookOpen, ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, XCircle, HelpCircle, Save, Bomb } from 'lucide-react';
import { cn } from './Layout';
import type { AprendeEjercicioJSON } from '../lib/aprende';

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

export function AprendeEjercicio() {
  const { ejercicioId } = useParams<{ ejercicioId: string }>();
  const { user } = useAuth();
  const [ejercicio, setEjercicio] = useState<AprendeEjercicioRow | null>(null);
  const [progreso, setProgreso] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const [respondiendo, setRespondiendo] = useState(false);
  const [resultado, setResultado] = useState<'correcto' | 'incorrecto' | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mostrarExplicacion, setMostrarExplicacion] = useState(false);
  const [mostrarPista, setMostrarPista] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [eRes, pRes] = await Promise.all([
          supabase.from('aprende_ejercicios').select('*').eq('id', ejercicioId).maybeSingle(),
          user
            ? supabase.from('aprende_progreso').select('ejercicio_id, estado').eq('user_id', user.id)
            : supabase.from('aprende_progreso').select('ejercicio_id, estado').eq('user_id', '00000000-0000-0000-0000-000000000000'),
        ]);
        if (eRes.error) throw eRes.error;
        if (pRes.error) throw pRes.error;
        if (!cancelled) {
          setEjercicio((eRes.data ?? null) as AprendeEjercicioRow | null);
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
  }, [ejercicioId, user?.id]);

  const opciones = ejercicio?.opciones ?? [];
  const correcta = ejercicio?.correcta ?? null;
  const errores = ejercicio?.errores ?? {};
  const explicacion = ejercicio?.explicacion ?? [];
  const tip = ejercicio?.tip ?? null;

  const opcionesArray = Array.isArray(opciones) ? (opciones as { letra: string; texto: string }[]) : [];

  const responder = async (letra: string) => {
    if (!ejercicio || respondiendo) return;
    setRespondiendo(true);
    setRespuesta(letra);
    const esCorrecto = letra === correcta;
    setResultado(esCorrecto ? 'correcto' : 'incorrecto');
    setMostrarExplicacion(true);

    if (user) {
      setGuardando(true);
      try {
        const estado = esCorrecto ? 'correcto' : 'incorrecto';
        const { error } = await supabase.from('aprende_progreso').upsert(
          {
            user_id: user.id,
            ejercicio_id: ejercicioId,
            estado,
            intentos: 1,
            ultimo_intento_en: new Date().toISOString(),
          },
          { onConflict: 'user_id, ejercicio_id' }
        );
        if (error) throw error;
        setProgreso((prev) => ({ ...prev, [ejercicioId]: estado }));
      } catch (err) {
        console.warn('No se pudo guardar el progreso:', err);
      } finally {
        setGuardando(false);
        setRespondiendo(false);
      }
    } else {
      setRespondiendo(false);
    }
  };

  const saltar = async () => {
    setRespondiendo(true);
    setResultado(null);
    setMostrarExplicacion(false);
    setRespuesta(null);
    if (user) {
      setGuardando(true);
      try {
        await supabase.from('aprende_progreso').upsert(
          {
            user_id: user.id,
            ejercicio_id: ejercicioId,
            estado: 'omitido',
            intentos: 1,
            ultimo_intento_en: new Date().toISOString(),
          },
          { onConflict: 'user_id, ejercicio_id' }
        );
        setProgreso((prev) => ({ ...prev, [ejercicioId]: 'omitido' }));
      } catch (err) {
        console.warn('No se pudo guardar el progreso:', err);
      } finally {
        setGuardando(false);
      }
    }
    setRespondiendo(false);
  };

  const estadoActual = progreso[ejercicioId];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-sm text-gray-500">
        <RefreshCw className="w-4 h-4 animate-spin" /> Cargando ejercicio...
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

  if (!ejercicio) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm my-12 animate-in fade-in">
        <AlertTriangle className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white">Ejercicio no encontrado</h2>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[#005F2B] dark:text-emerald-400" />
            Ejercicio {ejercicio.id}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tema {ejercicio.tema} • Nivel {ejercicio.nivel}
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
            estadoActual === 'correcto'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : estadoActual === 'incorrecto'
                ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                : 'bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
          )}>
            {estadoActual === 'correcto' ? '✓ Resuelto' : estadoActual === 'incorrecto' ? '✗ Incorrecto' : 'Sin resolver'}
          </span>
        </div>
      </div>

      {/* SVG opcional del ejercicio */}
      {ejercicio.svg && (
        <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex justify-center overflow-x-auto bg-white dark:bg-gray-800 rounded-lg p-2">
            <div dangerouslySetInnerHTML={{ __html: ejercicio.svg }} className="max-w-full max-h-[64vh] object-contain" />
          </div>
        </div>
      )}

      {/* Enunciado */}
      <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <MathRenderer text={ejercicio.enunciado} className="text-gray-700 dark:text-gray-200 leading-relaxed" />
        {ejercicio.descripcion && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción:</p>
            <MathRenderer text={ejercicio.descripcion} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed" />
          </div>
        )}
      </div>

      {/* Opciones */}
      {opcionesArray.length > 0 && (
        <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Opciones:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {opcionesArray.map((op) => {
              const seleccionado = respuesta === op.letra;
              const esCorrecta = op.letra === correcta;
              const mostrarResultado = resultado !== null && seleccionado;
              return (
                <button
                  key={op.letra}
                  onClick={() => responder(op.letra)}
                  disabled={resultado !== null}
                  className={cn(
                    'flex flex-col items-start p-3 rounded-xl border-2 text-left transition-colors',
                    mostrarResultado && esCorrecta
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 font-bold shadow'
                      : mostrarResultado && seleccionado && !esCorrecta
                        ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-100 font-bold shadow'
                        : seleccionado
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-bold'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500'
                  )}
                >
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Opción {op.letra}
                  </span>
                  <MathRenderer text={op.texto} className="text-sm text-gray-900 dark:text-white leading-relaxed" />
                  {mostrarResultado && esCorrecta && (
                    <span className="mt-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-black">Correcta</span>
                  )}
                  {mostrarResultado && seleccionado && !esCorrecta && (
                    <span className="mt-2 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-black">Tu opción</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pista */}
      {ejercicio.pista && !resultado && (
        <button
          onClick={() => setMostrarPista(!mostrarPista)}
          className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline px-2 py-1"
        >
          {mostrarPista ? 'Ocultar pista' : 'Mostrar pista'}
        </button>
      )}
      {mostrarPista && ejercicio.pista && (
        <div className="p-3 mt-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <MathRenderer text={ejercicio.pista} className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed" />
        </div>
      )}

      {/* Resultado y explicación */}
      {resultado !== null && mostrarExplicacion && ejercicio && (
        <div className="p-4 rounded-xl shadow-sm">
          {resultado === 'correcto' ? (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 px-3 py-2 text-emerald-700 dark:text-emerald-300 font-bold">
                <CheckCircle2 className="w-5 h-5" />
                ¡Correcto!
              </div>
              {Array.isArray(ejercicio.explicacion) && ejercicio.explicacion.length > 0 && (
                <div className="px-3 py-2 space-y-2">
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1">
                    Explicación:
                  </p>
                  {ejercicio.explicacion.map((paso, i) => (
                    <div key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed pl-4 border-l-2 border-emerald-200 dark:border-emerald-800">
                      <MathRenderer text={paso.texto ?? paso} className="inline" />
                    </div>
                  ))}
                </div>
              )}
              {ejercicio.tip && (
                <div className="mt-3 px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1">Tip:</p>
                  <MathRenderer text={ejercicio.tip} className="text-sm text-gray-700 dark:text-gray-300" />
                </div>
              )}
            </div>
          ) : (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 px-3 py-2 text-red-700 dark:text-red-300 font-bold">
                <XCircle className="w-5 h-5" />
                Incorrecto
              </div>
              {ejercicio.errores && typeof ejercicio.errores === 'object' && respuesta && ejercicio.errores[respuesta] && (
                <div className="px-3 py-2">
                  <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">
                    Por qué está mal tu opción:
                  </p>
                  <MathRenderer text={ejercicio.errores[respuesta]} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed" />
                </div>
              )}
              {Array.isArray(ejercicio.explicacion) && ejercicio.explicacion.length > 0 && (
                <div className="px-3 py-2 mt-2 border-t border-red-200 dark:border-red-800">
                  <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">
                    Explicación correcta:
                  </p>
                  {ejercicio.explicacion.map((paso, i) => (
                    <div key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed pl-4 border-l-2 border-red-200 dark:border-red-800">
                      <MathRenderer text={paso.texto ?? paso} className="inline" />
                    </div>
                  ))}
                </div>
              )}
              {ejercicio.tip && (
                <div className="mt-3 px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1">Tip:</p>
                  <MathRenderer text={ejercicio.tip} className="text-sm text-gray-700 dark:text-gray-300" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex flex-wrap gap-3">
        {resultado === null && (
          <button
            onClick={saltar}
            className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Omitir
          </button>
        )}
        {resultado !== null && (
          <>
            <button
              onClick={() => {
                setRespuesta(null);
                setResultado(null);
                setMostrarExplicacion(false);
                setMostrarPista(false);
                setRespondiendo(false);
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Intentar otro
            </button>
            <button
              onClick={() => setMostrarPista(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-100"
            >
              Ver otra vez
            </button>
          </>
        )}
      </div>
    </div>
  );
}
