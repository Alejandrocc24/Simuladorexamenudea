import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDbError } from '../lib/supabase';
import { FileJson, Upload, AlertTriangle, CheckCircle2, RefreshCw, Plus } from 'lucide-react';
import { cn } from './Layout';

interface AprendeJSON {
  lecciones: Array<{
    id: string;
    modulo: string;
    titulo: string;
    alcance: string | null;
    requisitos: string[];
    bloques: any[];
  }>;
  ejercicios: Array<{
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
  }>;
}

export function AprendeAdminCargar() {
  const { user } = useAuth();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [jsonPegado, setJsonPegado] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [resumen, setResumen] = useState<{ lecciones: number; ejercicios: number; errores: string[] } | null>(null);

  const handleArchivos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setArchivos((prev) => [...prev, ...files.filter((f) => f.type === 'application/json' || f.name.endsWith('.json'))]);
    setError(null);
    setExito(null);
    setResumen(null);
  };

  const quitarArchivo = (index: number) => {
    setArchivos((prev) => prev.filter((_, i) => i !== index));
    setError(null);
    setResumen(null);
  };

  const handleJsonPegado = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonPegado(e.target.value);
    setError(null);
    setExito(null);
    setResumen(null);
  };

  const parsearJSON = (texto: string, nombre: string): AprendeJSON | null => {
    try {
      const data = JSON.parse(texto);
      if (!Array.isArray(data.lecciones) || !Array.isArray(data.ejercicios)) {
        throw new Error('El JSON debe contener "lecciones" y "ejercicios" como arreglos.');
      }
      return data as AprendeJSON;
    } catch (err) {
      throw new Error(`${nombre}: JSON inválido (${err instanceof Error ? err.message : 'error desconocido'})`);
    }
  };

  const cargarTodo = async () => {
    if (!user) {
      setError('Debes iniciar sesión para cargar lecciones.');
      return;
    }
    if (archivos.length === 0 && !jsonPegado.trim()) {
      setError('Selecciona al menos un archivo JSON o pega su contenido.');
      return;
    }
    setCargando(true);
    setError(null);
    setExito(null);
    setResumen(null);

    let totalLecciones = 0;
    let totalEjercicios = 0;
    const errores: string[] = [];

    const itemsACargar: Array<{ nombre: string; texto: string }> = [];
    archivos.forEach((f) => itemsACargar.push({ nombre: f.name, texto: '' }));
    if (jsonPegado.trim()) itemsACargar.push({ nombre: 'texto pegado', texto: jsonPegado });

    try {
      for (const item of itemsACargar) {
        let texto = item.texto;
        if (item.nombre !== 'texto pegado') {
          const archivo = archivos.find((f) => f.name === item.nombre);
          if (archivo) {
            texto = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error(`No se pudo leer ${archivo.name}`));
              reader.readAsText(archivo);
            });
          }
        }

        let data: AprendeJSON;
        try {
          data = parsearJSON(texto, item.nombre);
        } catch (err) {
          errores.push(err instanceof Error ? err.message : String(err));
          continue;
        }

        for (const lec of data.lecciones) {
          try {
            const { error: insError } = await supabase.from('aprende_lecciones').upsert(
              {
                id: lec.id,
                modulo: lec.modulo,
                titulo: lec.titulo,
                alcance: lec.alcance ?? null,
                requisitos: lec.requisitos ?? [],
                json_completo: lec,
                creado_por: user.id,
              },
              { onConflict: 'id' }
            );
            if (insError) throw insError;
            totalLecciones++;
          } catch (err) {
            errores.push(`${item.nombre} › lección ${lec.id}: ${formatDbError(err)}`);
          }
        }

        for (const ej of data.ejercicios) {
          try {
            const { error: insError } = await supabase.from('aprende_ejercicios').upsert(
              {
                id: ej.id,
                tema: ej.tema,
                nivel: ej.nivel,
                enunciado: ej.enunciado,
                descripcion: ej.descripcion ?? null,
                svg: ej.svg ?? null,
                opciones: ej.opciones ?? [],
                correcta: ej.correcta ?? null,
                pista: ej.pista ?? null,
                explicacion: ej.explicacion ?? [],
                errores: ej.errores ?? {},
                tip: ej.tip ?? null,
                comprobacion: ej.comprobacion ?? null,
                leccion_id: ej.leccion_id ?? null,
                verificado: ej.verificado ?? false,
              },
              { onConflict: 'id' }
            );
            if (insError) throw insError;
            totalEjercicios++;
          } catch (err) {
            errores.push(`${item.nombre} › ejercicio ${ej.id}: ${formatDbError(err)}`);
          }
        }
      }

      setResumen({ lecciones: totalLecciones, ejercicios: totalEjercicios, errores });
      if (errores.length === 0) {
        setExito(`Se cargaron ${totalLecciones} lección(es) y ${totalEjercicios} ejercicio(s) correctamente.`);
      } else {
        setExito(`Carga parcial: ${totalLecciones} lección(es) y ${totalEjercicios} ejercicio(s). ${errores.length} error(es).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : formatDbError(err));
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6 animate-in fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Cargar lecciones y ejercicios (JSON)
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Sube uno o varios archivos JSON generados por <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">convertir.py</code> o pega su contenido. Solo los administradores pueden cargar.
          </p>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Seleccionar archivo(s) .json</label>
            <div className="flex flex-wrap gap-2">
              <input
                type="file"
                accept=".json,application/json"
                multiple
                onChange={handleArchivos}
                className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 dark:file:bg-emerald-900/20 file:text-emerald-700 dark:file:text-emerald-400 cursor-pointer"
              />
              {archivos.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <FileJson className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-xs text-gray-900 dark:text-gray-100 truncate">{f.name}</span>
                  <button
                    onClick={() => quitarArchivo(i)}
                    className="ml-auto p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {archivos.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {archivos.length} archivo(s) seleccionado(s)
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">O pegar contenido JSON</label>
            <textarea
              value={jsonPegado}
              onChange={handleJsonPegado}
              rows={6}
              placeholder='Pega aquí el contenido del JSON generado por convertir.py...'
              className="w-full text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {exito && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-200 text-xs rounded-xl">
              {exito}
            </div>
          )}
          {resumen && resumen.errores.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-xl">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-1">Errores durante la carga:</p>
              <ul className="list-disc list-outside ml-4 text-xs">
                {resumen.errores.map((e, i) => (
                  <li key={i} className="leading-relaxed">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={cargarTodo}
            disabled={cargando || (archivos.length === 0 && !jsonPegado.trim())}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" />
            {cargando ? 'Cargando...' : 'Cargar lecciones y ejercicios'}
          </button>
        </div>
      </div>
    </div>
  );
}
