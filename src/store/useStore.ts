import { create } from 'zustand';
import { Exam, PracticeSession, MockExamSession, Question } from '../types';
import {
  getLocalPracticeSessions,
  getLocalMockSessions,
  persistPracticeSession,
  persistMockExamSession,
  fetchUserPracticeSessions,
  fetchUserMockSessions,
} from '../services/sessionService';
import { supabase, formatDbError } from '../lib/supabase';
import { supabaseToExams } from '../lib/examAdapter';
import { statementHash } from '../lib/jsonClean';

interface AppState {
  exams: Exam[];
  isLoadingExams: boolean;
  practiceSessions: PracticeSession[];
  mockSessions: MockExamSession[];
  setExams: (exams: Exam[]) => void;
  fetchExams: () => Promise<void>;
  addExam: (exam: Exam) => Promise<void>;
  renameExam: (examId: string, title: string) => Promise<void>;
  updateQuestion: (examId: string, sectionId: string, questionId: string, updates: Partial<Question>) => Promise<void>;
  deleteExam: (examId: string) => Promise<void>;
  clearAllExams: () => Promise<void>;
  deleteQuestion: (examId: string, sectionId: string, questionId: string) => Promise<void>;

  // Practice Sessions
  addPracticeSession: (session: PracticeSession, userId?: string) => Promise<void>;
  updatePracticeSession: (id: string, answers: Record<string, 'A' | 'B' | 'C' | 'D'>, score?: number, endTime?: number, userId?: string) => Promise<void>;

  // Mock Exam Sessions
  addMockSession: (session: MockExamSession, userId?: string) => Promise<void>;
  loadUserSessions: (userId: string) => Promise<void>;

  // Modo enfoque: oculta el sidebar para dar todo el ancho al contenido
  // (p. ej. práctica + pizarra lado a lado para explicar en grupo)
  focusMode: boolean;
  setFocusMode: (value: boolean) => void;
}

// Data validation: ensure PUBLISHED questions have exactly 4 valid options and non-null correctAnswer.
// Además aplica la regla todo-o-nada: `published` solo si TODAS están aprobadas/publicadas.
function sanitizeAndValidateExam(exam: Exam): Exam {
  const sections = exam.sections.map((sec) => ({
    ...sec,
    questions: sec.questions.map((q) => {
      if (q.status === 'PUBLISHED') {
        const hasValidOptions =
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          q.options.every((opt) => opt && typeof opt.text === 'string' && opt.text.trim().length > 0);
        const hasValidAnswer = q.correctAnswer && ['A', 'B', 'C', 'D'].includes(q.correctAnswer);

        if (!hasValidOptions || !hasValidAnswer) {
          return {
            ...q,
            status: 'NEEDS_REVIEW' as const,
            needsReview: true,
            reviewNotes: 'Auto-despublicada: La pregunta requiere 4 opciones completas y respuesta correcta asignada.',
          };
        }
      }
      return q;
    }),
  }));
  const all = sections.flatMap((s) => s.questions);
  return {
    ...exam,
    sections,
    published: all.length > 0 && all.every((q) => q.status === 'PUBLISHED' || q.status === 'APPROVED'),
  };
}

