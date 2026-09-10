import { supabase } from '../lib/supabase';
import { PracticeSession, MockExamSession } from '../types';

const LOCAL_STORAGE_PRACTICE_KEY = 'simulador_udea_practice_sessions';
const LOCAL_STORAGE_MOCK_KEY = 'simulador_udea_mock_sessions';

// --- LocalStorage Helpers ---
export function getLocalPracticeSessions(): PracticeSession[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PRACTICE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error reading practice sessions from localStorage', err);
    return [];
  }
}

export function saveLocalPracticeSession(session: PracticeSession): void {
  try {
    const list = getLocalPracticeSessions();
    const index = list.findIndex((s) => s.id === session.id);
    if (index >= 0) {
      list[index] = session;
    } else {
      list.unshift(session);
    }
    localStorage.setItem(LOCAL_STORAGE_PRACTICE_KEY, JSON.stringify(list.slice(0, 100)));
  } catch (err) {
    console.error('Error saving practice session to localStorage', err);
  }
}

export function getLocalMockSessions(): MockExamSession[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MOCK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error reading mock sessions from localStorage', err);
    return [];
  }
}

export function saveLocalMockSession(session: MockExamSession): void {
  try {
    const list = getLocalMockSessions();
    const index = list.findIndex((s) => s.id === session.id);
    if (index >= 0) {
      list[index] = session;
    } else {
      list.unshift(session);
    }
    localStorage.setItem(LOCAL_STORAGE_MOCK_KEY, JSON.stringify(list.slice(0, 50)));
  } catch (err) {
    console.error('Error saving mock session to localStorage', err);
  }
}

// --- Supabase Persistent Helpers (tabla attempts) ---
// attempts: user_id, tipo ('practica' | 'examen_completo'), question_ids, respuestas,
// puntaje_total, tiempo_usado_segundos, started_at, finished_at

export async function persistPracticeSession(session: PracticeSession, userId?: string): Promise<void> {
  saveLocalPracticeSession(session);
  if (!userId) return;

  try {
    const questionIds = Object.keys(session.answers ?? {});
    const correctCount = questionIds.length; // el puntaje detallado se calcula en la UI
    await supabase.from('attempts').insert({
      user_id: userId,
      tipo: 'practica',
      question_ids: questionIds,
      respuestas: session.answers ?? {},
      puntaje_total: session.score ?? correctCount,
      tiempo_usado_segundos: session.durationSeconds ?? null,
      started_at: new Date(session.startTime).toISOString(),
      finished_at: session.endTime ? new Date(session.endTime).toISOString() : new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Could not save practice session to Supabase (cached locally):', error);
  }
}

export async function fetchUserPracticeSessions(userId: string): Promise<PracticeSession[]> {
  const local = getLocalPracticeSessions();
  if (!userId) return local;

  try {
    const { data, error } = await supabase
      .from('attempts')
      .select('*')
      .eq('user_id', userId)
      .eq('tipo', 'practica')
      .order('started_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    if (!data || data.length === 0) return local;

    const remote: PracticeSession[] = data.map((row: Record<string, unknown>) => ({
      id: String(row['id']),
      userId,
      examId: '',
      sectionId: 'razonamiento-logico',
      startTime: row['started_at'] ? new Date(String(row['started_at'])).getTime() : Date.now(),
      endTime: row['finished_at'] ? new Date(String(row['finished_at'])).getTime() : undefined,
      durationSeconds: typeof row['tiempo_usado_segundos'] === 'number' ? (row['tiempo_usado_segundos'] as number) : undefined,
      answers: (row['respuestas'] as PracticeSession['answers']) ?? {},
      score: typeof row['puntaje_total'] === 'number' ? (row['puntaje_total'] as number) : undefined,
      completedAt: typeof row['finished_at'] === 'string' ? (row['finished_at'] as string) : new Date().toISOString(),
    }));

    const map = new Map<string, PracticeSession>();
    local.forEach((s) => map.set(s.id, s));
    remote.forEach((s) => map.set(s.id, s));
    return Array.from(map.values()).sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  } catch (error) {
    console.warn('Falling back to local practice sessions:', error);
    return local;
  }
}

export async function persistMockExamSession(session: MockExamSession, userId?: string): Promise<void> {
  saveLocalMockSession(session);
  if (!userId) return;

  try {
    const questionIds = Object.keys(session.answers ?? {});
    await supabase.from('attempts').insert({
      user_id: userId,
      tipo: 'examen_completo',
      question_ids: questionIds,
      respuestas: session.answers ?? {},
      puntaje_total: session.overallScorePercentage ?? session.correctCount ?? 0,
      puntaje_logico: session.sectionBreakdown?.['razonamiento-logico']?.percentage ?? null,
      puntaje_lectora: session.sectionBreakdown?.['competencia-lectora']?.percentage ?? null,
      tiempo_usado_segundos: session.timeSpentSeconds ?? null,
      started_at: new Date(session.startTime).toISOString(),
      finished_at: session.completedAt ?? new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Could not save mock exam session to Supabase (cached locally):', error);
  }
}

export async function fetchUserMockSessions(userId: string): Promise<MockExamSession[]> {
  const local = getLocalMockSessions();
  if (!userId) return local;

  try {
    const { data, error } = await supabase
      .from('attempts')
      .select('*')
      .eq('user_id', userId)
      .eq('tipo', 'examen_completo')
      .order('started_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    if (!data || data.length === 0) return local;
    // Los intentos remotos no traen el detalle completo del MockExamSession,
    // se conservan los locales como fuente principal.
    return local;
  } catch (error) {
    console.warn('Falling back to local mock sessions:', error);
    return local;
  }
}
