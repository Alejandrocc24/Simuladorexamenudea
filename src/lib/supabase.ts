import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env.local y completa los valores.'
  );
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key'
);

// Formatea errores PostgREST (message + code/hint/details) para que la consola
// y la UI muestren la causa real en vez de solo el status HTTP.
export function formatDbError(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; code?: string; hint?: string; details?: string };
  const parts: string[] = [e.message ?? 'Error de base de datos'];
  if (e.code) parts.push(`(código ${e.code})`);
  if (e.details) parts.push(e.details);
  if (e.hint) parts.push(`Sugerencia: ${e.hint}`);
  return parts.join(' ');
}

// Tipos mínimos que reflejan el esquema normalizado en Supabase
export interface SupabaseExamRow {
  id: string;
  nombre: string;
  periodo: string | null;
  tipo: 'examen_real' | 'simulacro' | null;
  created_at?: string;
  /** Textos de lectura compartidos (JSON v3). Columna nueva `shared_texts` (jsonb). */
  shared_texts?: unknown;
  /** Alias legacy por si la columna se creó con otro nombre. */
  sharedTexts?: unknown;
}

export interface SupabaseQuestionRow {
  id: string;
  exam_id: string;
  numero_original: number | null;
  area: 'logico' | 'lectora';
  tema: string | null;
  enunciado_md: string;
  imagenes: unknown;
  opciones: unknown;
  respuesta_correcta: string | null;
  tiene_respuesta_oficial: boolean | null;
  explicacion_md: string | null;
  created_at?: string;
  /** Bloque oficial del examen (JSON v3). Columna nueva. */
  category?: string | null;
  /** Confianza IA de uso interno (JSON v3). Columna nueva. */
  confidence?: string | null;
  /** Nivel de dificultad. Columna nueva. */
  difficulty?: string | null;
  /** Hash del enunciado normalizado (duplicados). Columna nueva. */
  statement_hash?: string | null;
  /** Referencia a la posible original. Columna nueva. */
  duplicada_de?: string | null;
}
