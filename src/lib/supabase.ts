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

// Tipos mínimos que reflejan el esquema normalizado en Supabase
export interface SupabaseExamRow {
  id: string;
  nombre: string;
  periodo: string | null;
  tipo: 'examen_real' | 'simulacro' | null;
  created_at?: string;
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
}
