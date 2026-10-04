import { supabase, formatDbError } from '../lib/supabase';
import { Exam, Question } from '../types';

export type StudyModo = 'practica' | 'simulacro';

export interface StudySessionState {
  id: string;
  modo: StudyModo;
  questionIds: string[];
  answers: Record<string, 'A' | 'B' | 'C' | 'D'>;
  currentIndex: number;
  /** ISO; solo simulacro (el reloj sigue corriendo fuera). */
  endsAt: string | null;
}

interface StudySessionInput {
  modo: StudyModo;
  questionIds: string[];
  answers: Record<string, 'A' | 'B' | 'C' | 'D'>;
  currentIndex: number;
  endsAt: string | null;
}

/** Guarda (upsert por usuario+modo) la sesión en curso. Devuelve el id. */
export async function saveStudySession(userId: string, input: StudySessionInput): Promise<string> {
  const { data, error } = await supabase
    .from('study_sessions')
    .upsert(
      {
        user_id: userId,
        modo: input.modo,
        question_ids: input.questionIds,
        answers: input.answers,
        current_index: input.currentIndex,
        ends_at: input.endsAt,
      },
      { onConflict: 'user_id,modo' }
    )
    .select('id')
    .single();
  if (error) throw new Error(formatDbError(error));
  return (data as { id: string }).id;
}

export async function loadStudySession(userId: string, modo: StudyModo): Promise<StudySessionState | null> {
  const { data, error } = await supabase
    .from('study_sessions')
    .select('id,modo,question_ids,answers,current_index,ends_at')
    .eq('user_id', userId)
    .eq('modo', modo)
    .maybeSingle();
  if (error) throw new Error(formatDbError(error));
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row['id']),
    modo: row['modo'] === 'simulacro' ? 'simulacro' : 'practica',
    questionIds: Array.isArray(row['question_ids']) ? (row['question_ids'] as string[]) : [],
    answers: (row['answers'] ?? {}) as StudySessionState['answers'],
    currentIndex: typeof row['current_index'] === 'number' ? (row['current_index'] as number) : 0,
    endsAt: typeof row['ends_at'] === 'string' ? (row['ends_at'] as string) : null,
  };
}

export async function deleteStudySession(userId: string, modo: StudyModo): Promise<void> {
  const { error } = await supabase
    .from('study_sessions')
    .delete()
    .eq('user_id', userId)
    .eq('modo', modo);
  if (error) throw new Error(formatDbError(error));
}

/**
 * Resuelve los ids guardados contra exámenes PUBLICADOS (todo o nada).
 * Null si falta alguna pregunta o su examen ya no está publicado:
 * la sesión se descarta con aviso.
 */
export function resolveSessionQuestions(ids: string[], exams: Exam[]): Question[] | null {
  if (ids.length === 0) return null;
  const byId = new Map<string, Question>();
  for (const e of exams) {
    if (!e.published) continue;
    for (const s of e.sections) {
      for (const q of s.questions) {
        if (q.status === 'PUBLISHED' || q.status === 'APPROVED') byId.set(q.id, q);
      }
    }
  }
  const out: Question[] = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (!q) return null;
    out.push(q);
  }
  return out;
}
