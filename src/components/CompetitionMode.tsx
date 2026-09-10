import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../store/useStore';
import { Question } from '../types';
import { 
  createMatchRoom, 
  joinMatchByCode, 
  subscribeToMatch, 
  submitMatchAnswer, 
  subscribeToLeaderboard, 
  recordUserMatchResult,
  leaveMatch,
  cleanupStaleMatches,
  MatchRoom, 
  PublicLeaderboardUser 
} from '../services/competitionService';
import { MathRenderer } from './MathRenderer';
import { ConfirmModal } from './ConfirmModal';
import { 
  Swords, 
  Trophy, 
  Users, 
  Zap, 
  Copy, 
  Check, 
  LogIn, 
  ArrowRight, 
  Crown, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { cn } from './Layout';

export function CompetitionMode() {
  const { user, profile, loading: authLoading } = useAuth();
  const { exams } = useStore();

  const [activeTab, setActiveTab] = useState<'arena' | 'ranking'>('arena');
  const [selectedSection, setSelectedSection] = useState<'all' | 'razonamiento-logico' | 'competencia-lectora'>('all');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [joinCode, setJoinCode] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Active match state
  const [activeMatch, setActiveMatch] = useState<MatchRoom | null>(null);
  const activeMatchRef = useRef<MatchRoom | null>(null);
  useEffect(() => {
    activeMatchRef.current = activeMatch;
  }, [activeMatch]);

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hasAnsweredCurrent, setHasAnsweredCurrent] = useState(false);
  const [matchProcessed, setMatchProcessed] = useState(false);
  const processedMatchesRef = useRef<Set<string>>(new Set());

  // In-app Confirm Modal State (Never use window.confirm)
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

  // Real-time Leaderboard
  const [leaderboard, setLeaderboard] = useState<PublicLeaderboardUser[]>([]);

  // Collect all questions pool
  const allAvailableQuestions = useMemo(() => {
    return exams.flatMap(e => 
      e.sections
        .filter(s => selectedSection === 'all' || s.id === selectedSection)
        .flatMap(s => s.questions)
    );
  }, [exams, selectedSection]);

  // Clean stale matches on mount
  useEffect(() => {
    cleanupStaleMatches();
  }, []);

  // Subscribe to Leaderboard
  useEffect(() => {
    const unsub = subscribeToLeaderboard((players) => {
      setLeaderboard(players);
    });
    return () => unsub();
  }, []);

  // Subscribe to active match in real-time
  useEffect(() => {
    if (!activeMatch?.id) return;

    const unsub = subscribeToMatch(activeMatch.id, (updatedMatch) => {
      setActiveMatch(updatedMatch);

      // Handle match completion rating update atomically without duplicates
      if (updatedMatch.status === 'completed' && user && !processedMatchesRef.current.has(updatedMatch.id)) {
        processedMatchesRef.current.add(updatedMatch.id);
        setMatchProcessed(true);
        const isWinner = updatedMatch.winnerId === user.id;
        const isDraw = updatedMatch.winnerId === 'draw';
        recordUserMatchResult(user.id, isWinner, isDraw);
      }
    }, () => {
      setErrorMessage('Error de sincronización con la sala.');
    });

    return () => unsub();
  }, [activeMatch?.id, user]);

  // Current question data inside an active match
  const currentQuestionData: Question | null = useMemo(() => {
    if (!activeMatch) return null;
    const isHost = user?.id === activeMatch.hostId;
    const currentIndex = isHost ? activeMatch.hostCurrentQuestion : activeMatch.guestCurrentQuestion;
    const targetId = activeMatch.questionIds[currentIndex];
    if (!targetId) return null;

    // Search in exams
    for (const ex of exams) {
      for (const sec of ex.sections) {
        const found = sec.questions.find(q => q.id === targetId);
        if (found) return found;
      }
    }
    return null;
  }, [activeMatch, user, exams]);

  // Create Room Handler
  const handleCreateRoom = async () => {
    if (!profile) return;
    setIsActionLoading(true);
    setErrorMessage(null);

    try {
      // Pick random questions from pool
      let pool = [...allAvailableQuestions];
      if (pool.length === 0) {
        // Fallback: any question in exams
        pool = exams.flatMap(e => e.sections.flatMap(s => s.questions));
      }

      if (pool.length === 0) {
        setErrorMessage('Debes tener preguntas importadas para poder competir.');
        setIsActionLoading(false);
        return;
      }

      // Shuffle and take count
      const shuffled = [...pool].sort(() => 0.5 - Math.random());
      const selectedQuestions = shuffled.slice(0, Math.min(questionCount, shuffled.length));
      const qIds = selectedQuestions.map(q => q.id);

      // Build authoritative answers map for anti-cheat verification
      const answersKey: Record<string, string> = {};
      selectedQuestions.forEach(q => {
        if (q.correctAnswer) {
          answersKey[q.id] = q.correctAnswer;
        }
      });

      const room = await createMatchRoom(profile, selectedSection, qIds, answersKey);
      setActiveMatch(room);
      setMatchProcessed(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al crear la sala');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Join Room Handler
  const handleJoinRoom = async () => {
    if (!profile || !joinCode.trim()) return;
    setIsActionLoading(true);
    setErrorMessage(null);

    try {
      const room = await joinMatchByCode(joinCode.trim(), profile);
      setActiveMatch(room);
      setMatchProcessed(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'No se pudo unir a la sala');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Submit Answer in Battle
  const handleSelectOption = async (optionId: string) => {
    const match = activeMatchRef.current;
    if (hasAnsweredCurrent || !match || !currentQuestionData || !user) return;
    setSelectedAnswer(optionId);
    setHasAnsweredCurrent(true);

    const isHost = user.id === match.hostId;
    const currentIndex = isHost ? match.hostCurrentQuestion : match.guestCurrentQuestion;
    const currentScore = isHost ? match.hostScore : match.guestScore;

    // Small delay for answer feedback visual
    setTimeout(async () => {
      try {
        const freshMatch = activeMatchRef.current;
        if (!freshMatch) return;
        await submitMatchAnswer(
          freshMatch.id,
          isHost,
          optionId,
          currentIndex,
          freshMatch.totalQuestions,
          currentScore
        );
      } catch (err) {
        console.error('Error al registrar respuesta en la sala:', err);
      } finally {
        setSelectedAnswer(null);
        setHasAnsweredCurrent(false);
      }
    }, 600);
  };

  const copyRoomCode = () => {
    if (!activeMatch?.code) return;
    navigator.clipboard.writeText(activeMatch.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // 1. Not Logged In View
  if (!user && !authLoading) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 md:p-12 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Swords className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-3">
            Modo Competir: Duelos 1 vs 1 UdeA
          </h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto mb-8 text-base leading-relaxed">
            Inicia sesión con tu cuenta para retar a otros aspirantes en tiempo real,
            ganar puntos de Rating ELO y subir a la tabla oficial de clasificados.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-3 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md transition-all hover:scale-105"
          >
            <LogIn className="w-5 h-5" />
            Ir al inicio de sesión
          </Link>
        </div>
      </div>
    );
  }

  // 2. Active Match View: Waiting for opponent
  if (activeMatch && activeMatch.status === 'waiting') {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-full mb-6 animate-pulse">
            <Clock className="w-3.5 h-3.5" />
            Esperando al rival...
          </div>

          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Código de tu Sala</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Comparte este código con tu compañero o amigo para que ingrese desde su cuenta:
          </p>

          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-2 border-dashed border-emerald-500 font-mono text-3xl font-black tracking-widest text-emerald-600 dark:text-emerald-400">
              {activeMatch.code}
            </div>
            <button
              onClick={copyRoomCode}
              className="p-4 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-2xl transition-colors"
              title="Copiar código"
            >
              {copiedCode ? <Check className="w-6 h-6 text-emerald-600" /> : <Copy className="w-6 h-6" />}
            </button>
          </div>

          <div className="flex items-center justify-center gap-4 py-4 border-t border-gray-100 dark:border-gray-700 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                {profile?.displayName?.charAt(0) || 'U'}
              </div>
              <div className="text-left">
                <p className="font-bold text-sm text-gray-900 dark:text-white">{profile?.displayName}</p>
                <p className="text-xs text-gray-500">Anfitrión (Rating {profile?.rating})</p>
              </div>
            </div>
            <span className="text-xs font-bold text-gray-400">VS</span>
            <div className="text-left text-gray-400 italic text-sm">
              Esperando rival...
            </div>
          </div>

          <button
            onClick={() => {
              if (user && activeMatch) {
                leaveMatch(activeMatch.id, user.id);
              }
              setActiveMatch(null);
            }}
            className="text-sm text-gray-500 hover:text-red-500 transition-colors"
          >
            Cancelar y salir de la sala
          </button>
        </div>
      </div>
    );
  }

  // 3. Active Battle Arena (In Progress or Completed)
  if (activeMatch && (activeMatch.status === 'in_progress' || activeMatch.status === 'completed')) {
    const isHost = user?.id === activeMatch.hostId;
    const myScore = isHost ? activeMatch.hostScore : activeMatch.guestScore;
    const rivalScore = isHost ? activeMatch.guestScore : activeMatch.hostScore;
    const myName = isHost ? activeMatch.hostName : activeMatch.guestName;
    const rivalName = isHost ? activeMatch.guestName : activeMatch.hostName;
    const myCurrentQ = isHost ? activeMatch.hostCurrentQuestion : activeMatch.guestCurrentQuestion;
    const rivalCurrentQ = isHost ? activeMatch.guestCurrentQuestion : activeMatch.hostCurrentQuestion;

    const isFinishedForMe = myCurrentQ >= activeMatch.totalQuestions;

    return (
      <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
        {/* Battle Live Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between gap-4 mb-4">
            {/* Player Left (Me) */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-black text-lg shadow-sm">
                {myName?.charAt(0)}
              </div>
              <div>
                <p className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                  {myName} <span className="text-xs font-normal text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">Tú</span>
                </p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{myScore} <span className="text-xs font-medium text-gray-400">pts</span></p>
              </div>
            </div>

            <div className="flex flex-col items-center">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-full">
                <Swords className="w-6 h-6 animate-pulse" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 mt-1">DUELO UdeA</span>
              {activeMatch.status === 'in_progress' && (
                <button
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: '¿Abandonar partida?',
                      message: 'Si abandonas el duelo ahora, se considerará derrota y tu rival ganará los puntos.',
                      confirmLabel: 'Abandonar',
                      onConfirm: async () => {
                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        if (user && activeMatch) {
                          await leaveMatch(activeMatch.id, user.id);
                        }
                      }
                    });
                  }}
                  className="mt-1 text-[11px] text-red-500 hover:text-red-700 hover:underline"
                >
                  Rendirse
                </button>
              )}
            </div>

            {/* Player Right (Rival) */}
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-1.5 justify-end">
                  <span className="text-xs font-normal text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full">Rival</span> {rivalName || 'Oponente'}
                </p>
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{rivalScore} <span className="text-xs font-medium text-gray-400">pts</span></p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center font-black text-lg shadow-sm">
                {rivalName?.charAt(0) || 'R'}
              </div>
            </div>
          </div>

          {/* Progress Indicators */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-xs">
            <div>
              <div className="flex justify-between font-semibold mb-1 text-gray-600 dark:text-gray-400">
                <span>Tu progreso</span>
                <span>{Math.min(myCurrentQ, activeMatch.totalQuestions)} / {activeMatch.totalQuestions}</span>
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${(Math.min(myCurrentQ, activeMatch.totalQuestions) / activeMatch.totalQuestions) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-semibold mb-1 text-gray-600 dark:text-gray-400">
                <span>Progreso del rival</span>
                <span>{Math.min(rivalCurrentQ, activeMatch.totalQuestions)} / {activeMatch.totalQuestions}</span>
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${(Math.min(rivalCurrentQ, activeMatch.totalQuestions) / activeMatch.totalQuestions) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Question Area or Finished Waiting Screen */}
        {isFinishedForMe && activeMatch.status !== 'completed' ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">¡Has terminado tus preguntas!</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6">
              Esperando a que tu rival termine de responder para calcular el resultado final y actualizar el rating.
            </p>
          </div>
        ) : activeMatch.status === 'completed' ? (
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 md:p-12 text-center shadow-sm border border-gray-100 dark:border-gray-700">
            {activeMatch.winnerId === user?.id ? (
              <div>
                <div className="w-20 h-20 bg-amber-50 dark:bg-amber-950/40 text-amber-500 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <Crown className="w-10 h-10" />
                </div>
                <h3 className="text-3xl font-black text-gray-900 dark:text-white mb-2">¡VICTORIA! 🏆</h3>
                <p className="text-emerald-600 dark:text-emerald-400 font-bold text-lg mb-6">+25 Puntos de Rating ELO</p>
              </div>
            ) : activeMatch.winnerId === 'draw' ? (
              <div>
                <div className="w-20 h-20 bg-blue-50 dark:bg-blue-950/40 text-blue-500 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-10 h-10" />
                </div>
                <h3 className="text-3xl font-black text-gray-900 dark:text-white mb-2">¡EMPATE TÉCNICO!</h3>
                <p className="text-blue-600 font-bold text-lg mb-6">+5 Puntos de Rating ELO</p>
              </div>
            ) : (
              <div>
                <div className="w-20 h-20 bg-red-50 dark:bg-red-950/40 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-10 h-10" />
                </div>
                <h3 className="text-3xl font-black text-gray-900 dark:text-white mb-2">DERROTA</h3>
                <p className="text-red-500 font-bold text-lg mb-6">-15 Puntos de Rating ELO</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl mb-8 text-sm">
              <div>
                <p className="text-gray-400 text-xs">Puntaje Final</p>
                <p className="font-extrabold text-lg text-emerald-600">{myScore} pts</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Puntaje Rival</p>
                <p className="font-extrabold text-lg text-indigo-600">{rivalScore} pts</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => {
                  setActiveMatch(null);
                  handleCreateRoom();
                }}
                className="w-full sm:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Swords className="w-4 h-4" />
                Crear Revancha (Nueva Sala)
              </button>
              <button
                onClick={() => setActiveMatch(null)}
                className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all"
              >
                Volver al Lobby de Competencia
              </button>
            </div>
          </div>
        ) : currentQuestionData ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
            <div className="flex items-center justify-between text-xs text-gray-500 border-b border-gray-100 dark:border-gray-700 pb-4">
              <span className="font-bold text-emerald-600 uppercase tracking-wider">
                Pregunta {myCurrentQ + 1} de {activeMatch.totalQuestions}
              </span>
              <span className="font-semibold bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-md">
                {currentQuestionData.sectionId}
              </span>
            </div>

            {/* Statement */}
            <div className="text-base md:text-lg text-gray-800 dark:text-gray-200 leading-relaxed font-medium">
              <MathRenderer text={currentQuestionData.statement} />
            </div>

            {/* Figures / Assets */}
            {currentQuestionData.assets && currentQuestionData.assets.length > 0 && (
              <div className="flex flex-wrap gap-4 justify-center my-4">
                {currentQuestionData.assets.map((asset, idx) => (
                  asset.imagePath ? (
                    <img
                      key={idx}
                      src={asset.imagePath}
                      alt={`Figura ${idx + 1}`}
                      className="max-h-64 object-contain rounded-xl border border-gray-200 dark:border-gray-700 bg-white p-2"
                    />
                  ) : null
                ))}
              </div>
            )}

            {/* Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {currentQuestionData.options.map((opt) => {
                const isSelected = selectedAnswer === opt.id;
                const isCorrect = opt.id === currentQuestionData.correctAnswer;
                let btnStyle = "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-500";

                if (hasAnsweredCurrent) {
                  if (isSelected) {
                    btnStyle = isCorrect 
                      ? "bg-emerald-100 border-emerald-500 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200" 
                      : "bg-red-100 border-red-500 text-red-900 dark:bg-red-950/60 dark:text-red-200";
                  } else if (isCorrect) {
                    btnStyle = "bg-emerald-50 border-emerald-400 text-emerald-800 dark:bg-emerald-950/40";
                  }
                }

                return (
                  <button
                    key={opt.id}
                    disabled={hasAnsweredCurrent}
                    onClick={() => handleSelectOption(opt.id)}
                    className={cn(
                      "p-4 rounded-xl border-2 text-left font-medium text-sm transition-all flex items-start gap-3",
                      btnStyle
                    )}
                  >
                    <span className="w-6 h-6 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                      {opt.id}
                    </span>
                    <div className="flex-1">
                      <MathRenderer text={opt.text} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center text-gray-500">
            Cargando pregunta...
          </div>
        )}
        {/* In-app confirmation modal for battle */}
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

  // 4. Main Lobby View (Arena or Ranking)
  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-8">
      {/* User Stats Card Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-6 md:p-8 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center font-black text-2xl">
            {profile?.displayName?.charAt(0) || 'U'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black">{profile?.displayName}</h2>
              <span className="px-2.5 py-0.5 bg-amber-400 text-amber-950 text-xs font-black rounded-full uppercase">
                {profile?.role === 'admin' ? 'Administrador' : 'Aspirante'}
              </span>
            </div>
            <p className="text-emerald-100 text-xs mt-0.5">{profile?.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-6 bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-3 border border-white/10">
          <div className="text-center">
            <p className="text-xs text-emerald-200 font-medium">Rating ELO</p>
            <p className="text-2xl font-black">{profile?.rating || 1000}</p>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div className="text-center">
            <p className="text-xs text-emerald-200 font-medium">Victorias</p>
            <p className="text-2xl font-black">{profile?.matchesWon || 0}</p>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div className="text-center">
            <p className="text-xs text-emerald-200 font-medium">Partidas</p>
            <p className="text-2xl font-black">{profile?.matchesPlayed || 0}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('arena')}
          className={cn(
            "flex items-center gap-2 px-6 py-3 font-bold text-sm border-b-2 transition-colors",
            activeTab === 'arena'
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <Swords className="w-4 h-4" />
          Sala de Duelos 1 vs 1
        </button>
        <button
          onClick={() => setActiveTab('ranking')}
          className={cn(
            "flex items-center gap-2 px-6 py-3 font-bold text-sm border-b-2 transition-colors",
            activeTab === 'ranking'
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <Trophy className="w-4 h-4" />
          Tabla de Clasificación (Ranking)
        </button>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Arena Content */}
      {activeTab === 'arena' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Create Room Card */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 font-bold">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Crear Nueva Sala de Duelo</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                Genera un código privado para que tu rival se una y compitan respondiendo las mismas preguntas en vivo.
              </p>

              {/* Section Filter */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase">
                    Área del Examen
                  </label>
                  <select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value as any)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm font-medium text-gray-800 dark:text-gray-200"
                  >
                    <option value="all">Examen Mixto (Todas las áreas)</option>
                    <option value="razonamiento-logico">Razonamiento Lógico</option>
                    <option value="competencia-lectora">Competencia Lectora</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase">
                    Número de Preguntas
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[5, 10, 15].map(cnt => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setQuestionCount(cnt)}
                        className={cn(
                          "py-2 rounded-xl text-xs font-bold border transition-colors",
                          questionCount === cnt
                            ? "bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
                        )}
                      >
                        {cnt} Preguntas
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={isActionLoading}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 mt-4"
            >
              <Swords className="w-4 h-4" />
              {isActionLoading ? 'Creando sala...' : 'Crear Sala y Esperar Rival'}
            </button>
          </div>

          {/* Join Room Card */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 font-bold">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Unirse con Código</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                Ingresa el código de 6 caracteres que te compartió el anfitrión para comenzar el duelo de inmediato.
              </p>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase">
                  Código de la Sala
                </label>
                <input
                  type="text"
                  placeholder="Ej: AB12CD"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 text-center text-2xl font-mono font-black tracking-widest uppercase rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-white mb-4 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleJoinRoom}
              disabled={isActionLoading || !joinCode.trim()}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 mt-4"
            >
              <ArrowRight className="w-4 h-4" />
              {isActionLoading ? 'Uniéndose...' : 'Unirse al Duelo Ahora'}
            </button>
          </div>
        </div>
      ) : (
        /* Leaderboard Tab */
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Clasificación General ELO</h3>
              <p className="text-xs text-gray-500">Ranking en tiempo real sincronizado con Supabase</p>
            </div>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-500 rounded-xl">
              <Trophy className="w-6 h-6" />
            </div>
          </div>

          {leaderboard.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              Sé el primero en competir para inaugurar el ranking oficial.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 text-xs font-bold text-gray-400 uppercase">
                    <th className="py-3 px-4">Puesto</th>
                    <th className="py-3 px-4">Aspirante</th>
                    <th className="py-3 px-4 text-center">Partidas</th>
                    <th className="py-3 px-4 text-center">Victorias</th>
                    <th className="py-3 px-4 text-right">Rating ELO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {leaderboard.map((player, idx) => (
                    <tr 
                      key={player.id}
                      className={cn(
                        "hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors",
                        player.id === user?.id && "bg-emerald-50/50 dark:bg-emerald-950/20 font-bold"
                      )}
                    >
                      <td className="py-3.5 px-4">
                        {idx === 0 ? (
                          <span className="w-6 h-6 rounded-full bg-amber-400 text-amber-950 font-black text-xs flex items-center justify-center">1</span>
                        ) : idx === 1 ? (
                          <span className="w-6 h-6 rounded-full bg-gray-300 text-gray-800 font-black text-xs flex items-center justify-center">2</span>
                        ) : idx === 2 ? (
                          <span className="w-6 h-6 rounded-full bg-amber-700 text-amber-100 font-black text-xs flex items-center justify-center">3</span>
                        ) : (
                          <span className="text-gray-400 font-semibold pl-2">#{idx + 1}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs">
                          {player.displayName?.charAt(0) || 'U'}
                        </div>
                        {player.displayName}
                        {player.id === user?.id && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Tú</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-400 font-medium">
                        {player.matchesPlayed || 0}
                      </td>
                      <td className="py-3.5 px-4 text-center text-emerald-600 dark:text-emerald-400 font-semibold">
                        {player.matchesWon || 0}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-gray-900 dark:text-white">
                        {player.rating || 1000}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* In-app confirmation modal for lobby actions */}
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