export const useStore = create<AppState>()((set, get) => ({
  // Sin examen de ejemplo: si Supabase está vacío, la lista queda vacía para empezar en limpio.
  exams: [],
  isLoadingExams: false,
  focusMode: false,
  setFocusMode: (value) => set({ focusMode: value }),
  practiceSessions: getLocalPracticeSessions(),
  mockSessions: getLocalMockSessions(),

  setExams: (exams) => set({ exams }),

  fetchExams: async () => {
    set({ isLoadingExams: true });
    try {
      // Con la migración v3 aplicada, shared_texts viene en la consulta principal.
      // Si la columna aún no existe, se reintenta con el esquema anterior.
      let examRows: unknown[] | null = null;
      const examsFull = await supabase
        .from('exams')
        .select('id,nombre,periodo,tipo,shared_texts,created_at')
        .order('created_at', { ascending: false });
      if (examsFull.error) {
        if (/shared_texts|column|columna/i.test(examsFull.error.message)) {
          const retry = await supabase
            .from('exams')
            .select('id,nombre,periodo,tipo,created_at')
            .order('created_at', { ascending: false });
          if (retry.error) throw retry.error;
          examRows = retry.data as unknown[];
        } else {
          throw examsFull.error;
        }
      } else {
        examRows = examsFull.data as unknown[];
      }

      // Intento con columnas v3+; si aún no existen, reintento con el esquema anterior.
      let questionRows: unknown[] | null = null;
      const fullSelect =
        'id,exam_id,numero_original,area,tema,category,confidence,difficulty,statement_hash,duplicada_de,enunciado_md,imagenes,opciones,respuesta_correcta,tiene_respuesta_oficial,explicacion_md,created_at';
      const legacySelect =
        'id,exam_id,numero_original,area,tema,enunciado_md,imagenes,opciones,respuesta_correcta,tiene_respuesta_oficial,explicacion_md,created_at';
      const first = await supabase.from('questions').select(fullSelect).order('numero_original', { ascending: true });
      if (first.error) {
        if (/category|confidence|difficulty|statement_hash|duplicada_de|column|columna/i.test(first.error.message)) {
          const retry = await supabase.from('questions').select(legacySelect).order('numero_original', { ascending: true });
          if (retry.error) throw retry.error;
          questionRows = retry.data as unknown[];
        } else {
          throw first.error;
        }
      } else {
        questionRows = first.data as unknown[];
      }

      let examsList: Exam[] = [];
      if (examRows && examRows.length > 0) {
        examsList = supabaseToExams(examRows as never, (questionRows ?? []) as never).map(sanitizeAndValidateExam);
      }

      set({ exams: examsList, isLoadingExams: false });
    } catch (err) {
      console.warn('[Supabase LIST] exams:', err);
      // Ante un error de red se conservan los exámenes ya cargados en lugar de mostrar datos de ejemplo.
      set({ isLoadingExams: false });
    }
  },

  addExam: async (exam) => {
    // addExam se mantiene por compatibilidad, pero el flujo oficial es JsonImporter -> Supabase directo.
    const validatedExam = sanitizeAndValidateExam(exam);
    set((state) => ({
      exams: [...state.exams.filter((e) => e.id !== validatedExam.id), validatedExam],
    }));
  },

  renameExam: async (examId, title) => {
    const clean = title.trim();
    if (!clean) throw new Error('El título no puede estar vacío.');
    const previousExams = get().exams;
    set((state) => ({
      exams: state.exams.map((e) => (e.id === examId ? { ...e, title: clean } : e)),
    }));
    try {
      const { error } = await supabase.from('exams').update({ nombre: clean }).eq('id', examId);
      if (error) throw new Error(formatDbError(error));
    } catch (err) {
      console.warn('[Supabase UPDATE] exams:', err);
      set({ exams: previousExams });
      throw err;
    }
  },

  updateQuestion: async (examId, sectionId, questionId, updates) => {
    const previousExams = get().exams;
    const examToUpdate = previousExams.find((e) => e.id === examId);
    if (!examToUpdate) throw new Error('Examen no encontrado');

    const targetSection = examToUpdate.sections.find((s) => s.id === sectionId);
    const currentQuestion = targetSection?.questions.find((q) => q.id === questionId);
    if (!currentQuestion) throw new Error('Pregunta no encontrada');

    const mergedQuestion = { ...currentQuestion, ...updates };

    // Si cambió el enunciado, el hash de duplicados se recalcula.
    if (typeof updates.statement === 'string') {
      mergedQuestion.statementHash = statementHash(updates.statement);
    }

    if (mergedQuestion.status === 'PUBLISHED') {
      const hasValidOptions =
        Array.isArray(mergedQuestion.options) &&
        mergedQuestion.options.length === 4 &&
        mergedQuestion.options.every((opt) => opt && typeof opt.text === 'string' && opt.text.trim().length > 0);
      const hasValidAnswer = mergedQuestion.correctAnswer && ['A', 'B', 'C', 'D'].includes(mergedQuestion.correctAnswer);

      if (!hasValidOptions) {
        throw new Error('No se puede publicar: Todas las 4 opciones (A, B, C, D) deben tener texto descriptivo.');
      }
      if (!hasValidAnswer) {
        throw new Error('No se puede publicar: Debes seleccionar una respuesta correcta (A, B, C o D).');
      }
    }

    const updatedSections = examToUpdate.sections.map((section) => {
      if (section.id !== sectionId) return section;
      return {
        ...section,
        questions: section.questions.map((q) => (q.id === questionId ? mergedQuestion : q)),
      };
    });
    // Recomputa la compuerta todo-o-nada: aprobar la última publica el examen.
    const allUpdated = updatedSections.flatMap((s) => s.questions);
    const updatedExam: Exam = {
      ...examToUpdate,
      sections: updatedSections,
      published: allUpdated.length > 0 && allUpdated.every((q) => q.status === 'PUBLISHED' || q.status === 'APPROVED'),
    };

    set((state) => ({
      exams: state.exams.map((e) => (e.id === examId ? updatedExam : e)),
    }));

    try {
      const opciones = mergedQuestion.options.map((o) => ({ id: o.id, texto: o.text }));
      // Se conserva target/description para el bloque de opciones y el contexto compartido.
      const imagenes = (mergedQuestion.assets ?? [])
        .map((a) => {
          const url = a.imagePath ?? a.croppedImage ?? a.content ?? '';
          if (!url) return null;
          if (a.target || a.description) {
            return { imagePath: url, croppedImage: url, target: a.target, description: a.description };
          }
          return url;
        })
        .filter(Boolean);
      const fullPayload: Record<string, unknown> = {
        enunciado_md: mergedQuestion.statement,
        opciones,
        respuesta_correcta: mergedQuestion.correctAnswer,
        tiene_respuesta_oficial: mergedQuestion.correctAnswer !== null,
        explicacion_md: mergedQuestion.explanation ?? null,
        tema: mergedQuestion.topic ?? null,
        category: mergedQuestion.category ?? null,
        confidence: mergedQuestion.confidence ?? null,
        difficulty: mergedQuestion.difficulty ?? 'medium',
        statement_hash: mergedQuestion.statementHash ?? null,
        // Al publicar/aprobar se limpia la marca de duplicada.
        duplicada_de: mergedQuestion.status === 'NEEDS_REVIEW' ? (mergedQuestion.duplicadaDe ?? null) : null,
        imagenes,
      };
      const { error } = await supabase.from('questions').update(fullPayload).eq('id', questionId);
      if (error) {
        if (/category|confidence|difficulty|statement_hash|duplicada_de|column|columna/i.test(error.message)) {
          const { category: _c, confidence: _cf, difficulty: _d, statement_hash: _h, duplicada_de: _dd, ...legacyPayload } = fullPayload;
          const { error: legacyError } = await supabase.from('questions').update(legacyPayload).eq('id', questionId);
          if (legacyError) throw legacyError;
        } else {
          throw error;
        }
      }
    } catch (err) {
      console.warn('[Supabase UPDATE] questions:', err);
      set({ exams: previousExams });
      throw err;
    }
  },

  deleteExam: async (examId) => {
    const previousExams = get().exams;
    set((state) => ({
      exams: state.exams.filter((e) => e.id !== examId),
    }));

    try {
      // Orden de borrado por las FK (sin CASCADE bloquean con 409):
      // respuestas de duelos → participantes → salas → preguntas → examen.
      // rooms.exam_id y room_answers.question_id referencian al examen.
      const { data: qIds, error: idsError } = await supabase
        .from('questions')
        .select('id')
        .eq('exam_id', examId);
      if (idsError) throw new Error(formatDbError(idsError));
      const ids = ((qIds ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
      if (ids.length > 0) {
        const { error: childError } = await supabase.from('room_answers').delete().in('question_id', ids);
        if (childError) throw new Error(`No se pudo eliminar (respuestas de duelos asociadas): ${formatDbError(childError)}`);
      }
      const { data: roomIds, error: roomsError } = await supabase
        .from('rooms')
        .select('id')
        .eq('exam_id', examId);
      if (roomsError) throw new Error(formatDbError(roomsError));
      const rIds = ((roomIds ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
      if (rIds.length > 0) {
        const { error: ansError } = await supabase.from('room_answers').delete().in('room_id', rIds);
        if (ansError) throw new Error(`No se pudo eliminar (respuestas de duelos asociadas): ${formatDbError(ansError)}`);
        const { error: partError } = await supabase.from('room_participants').delete().in('room_id', rIds);
        if (partError) throw new Error(`No se pudo eliminar (participantes de duelos asociados): ${formatDbError(partError)}`);
        const { error: roomError } = await supabase.from('rooms').delete().in('id', rIds);
        if (roomError) throw new Error(formatDbError(roomError));
      }
      const { error: qError } = await supabase.from('questions').delete().eq('exam_id', examId);
      if (qError) throw new Error(formatDbError(qError));
      const { error } = await supabase.from('exams').delete().eq('id', examId);
      if (error) throw new Error(formatDbError(error));
    } catch (err) {
      console.warn('[Supabase DELETE] exams:', err);
      set({ exams: previousExams });
      throw err;
    }
  },

  clearAllExams: async () => {
    const previousExams = get().exams;
    set({ exams: [] });

    try {
      // Mismo orden que deleteExam, sin filtros por examen.
      const ZERO = '00000000-0000-0000-0000-000000000000';
      const { error: ansError } = await supabase.from('room_answers').delete().neq('room_id', ZERO);
      if (ansError) throw new Error(`No se pudo vaciar (respuestas de duelos asociadas): ${formatDbError(ansError)}`);
      const { error: partError } = await supabase.from('room_participants').delete().neq('room_id', ZERO);
      if (partError) throw new Error(`No se pudo vaciar (participantes de duelos asociados): ${formatDbError(partError)}`);
      const { error: roomsError } = await supabase.from('rooms').delete().neq('id', ZERO);
      if (roomsError) throw new Error(formatDbError(roomsError));
      const { error: qError } = await supabase.from('questions').delete().neq('id', ZERO);
      if (qError) throw new Error(formatDbError(qError));
      const { error } = await supabase.from('exams').delete().neq('id', ZERO);
      if (error) throw new Error(formatDbError(error));
    } catch (err) {
      console.warn('[Supabase DELETE] all exams:', err);
      set({ exams: previousExams });
      throw err;
    }
  },

  deleteQuestion: async (_examId, _sectionId, questionId) => {
    const previousExams = get().exams;
    const actualQuestionId = questionId;

    const targetExam = previousExams.find((e) =>
      e.sections.some((s) => s.questions.some((q) => q.id === actualQuestionId))
    );
    if (!targetExam) return;

    const updatedSections = targetExam.sections.map((section) => ({
      ...section,
      questions: section.questions.filter((q) => q.id !== actualQuestionId),
    }));
    const remaining = updatedSections.flatMap((s) => s.questions);
    const updatedExam: Exam = {
      ...targetExam,
      sections: updatedSections,
      published: remaining.length > 0 && remaining.every((q) => q.status === 'PUBLISHED' || q.status === 'APPROVED'),
    };

    set((state) => ({
      exams: state.exams.map((e) => (e.id === targetExam.id ? updatedExam : e)),
    }));

    try {
      // Ver nota en deleteExam: primero las respuestas de duelos (FK → 409).
      const { error: childError } = await supabase.from('room_answers').delete().eq('question_id', actualQuestionId);
      if (childError) throw new Error(`No se pudo eliminar (respuestas de duelos asociadas): ${formatDbError(childError)}`);
      const { error } = await supabase.from('questions').delete().eq('id', actualQuestionId);
      if (error) throw new Error(formatDbError(error));
    } catch (err) {
      console.warn('[Supabase DELETE] questions:', err);
      set({ exams: previousExams });
      throw err;
    }
  },

  addPracticeSession: async (session, userId) => {
    set((state) => ({ practiceSessions: [session, ...state.practiceSessions] }));
    await persistPracticeSession(session, userId);
  },

  updatePracticeSession: async (id, answers, score, endTime, userId) => {
    const sessionToUpdate = get().practiceSessions.find((s) => s.id === id);
    if (!sessionToUpdate) return;

    const updated: PracticeSession = {
      ...sessionToUpdate,
      answers,
      score: score ?? sessionToUpdate.score,
      endTime: endTime || Date.now(),
      durationSeconds: Math.round(((endTime || Date.now()) - sessionToUpdate.startTime) / 1000),
    };

    set((state) => ({
      practiceSessions: state.practiceSessions.map((s) => (s.id === id ? updated : s)),
    }));

    await persistPracticeSession(updated, userId);
  },

  addMockSession: async (session, userId) => {
    set((state) => ({ mockSessions: [session, ...state.mockSessions] }));
    await persistMockExamSession(session, userId);
  },

  loadUserSessions: async (userId) => {
    if (!userId) return;
    try {
      const [practices, mocks] = await Promise.all([
        fetchUserPracticeSessions(userId),
        fetchUserMockSessions(userId),
      ]);
      set({ practiceSessions: practices, mockSessions: mocks });
    } catch (err) {
      console.warn('Error loading user sessions:', err);
    }
  },
}));
