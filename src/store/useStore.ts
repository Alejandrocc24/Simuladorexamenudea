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
import { supabase } from '../lib/supabase';
import { supabaseToExams } from '../lib/examAdapter';

interface AppState {
  exams: Exam[];
  isLoadingExams: boolean;
  practiceSessions: PracticeSession[];
  mockSessions: MockExamSession[];
  setExams: (exams: Exam[]) => void;
  fetchExams: () => Promise<void>;
  addExam: (exam: Exam) => Promise<void>;
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

// Data validation: ensure PUBLISHED questions have exactly 4 valid options and non-null correctAnswer
function sanitizeAndValidateExam(exam: Exam): Exam {
  return {
    ...exam,
    sections: exam.sections.map((sec) => ({
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
    })),
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
      const { data: examRows, error: examError } = await supabase
        .from('exams')
        .select('id,nombre,periodo,tipo,created_at')
        .order('created_at', { ascending: false });
      if (examError) throw examError;

      const { data: questionRows, error: qError } = await supabase
        .from('questions')
        .select('id,exam_id,numero_original,area,tema,enunciado_md,imagenes,opciones,respuesta_correcta,tiene_respuesta_oficial,explicacion_md,created_at')
        .order('numero_original', { ascending: true });
      if (qError) throw qError;

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

  updateQuestion: async (examId, sectionId, questionId, updates) => {
    const previousExams = get().exams;
    const examToUpdate = previousExams.find((e) => e.id === examId);
    if (!examToUpdate) throw new Error('Examen no encontrado');

    const targetSection = examToUpdate.sections.find((s) => s.id === sectionId);
    const currentQuestion = targetSection?.questions.find((q) => q.id === questionId);
    if (!currentQuestion) throw new Error('Pregunta no encontrada');

    const mergedQuestion = { ...currentQuestion, ...updates };

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

    const updatedExam: Exam = {
      ...examToUpdate,
      sections: examToUpdate.sections.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          questions: section.questions.map((q) => (q.id === questionId ? mergedQuestion : q)),
        };
      }),
    };

    set((state) => ({
      exams: state.exams.map((e) => (e.id === examId ? updatedExam : e)),
    }));

    try {
      const opciones = mergedQuestion.options.map((o) => ({ id: o.id, texto: o.text }));
      const imagenes = (mergedQuestion.assets ?? [])
        .map((a) => a.imagePath ?? a.croppedImage ?? a.content ?? '')
        .filter(Boolean);
      const { error } = await supabase
        .from('questions')
        .update({
          enunciado_md: mergedQuestion.statement,
          opciones,
          respuesta_correcta: mergedQuestion.correctAnswer,
          tiene_respuesta_oficial: mergedQuestion.correctAnswer !== null,
          explicacion_md: mergedQuestion.explanation ?? null,
          tema: mergedQuestion.topic ?? null,
          imagenes,
        })
        .eq('id', questionId);
      if (error) throw error;
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
      await supabase.from('questions').delete().eq('exam_id', examId);
      const { error } = await supabase.from('exams').delete().eq('id', examId);
      if (error) throw error;
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
      await supabase.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('exams').delete().neq('id', '00000000-0000-0000-0000-000000000000');
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

    const updatedExam: Exam = {
      ...targetExam,
      sections: targetExam.sections.map((section) => ({
        ...section,
        questions: section.questions.filter((q) => q.id !== actualQuestionId),
      })),
    };

    set((state) => ({
      exams: state.exams.map((e) => (e.id === targetExam.id ? updatedExam : e)),
    }));

    try {
      const { error } = await supabase.from('questions').delete().eq('id', actualQuestionId);
      if (error) throw error;
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
