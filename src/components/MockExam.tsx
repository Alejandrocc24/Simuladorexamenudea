import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useAuth } from '../context/AuthContext';
import { Exam, Question, MockExamSession, SectionScoreSummary } from '../types';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Flag, 
  ArrowLeft, 
  ArrowRight, 
  Send, 
  Trophy, 
  RotateCcw, 
  Check, 
  BookOpen,
  HelpCircle,
  BarChart2,
  Calendar,
  Layers,
  Brain
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { SharedContextBox } from './SharedContextBox';
import { MainQuestionAssets, OptionsAssetsBlock, hasSharedContext, sharedAssetsOf } from './QuestionAssets';
import { ReportQuestion } from './ReportQuestion';
import { ConfirmModal } from './ConfirmModal';
import { cn } from './Layout';
import { BlockMath } from 'react-katex';

const DEFAULT_MOCK_DURATION_SECONDS = 3 * 60 * 60; // 3 hours = 10,800 seconds

export function MockExam() {
  const { exams, isLoadingExams, mockSessions, addMockSession } = useStore();
  const { user } = useAuth();

  // Selection & Phase State (las preguntas siempre se eligen al azar entre todas las disponibles)
  const [examPhase, setExamPhase] = useState<'setup' | 'in_progress' | 'results' | 'history'>('setup');
  
  // Active Exam Session State
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  const [flaggedQuestionIds, setFlaggedQuestionIds] = useState<Set<string>>(new Set());
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(DEFAULT_MOCK_DURATION_SECONDS);
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);
  const [completedSession, setCompletedSession] = useState<MockExamSession | null>(null);

  // Review Filter State
  const [reviewFilter, setReviewFilter] = useState<'all' | 'correct' | 'incorrect' | 'flagged' | 'omitted'>('all');

  // Confirm Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Prepare questions pool
  const allAvailableQuestions = useMemo(() => {
    return exams.flatMap(e => e.sections.flatMap(s => s.questions))
      .filter(q => q.status === 'PUBLISHED' || q.status === 'APPROVED');
  }, [exams]);

  // Mezcla aleatoria (Fisher-Yates)
  const shuffle = <T,>(list: T[]): T[] => {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // Simulacro aleatorio: hasta 80 preguntas al azar entre TODAS las disponibles
  // (hasta 40 de Razonamiento Lógico + hasta 40 de Competencia Lectora; si un
  // componente no alcanza, se completa con las restantes).
  const buildExamQuestions = (): Question[] => {
    const logicQuestions = shuffle(allAvailableQuestions.filter(q => q.sectionId === 'razonamiento-logico'));
    const readingQuestions = shuffle(allAvailableQuestions.filter(q => q.sectionId === 'competencia-lectora'));

    const selectedLogic = logicQuestions.slice(0, 40);
    const selectedReading = readingQuestions.slice(0, 40);

    let combined = shuffle([...selectedLogic, ...selectedReading]);
    if (combined.length < 80) {
      const remaining = shuffle(allAvailableQuestions.filter(q => !combined.some(c => c.id === q.id)));
      combined = [...combined, ...remaining.slice(0, 80 - combined.length)];
    }
    return combined;
  };

  // State refs to avoid interval reset on every answer change
  const userAnswersRef = useRef(userAnswers);
  const examQuestionsRef = useRef(examQuestions);
  const sessionStartTimeRef = useRef(sessionStartTime);
  const flaggedQuestionIdsRef = useRef(flaggedQuestionIds);

  useEffect(() => { userAnswersRef.current = userAnswers; }, [userAnswers]);
  useEffect(() => { examQuestionsRef.current = examQuestions; }, [examQuestions]);
  useEffect(() => { sessionStartTimeRef.current = sessionStartTime; }, [sessionStartTime]);
  useEffect(() => { flaggedQuestionIdsRef.current = flaggedQuestionIds; }, [flaggedQuestionIds]);

  const finishMockExamRef = useRef<(forcedByTimer?: boolean) => Promise<void>>(async () => {});

  // Timer Tick
  useEffect(() => {
    if (examPhase !== 'in_progress') return;

    const timer = setInterval(() => {
      setTimeRemainingSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          finishMockExamRef.current(true); // Auto-finish on timeout
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [examPhase]);

  // Start Exam Handler
  const handleStartExam = () => {
    const questions = buildExamQuestions();
    if (questions.length === 0) return;

    setExamQuestions(questions);
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setFlaggedQuestionIds(new Set());
    setTimeRemainingSeconds(DEFAULT_MOCK_DURATION_SECONDS);
    setSessionStartTime(Date.now());
    setCompletedSession(null);
    setExamPhase('in_progress');
  };

  // Option Select Handler
  const handleSelectOption = (questionId: string, optionId: 'A' | 'B' | 'C' | 'D') => {
    setUserAnswers(prev => {
      // Toggle or set
      if (prev[questionId] === optionId) {
        const next = { ...prev };
        delete next[questionId];
        return next;
      }
      return { ...prev, [questionId]: optionId };
    });
  };

  // Toggle Flag
  const handleToggleFlag = (questionId: string) => {
    setFlaggedQuestionIds(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };

  // Calculate & Finish Exam
  const finishMockExam = async (forcedByTimer = false) => {
    const currentQList = examQuestionsRef.current;
    const currentAnswers = userAnswersRef.current;
    const currentFlags = flaggedQuestionIdsRef.current;
    const currentStart = sessionStartTimeRef.current;

    const endTime = Date.now();
    const timeSpentSeconds = Math.max(1, Math.round((endTime - currentStart) / 1000));
    
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    const sectionBreakdown: Record<string, SectionScoreSummary> = {};

    currentQList.forEach(q => {
      const secId = q.sectionId || 'general';
      const secName = secId === 'razonamiento-logico' ? 'Razonamiento Lógico' :
                      secId === 'competencia-lectora' ? 'Competencia Lectora' : 'Área General';

      if (!sectionBreakdown[secId]) {
        sectionBreakdown[secId] = {
          sectionId: secId,
          sectionName: secName,
          total: 0,
          answered: 0,
          correct: 0,
          percentage: 0
        };
      }

      sectionBreakdown[secId].total += 1;

      const answer = currentAnswers[q.id];
      if (!answer) {
        unansweredCount += 1;
      } else {
        sectionBreakdown[secId].answered += 1;
        if (q.correctAnswer && answer === q.correctAnswer) {
          correctCount += 1;
          sectionBreakdown[secId].correct += 1;
        } else {
          incorrectCount += 1;
        }
      }
    });

    // Calculate section percentages
    Object.keys(sectionBreakdown).forEach(key => {
      const s = sectionBreakdown[key];
      s.percentage = s.total > 0 ? Math.round((s.correct / s.total) * 1000) / 10 : 0;
    });

    const totalQuestions = currentQList.length;
    const answeredCount = totalQuestions - unansweredCount;
    const overallScorePercentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 1000) / 10 : 0;

    const examTitle = 'Simulacro Aleatorio UdeA (preguntas al azar)';

    const session: MockExamSession = {
      id: `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: user?.id,
      examId: 'aleatorio',
      examTitle,
      startTime: currentStart,
      endTime,
      durationSeconds: DEFAULT_MOCK_DURATION_SECONDS,
      timeSpentSeconds,
      answers: currentAnswers,
      flaggedQuestionIds: Array.from(currentFlags),
      totalQuestions,
      answeredCount,
      correctCount,
      incorrectCount,
      unansweredCount,
      overallScorePercentage,
      sectionBreakdown,
      completedAt: new Date().toISOString()
    };

    setCompletedSession(session);
    setExamPhase('results');

    // Save session to storage
    try {
      await addMockSession(session, user?.id);
    } catch (err) {
      console.warn('Error al guardar sesión de simulacro en almacenamiento:', err);
    }
  };

  useEffect(() => {
    finishMockExamRef.current = finishMockExam;
  });

  // Format Time Helper
  const formatSeconds = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Loading indicator
  if (isLoadingExams) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Cargando simulacro UdeA...</p>
      </div>
    );
  }

  // 1. NO EXAMS EMPTY STATE
  if (exams.length === 0 && allAvailableQuestions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm my-12 animate-in fade-in">
        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <BookOpen className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white">No hay preguntas disponibles</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
          Carga un archivo JSON desde el panel de Administración y publica preguntas para habilitar los simulacros.
        </p>
      </div>
    );
  }

  // 2. SETUP & INSTRUCTIONS SCREEN
  if (examPhase === 'setup') {
    const logicAvailable = allAvailableQuestions.filter(q => q.sectionId === 'razonamiento-logico').length;
    const readingAvailable = allAvailableQuestions.filter(q => q.sectionId === 'competencia-lectora').length;
    // Tamaño del simulacro que se armará al azar (hasta 40 RL + 40 CL, máx. 80)
    const previewTotal = Math.min(80, allAvailableQuestions.length);
    const recentSessions = mockSessions.slice(0, 5);

    return (
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-8 animate-in fade-in">
        {/* Header Hero - Institutional UdeA Green */}
        <div className="bg-gradient-to-r from-[#005F2B] via-[#005526] to-[#004720] rounded-3xl p-6 md:p-8 text-white shadow-lg border border-[#004720]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider text-emerald-200 border border-white/10">
                Condiciones Reales de Admisión
              </span>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">Simulacro Oficial UdeA</h1>
              <p className="text-emerald-100 text-sm md:text-base max-w-xl leading-relaxed">
                Mide tu preparación para el examen de la Universidad de Antioquia bajo condiciones estrictas: 
                80 preguntas, cronómetro de 3 horas y evaluación analítica por áreas.
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-5 rounded-2xl border border-white/15 text-center min-w-[160px]">
              <Clock className="w-8 h-8 mx-auto text-emerald-200 mb-1" />
              <span className="text-2xl font-black block">3 Horas</span>
              <span className="text-xs text-emerald-200 uppercase tracking-wider font-semibold">180 Minutos</span>
            </div>
          </div>
        </div>

        {/* Configuration Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-[#005F2B] dark:text-emerald-400" />
              Simulacro aleatorio
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-gray-900 dark:text-white">{logicAvailable}</p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Razonamiento Lógico</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-gray-900 dark:text-white">{readingAvailable}</p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Competencia Lectora</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Al comenzar se eligen <strong>al azar hasta 40 de RL + 40 de CL</strong> (máx. 80) entre todas las
              preguntas publicadas, sin importar de qué examen vengan. Cada intento es diferente.
            </p>

            {/* Exam Rules Summary */}
            <div className="bg-[#005F2B]/5 dark:bg-[#005F2B]/20 rounded-2xl p-5 border border-[#005F2B]/20 space-y-3">
              <h3 className="text-sm font-bold text-[#005F2B] dark:text-emerald-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#005F2B] dark:text-emerald-400" />
                Reglas y Condiciones del Simulacro
              </h3>
              <ul className="text-xs text-gray-700 dark:text-emerald-100/90 space-y-2 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#005F2B] dark:bg-emerald-400 mt-1.5 flex-shrink-0" />
                  <span><strong>Total Preguntas:</strong> {previewTotal} preguntas al azar de Razonamiento Lógico y Competencia Lectora.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#005F2B] dark:bg-emerald-400 mt-1.5 flex-shrink-0" />
                  <span><strong>Retroalimentación:</strong> No se mostrarán respuestas correctas ni explicaciones hasta que finalices el examen.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#005F2B] dark:bg-emerald-400 mt-1.5 flex-shrink-0" />
                  <span><strong>Navegación:</strong> Puedes saltar libremente entre preguntas y marcarlas con bandera para revisarlas antes de entregar.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#005F2B] dark:bg-emerald-400 mt-1.5 flex-shrink-0" />
                  <span><strong>Tiempo:</strong> Al agotarse las 3 horas, el simulacro se entregará automáticamente.</span>
                </li>
              </ul>
            </div>

            <button 
              onClick={handleStartExam}
              disabled={previewTotal === 0}
              className="w-full flex items-center justify-center gap-3 py-4 bg-[#005F2B] hover:bg-[#004D23] disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all text-base cursor-pointer"
            >
              Comenzar Simulacro Ahora
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* Past Attempts Quick Widget */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Historial Reciente
            </h3>

            {recentSessions.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs">
                Aún no has completado ningún simulacro. Tu historial se guardará aquí.
              </div>
            ) : (
              <div className="space-y-3">
                {recentSessions.map((sess) => (
                  <div 
                    key={sess.id}
                    onClick={() => {
                      setCompletedSession(sess);
                      setExamPhase('results');
                    }}
                    className="p-3 bg-gray-50 dark:bg-gray-900/50 hover:bg-[#005F2B]/5 dark:hover:bg-[#005F2B]/20 rounded-xl border border-gray-100 dark:border-gray-800 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-gray-900 dark:text-white">
                        {sess.overallScorePercentage}%
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {sess.completedAt ? new Date(sess.completedAt).toLocaleDateString() : 'Reciente'}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between">
                      <span>{sess.correctCount} / {sess.totalQuestions} aciertos</span>
                      <span className="text-[#005F2B] dark:text-emerald-400 font-semibold">Ver detalles →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. ACTIVE EXAM VIEW
  if (examPhase === 'in_progress') {
    const currentQ = examQuestions[currentQuestionIndex];
    if (!currentQ) return null;

    const isFlagged = flaggedQuestionIds.has(currentQ.id);
    const selectedAnswer = userAnswers[currentQ.id];
    const answeredCount = Object.keys(userAnswers).length;
    const isTimeUrgent = timeRemainingSeconds < 15 * 60; // Less than 15 minutes left

    return (
      <div className="max-w-6xl mx-auto py-4 px-0 sm:px-4 space-y-4 animate-in fade-in">
        {/* Sticky Control Header: en móvil ocupa 2 filas compactas */}
        <div className="sticky top-2 md:top-16 z-20 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-2xl p-3 sm:p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Left info */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#005F2B]/10 dark:bg-[#005F2B]/30 text-[#005F2B] dark:text-emerald-400 flex items-center justify-center font-bold text-sm flex-shrink-0">
              Q{currentQuestionIndex + 1}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[13px] sm:text-sm text-gray-900 dark:text-white truncate">
                Pregunta {currentQuestionIndex + 1} de {examQuestions.length}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                {currentQ.sectionId === 'razonamiento-logico' ? 'Razonamiento Lógico' : 'Competencia Lectora'}
              </p>
            </div>
          </div>

          {/* Center Timer */}
          <div className={cn(
            "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl font-mono text-sm sm:text-base font-black transition-colors flex-shrink-0",
            isTimeUrgent
              ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900 animate-pulse"
              : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
          )}>
            <Clock className="w-4 h-4" />
            <span>{formatSeconds(timeRemainingSeconds)}</span>
          </div>

          {/* Right Action: Finish Button */}
          <button
            onClick={() => {
              const remainingCount = examQuestions.length - answeredCount;
              setConfirmModal({
                isOpen: true,
                title: '¿Finalizar y calificar simulacro?',
                message: remainingCount > 0 
                  ? `Tienes ${remainingCount} preguntas sin responder de un total de ${examQuestions.length}. ¿Deseas entregar el simulacro de todos modos?`
                  : `Has respondido las ${examQuestions.length} preguntas. ¿Confirmas la entrega final de tu simulacro?`,
                confirmLabel: 'Entregar Simulacro',
                onConfirm: () => {
                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                  finishMockExam(false);
                }
              });
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Finalizar Examen</span>
          </button>
        </div>

        {/* Progress Strip */}
        <div className="bg-white dark:bg-gray-800 rounded-xl px-3 sm:px-4 py-2.5 border border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-x-4 gap-y-2 justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Respondidas: <strong className="text-emerald-600">{answeredCount}</strong></span>
            <span className="hidden sm:inline">Sin responder: <strong className="text-gray-700 dark:text-gray-300">{examQuestions.length - answeredCount}</strong></span>
            <span>Marcadas: <strong className="text-amber-500">{flaggedQuestionIds.size}</strong></span>
          </div>
          <div className="w-24 sm:w-32 bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-emerald-500 h-full transition-all duration-300"
              style={{ width: `${(answeredCount / examQuestions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Two-Column Grid: Question Details & Navigation Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Question Panel (3 cols) */}
          <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-3xl p-4 sm:p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 space-y-6 min-w-0">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-2">
                {currentQ.category && (
                  <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/60 rounded-full text-xs font-bold">
                    {currentQ.category}
                  </span>
                )}
                <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs font-bold uppercase">
                  {currentQ.topic}
                </span>
                <span className={cn(
                  "text-xs font-bold uppercase px-3 py-1 rounded-full",
                  currentQ.difficulty === 'easy' ? "text-green-700 bg-green-50 dark:bg-green-950/40" :
                  currentQ.difficulty === 'medium' ? "text-amber-700 bg-amber-50 dark:bg-amber-950/40" :
                  "text-red-700 bg-red-50 dark:bg-red-950/40"
                )}>
                  {currentQ.difficulty === 'easy' ? 'Fácil' : currentQ.difficulty === 'medium' ? 'Media' : 'Difícil'}
                </span>
              </div>

              <button
                onClick={() => handleToggleFlag(currentQ.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border",
                  isFlagged 
                    ? "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300" 
                    : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400"
                )}
              >
                <Flag className={cn("w-3.5 h-3.5", isFlagged && "fill-amber-500 text-amber-500")} />
                <span>{isFlagged ? 'Marcada' : 'Marcar para revisar'}</span>
              </button>
              <ReportQuestion questionId={currentQ.id} questionNumber={currentQ.number} />
            </div>

            {/* Shared Context Text if present */}
            <SharedContextBox 
              sharedTexts={exams.find(e => e.id === currentQ.examId)?.sharedTexts} 
              questionNumber={currentQ.number}
              sharedImages={sharedAssetsOf(currentQ.assets)}
            />

            {/* Statement */}
            <div className="text-gray-900 dark:text-white text-base sm:text-lg leading-relaxed font-medium break-words">
              <MathRenderer text={currentQ.statement} />
            </div>

            {/* Figuras del enunciado/tabla (sin el bloque de opciones ni el contexto ya mostrado) */}
            <MainQuestionAssets
              assets={currentQ.assets}
              sharedShown={hasSharedContext(exams.find(e => e.id === currentQ.examId)?.sharedTexts, currentQ.number)}
            />

            {/* Bloque de opciones en figura, separado justo encima de los botones */}
            <OptionsAssetsBlock assets={currentQ.assets} />

            {/* Options List (Clean selectable, NO answers revealed) */}
            <div className="space-y-3 pt-4">
              {currentQ.options.map((opt) => {
                const isSelected = selectedAnswer === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelectOption(currentQ.id, opt.id)}
                    className={cn(
                      "w-full text-left p-4 rounded-2xl border-2 transition-all flex items-start gap-4 cursor-pointer",
                      isSelected 
                        ? "border-[#005F2B] bg-[#005F2B]/10 dark:bg-[#005F2B]/20 text-[#005F2B] dark:text-emerald-100 font-semibold shadow-sm" 
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                    )}
                  >
                    <span className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5 border-2 transition-colors",
                      isSelected 
                        ? "border-[#005F2B] bg-[#005F2B] text-white" 
                        : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900"
                    )}>
                      {opt.id}
                    </span>
                    <span className="flex-1 text-base leading-relaxed pt-1">
                      <MathRenderer text={opt.text} />
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-6 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                disabled={currentQuestionIndex === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Anterior
              </button>

              <button
                onClick={() => setCurrentQuestionIndex(prev => Math.min(examQuestions.length - 1, prev + 1))}
                disabled={currentQuestionIndex === examQuestions.length - 1}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#005F2B] hover:bg-[#004D23] text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Siguiente
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sidebar Navigation Grid (1 col) */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4 max-h-[80vh] flex flex-col">
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-2">Cuadrícula de Preguntas</h3>
              {/* Legend */}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 pb-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-emerald-500" />
                  <span>Respondida</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-amber-400" />
                  <span>Marcada</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md border border-gray-300 bg-gray-50 dark:bg-gray-900" />
                  <span>Sin responder</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md border-2 border-[#005F2B]" />
                  <span>Actual</span>
                </div>
              </div>
            </div>

            {/* Questions Grid 1..80 */}
            <div className="overflow-y-auto flex-1 grid grid-cols-5 gap-1.5 p-1">
              {examQuestions.map((q, idx) => {
                const isAnswered = Boolean(userAnswers[q.id]);
                const isQFlagged = flaggedQuestionIds.has(q.id);
                const isCurrent = idx === currentQuestionIndex;

                let cellStyle = "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50";
                if (isAnswered) {
                  cellStyle = "bg-emerald-500 text-white font-bold border-emerald-600";
                }
                if (isQFlagged) {
                  cellStyle = isAnswered 
                    ? "bg-emerald-500 text-white font-bold ring-2 ring-amber-400" 
                    : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold border-amber-400";
                }
                if (isCurrent) {
                  cellStyle += " ring-2 ring-[#005F2B] ring-offset-2 dark:ring-offset-gray-800 scale-105";
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestionIndex(idx)}
                    className={cn(
                      "h-9 rounded-xl text-xs font-semibold flex items-center justify-center border transition-all relative",
                      cellStyle
                    )}
                    title={`Pregunta ${idx + 1}`}
                  >
                    {idx + 1}
                    {isQFlagged && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* In-app Confirm Modal */}
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        />
      </div>
    );
  }

  // 4. RESULTS & REVIEW SCREEN
  if (examPhase === 'results' && completedSession) {
    const session = completedSession;
    
    // Filter questions for review mode
    const reviewQuestions = examQuestions.filter(q => {
      const ans = session.answers[q.id];
      const isCorrect = q.correctAnswer && ans === q.correctAnswer;
      const isFlagged = session.flaggedQuestionIds?.includes(q.id);

      if (reviewFilter === 'correct') return isCorrect;
      if (reviewFilter === 'incorrect') return ans && !isCorrect;
      if (reviewFilter === 'omitted') return !ans;
      if (reviewFilter === 'flagged') return isFlagged;
      return true;
    });

    return (
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-8 animate-in fade-in">
        {/* Score Banner */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 pb-8 border-b border-gray-100 dark:border-gray-700">
            <div className="space-y-2 text-center md:text-left">
              <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold rounded-full uppercase">
                Simulacro Completado
              </span>
              <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white">
                Resultado de tu Simulacro
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {session.examTitle} • Finalizado el {new Date(session.completedAt).toLocaleString()}
              </p>
            </div>

            {/* Score Big Pill */}
            <div className="flex items-center gap-6">
              <div className="text-center">
                <span className="text-5xl font-black text-emerald-600 dark:text-emerald-400 block">
                  {session.overallScorePercentage}%
                </span>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Calificación Global
                </span>
              </div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 text-center">
              <span className="text-xs text-gray-500 block mb-1">Aciertos</span>
              <span className="text-2xl font-black text-emerald-600">{session.correctCount}</span>
              <span className="text-[11px] text-gray-400 block">de {session.totalQuestions}</span>
            </div>

            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 text-center">
              <span className="text-xs text-gray-500 block mb-1">Errores</span>
              <span className="text-2xl font-black text-red-500">{session.incorrectCount}</span>
              <span className="text-[11px] text-gray-400 block">de {session.totalQuestions}</span>
            </div>

            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 text-center">
              <span className="text-xs text-gray-500 block mb-1">Omitidas</span>
              <span className="text-2xl font-black text-amber-500">{session.unansweredCount}</span>
              <span className="text-[11px] text-gray-400 block">de {session.totalQuestions}</span>
            </div>

            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 text-center">
              <span className="text-xs text-gray-500 block mb-1">Tiempo Empleado</span>
              <span className="text-2xl font-black text-gray-900 dark:text-white">
                {Math.floor(session.timeSpentSeconds / 60)}m
              </span>
              <span className="text-[11px] text-gray-400 block">{session.timeSpentSeconds % 60}s</span>
            </div>
          </div>
        </div>

        {/* Breakdown by Areas */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-[#005F2B] dark:text-emerald-400" />
            Desglose Oficial por Áreas
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.values(session.sectionBreakdown).map((sec) => (
              <div key={sec.sectionId} className="p-5 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-gray-900 dark:text-white">{sec.sectionName}</h4>
                  <span className="text-base font-black text-[#005F2B] dark:text-emerald-400">{sec.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#005F2B] h-full rounded-full transition-all"
                    style={{ width: `${sec.percentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Aciertos: {sec.correct} de {sec.total}</span>
                  <span>Respondidas: {sec.answered}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Solution Review Mode */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-xl text-gray-900 dark:text-white">
                Revisión Detallada de Preguntas
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Examina cada respuesta, explicación pedagógica y alternativa correcta.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-900 p-1.5 rounded-2xl overflow-x-auto text-xs font-semibold">
              <button
                onClick={() => setReviewFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap",
                  reviewFilter === 'all' ? "bg-white dark:bg-gray-800 shadow-sm text-gray-900 dark:text-white font-bold" : "text-gray-500 hover:text-gray-800"
                )}
              >
                Todas ({examQuestions.length})
              </button>
              <button
                onClick={() => setReviewFilter('incorrect')}
                className={cn(
                  "px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap text-red-600",
                  reviewFilter === 'incorrect' ? "bg-white dark:bg-gray-800 shadow-sm font-bold" : "hover:text-red-700"
                )}
              >
                Incorrectas ({session.incorrectCount})
              </button>
              <button
                onClick={() => setReviewFilter('correct')}
                className={cn(
                  "px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap text-emerald-600",
                  reviewFilter === 'correct' ? "bg-white dark:bg-gray-800 shadow-sm font-bold" : "hover:text-emerald-700"
                )}
              >
                Correctas ({session.correctCount})
              </button>
              <button
                onClick={() => setReviewFilter('omitted')}
                className={cn(
                  "px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap text-amber-600",
                  reviewFilter === 'omitted' ? "bg-white dark:bg-gray-800 shadow-sm font-bold" : "hover:text-amber-700"
                )}
              >
                Omitidas ({session.unansweredCount})
              </button>
            </div>
          </div>

          {/* List of Questions */}
          <div className="space-y-6 pt-2">
            {reviewQuestions.map((q, idx) => {
              const userAnswer = session.answers[q.id];
              const isCorrect = q.correctAnswer && userAnswer === q.correctAnswer;
              const isOmitted = !userAnswer;

              return (
                <div 
                  key={q.id}
                  className="p-6 rounded-2xl bg-gray-50/50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-900 dark:text-white">
                        Pregunta #{q.number}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">
                        ({q.sectionId === 'razonamiento-logico' ? 'Razonamiento Lógico' : 'Competencia Lectora'})
                      </span>
                    </div>

                    <div className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase",
                      isCorrect ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" :
                      isOmitted ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" :
                      "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                    )}>
                      {isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> : isOmitted ? <AlertCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      <span>{isCorrect ? 'Correcta' : isOmitted ? 'No Respondida' : 'Incorrecta'}</span>
                    </div>
                  </div>

                  {/* Statement */}
                  <div className="text-gray-900 dark:text-white text-base">
                    <MathRenderer text={q.statement} />
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                    {q.options.map((opt) => {
                      const isChosen = userAnswer === opt.id;
                      const isAnswerKey = q.correctAnswer === opt.id;

                      let optBoxStyle = "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300";
                      if (isAnswerKey) {
                        optBoxStyle = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 font-bold";
                      } else if (isChosen && !isAnswerKey) {
                        optBoxStyle = "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-950 dark:text-red-100 line-through";
                      }

                      return (
                        <div 
                          key={opt.id}
                          className={cn("p-3 rounded-xl border flex items-start gap-2.5 text-xs", optBoxStyle)}
                        >
                          <span className="font-bold flex-shrink-0">{opt.id}.</span>
                          <span className="flex-1"><MathRenderer text={opt.text} /></span>
                          {isAnswerKey && <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-black ml-auto">CORRECTA</span>}
                          {isChosen && !isAnswerKey && <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-black ml-auto">TU OPCIÓN</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  {q.explanation && (
                    <div className="p-4 rounded-xl bg-[#005F2B]/5 dark:bg-[#005F2B]/20 border border-[#005F2B]/20 text-xs text-[#005F2B] dark:text-emerald-200 space-y-1">
                      <strong className="flex items-center gap-1.5 text-[#005F2B] dark:text-emerald-300">
                        <Brain className="w-3.5 h-3.5" />
                        Explicación Pedagógica:
                      </strong>
                      <div className="leading-relaxed text-gray-800 dark:text-gray-200">
                        <MathRenderer text={q.explanation} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row gap-4 justify-between items-center">
            <button
              onClick={() => setExamPhase('setup')}
              className="flex items-center gap-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Realizar Otro Simulacro
            </button>
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              className="px-6 py-2.5 bg-[#005F2B] hover:bg-[#004D23] text-white rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer"
            >
              Volver al Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
