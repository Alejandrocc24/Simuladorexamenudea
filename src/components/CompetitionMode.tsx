import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../store/useStore';
import { Question } from '../types';
import { 
  createMatchRoom, 
  joinMatchByCode, 
  startMatch,
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

  const [activeMatch, setActiveMatch] = useState<MatchRoom | null>(null);
  const activeMatchRef = useRef<MatchRoom | null>(null);
  useEffect(() => {
    activeMatchRef.current = activeMatch;
  }, [activeMatch]);

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hasAnsweredCurrent, setHasAnsweredCurrent] = useState(false);
  const [matchProcessed, setMatchProcessed] = useState(false);
  const processedMatchesRef = useRef<Set<string>>(new Set());

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

  const [leaderboard, setLeaderboard] = useState<PublicLeaderboardUser[]>([]);

  const allAvailableQuestions = useMemo(() => {
    return exams.flatMap(e => 
      e.sections
        .filter(s => selectedSection === 'all' || s.id === selectedSection)
        .flatMap(s => s.questions)
    );
  }, [exams, selectedSection]);

  useEffect(() => {
    cleanupStaleMatches();
  }, []);

  useEffect(() => {
    const unsub = subscribeToLeaderboard((players) => {
      setLeaderboard(players);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!activeMatch?.id) return;

    const unsub = subscribeToMatch(activeMatch.id, (updatedMatch) => {
      setActiveMatch(updatedMatch);

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

  const currentQuestionData: Question | null = useMemo(() => {
    if (!activeMatch) return null;
    const me = activeMatch.players.find(p => p.userId === user?.id);
    if (!me) return null;
    const currentIndex = me.answeredCount;
    const targetId = activeMatch.questionIds[currentIndex];
    if (!targetId) return null;

    for (const ex of exams) {
      for (const sec of ex.sections) {
        const found = sec.questions.find(q => q.id === targetId);
        if (found) return found;
      }
    }
    return null;
  }, [activeMatch, user, exams]);

  const handleCreateRoom = async () => {
    if (!profile) return;
    setIsActionLoading(true);
    setErrorMessage(null);

    try {
      let pool = [...allAvailableQuestions];
      if (pool.length === 0) {
        pool = exams.flatMap(e => e.sections.flatMap(s => s.questions));
      }

      if (pool.length === 0) {
        setErrorMessage('Debes tener preguntas importadas para poder competir.');
        setIsActionLoading(false);
        return;
      }

      const shuffled = [...pool].sort(() => 0.5 - Math.random());
      const selectedQuestions = shuffled.slice(0, Math.min(questionCount, shuffled.length));
      const qIds = selectedQuestions.map(q => q.id);

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

  const handleStartMatch = async () => {
    if (!activeMatch || !user) return;
    setIsActionLoading(true);
    setErrorMessage(null);
    try {
      const room = await startMatch(activeMatch.id, user.id);
      setActiveMatch(room);
    } catch (err: any) {
      setErrorMessage(err.message || 'No se pudo iniciar la partida');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSelectOption = async (optionId: string) => {
    const match = activeMatchRef.current;
    if (hasAnsweredCurrent || !match || !currentQuestionData || !user) return;
    setSelectedAnswer(optionId);
    setHasAnsweredCurrent(true);

    const me = match.players.find(p => p.userId === user.id);
    const currentIndex = me?.answeredCount ?? 0;

    setTimeout(async () => {
      try {
        const freshMatch = activeMatchRef.current;
        if (!freshMatch) return;
        await submitMatchAnswer(
          freshMatch.id,
          user.id,
          optionId,
          currentIndex,
          freshMatch.totalQuestions
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

  const sortedPlayers = useMemo(() => {
    if (!activeMatch) return [];
    return [...activeMatch.players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.answeredCount !== a.answeredCount) return b.answeredCount - a.answeredCount;
      return a.userId.localeCompare(b.userId);
    });
  }, [activeMatch]);

  const me = useMemo(() => {
    if (!activeMatch) return undefined;
    return activeMatch.players.find(p => p.userId === user?.id);
  }, [activeMatch, user]);

  if (!user && !authLoading) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 md:p-12 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Swords className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-3">
            Modo Competir: Sala de Competencia UdeA
          </h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto mb-8 text-base leading-relaxed">
            Inicia sesión con tu cuenta para retar a otros aspirantes en tiempo real
            (hasta 15 jugadores por sala), ganar puntos y subir a la tabla oficial de clasificados.
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

  if (activeMatch && activeMatch.status === 'waiting') {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-full mb-6 animate-pulse">
            <Clock className="w-3.5 h-3.5" />
            Esperando jugadores...
          </div>

          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Código de tu Sala</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Comparte este código para que otros aspirantes se unan (hasta {activeMatch.maxParticipants} jugadores):
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

          <div className="mb-6">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Jugadores ({activeMatch.players.length} / {activeMatch.maxParticipants})
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {activeMatch.players.map((p) => (
                <div
                  key={p.userId}
                  className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-900 rounded-xl"
                >
                  <div className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0",
                    p.isHost ? "bg-emerald-500" : "bg-indigo-500"
                  )}>
                    {p.displayName?.charAt(0) || 'U'}
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1 text-left truncate">
                    {p.displayName}
                  </span>
                  {p.userId === user?.id && (
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 px-2 py-0.5 rounded-full">
                      Tú
                    </span>
                  )}
                  {p.isHost && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full">
                      Anfitrión
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {me?.isHost ? (
            <div className="space-y-2">
              <button
                onClick={handleStartMatch}
                disabled={isActionLoading || activeMatch.players.length < 2}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Swords className="w-4 h-4" />
                {isActionLoading ? 'Iniciando...' : 'Iniciar Duelo'}
              </button>
              {activeMatch.players.length < 2 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Necesitas al menos 2 jugadores para iniciar.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Esperando a que el anfitrión inicie el duelo...
            </p>
          )}

          <button
            onClick={() => {
              if (user && activeMatch) {
                leaveMatch(activeMatch.id, user.id);
              }
              setActiveMatch(null);
            }}
            className="mt-6 text-sm text-gray-500 hover:text-red-500 transition-colors"
          >
            Salir de la sala
          </button>
        </div>
      </div>
    );
  }

  if (activeMatch && (activeMatch.status === 'in_progress' || activeMatch.status === 'completed')) {
    const myScore = me?.score ?? 0;
    const myCurrentQ = me?.answeredCount ?? 0;
    const isFinishedForMe = myCurrentQ >= activeMatch.totalQuestions;
    const topScore = sortedPlayers[0]?.score;
    const topPlayers = sortedPlayers.filter(p => p.score === topScore);
    const iAmTop = me && topPlayers.some(p => p.userId === me.userId);
    const isDraw = topPlayers.length > 1 && iAmTop;
    const myRank = sortedPlayers.findIndex(p => p.userId === user?.id);
    const isCancelled = activeMatch.winnerId === 'cancelled';

    return (
      <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-black text-lg shadow-sm">
                {me?.displayName?.charAt(0) || 'U'}
              </div>
              <div>
                <p className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                  {me?.displayName || 'Tú'} <span className="text-xs font-normal text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">Tú</span>
                </p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{myScore} <span className="text-xs font-medium text-gray-400">pts</span></p>
              </div>
            </div>

            <div className="flex flex-col items-center">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-full">
                <Swords className="w-6 h-6 animate-pulse" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 mt-1">COMPETENCIA UdeA</span>
              {activeMatch.status === 'in_progress' && (
                <button
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: '¿Abandonar partida?',
                      message: 'Si abandonas ahora, saldrás de la sala y los demás podrán continuar.',
                      confirmLabel: 'Abandonar',
                      onConfirm: async () => {
                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        if (user && activeMatch) {
                          await leaveMatch(activeMatch.id, user.id);
                          setActiveMatch(null);
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

            <div className="flex items-center gap-3 flex-1 justify-end">
              {sortedPlayers.slice(1, 3).map(p => (
                <div key={p.userId} className="text-right">
                  <p className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-1.5 justify-end">
                    <span className="text-xs font-normal text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full">
                      {p.isHost ? 'Anfitrión' : 'Rival'}
                    </span> {p.displayName}
                  </p>
                  <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{p.score} <span className="text-xs font-medium text-gray-400">pts</span></p>
                </div>
              ))}
              {sortedPlayers.length > 3 && (
                <div className="w-12 h-12 rounded-2xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center font-bold text-sm">
                  +{sortedPlayers.length - 3}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
            {sortedPlayers.map((p) => {
              const progress = Math.min(p.answeredCount, activeMatch.totalQuestions);
              return (
                <div key={p.userId} className="flex items-center gap-3">
                  <span className={cn(
                    "text-[11px] font-black w-5 text-center",
                    p.userId === user?.id ? "text-emerald-600" : "text-gray-400"
                  )}>
                    {sortedPlayers.indexOf(p) + 1}°
                  </span>
                  <span className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0",
                    p.userId === user?.id ? "bg-emerald-500" : p.isHost ? "bg-amber-500" : "bg-indigo-500"
                  )}>
                    {p.displayName?.charAt(0) || 'U'}
                  </span>
                  <span className={cn(
                    "text-xs font-semibold truncate max-w-[120px]",
                    p.userId === user?.id ? "text-emerald-700 dark:text-emerald-300" : "text-gray-700 dark:text-gray-300"
                  )}>
                    {p.displayName}{p.userId === user?.id ? ' (Tú)' : ''}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          p.userId === user?.id ? "bg-emerald-500" : "bg-indigo-400"
                        )}
                        style={{ width: `${(progress / activeMatch.totalQuestions) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-400 w-12 text-right">
                    {progress}/{activeMatch.totalQuestions}
                  </span>
                  <span className={cn(
                    "text-xs font-black min-w-[52px] text-right",
                    p.userId === user?.id ? "text-emerald-600 dark:text-emerald-400" : "text-gray-600 dark:text-gray-400"
                  )}>
                    {p.score} pts
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {isFinishedForMe && activeMatch.status !== 'completed' ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">¡Has terminado tus preguntas!</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Esperando a que los demás jugadores terminen para calcular los resultados finales.
            </p>
          </div>
        ) : activeMatch.status === 'completed' ? (
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 md:p-12 text-center shadow-sm border border-gray-100 dark:border-gray-700">
            {isCancelled ? (
              <div>
                <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 text-gray-400 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-10 h-10" />
                </div>
                <h3 className="text-3xl font-black text-gray-900 dark:text-white mb-2">Sala Cancelada</h3>
                <p className="text-gray-500 font-semibold text-lg mb-6">No se completó el duelo.</p>
              </div>
            ) : iAmTop && isDraw ? (
              <div>
                <div className="w-20 h-20 bg-blue-50 dark:bg-blue-950/40 text-blue-500 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-10 h-10" />
                </div>
                <h3 className="text-3xl font-black text-gray-900 dark:text-white mb-2">¡EMPATE!</h3>
                <p className="text-blue-600 font-bold text-lg mb-6">Quedaste entre los primeros en empate.</p>
              </div>
            ) : iAmTop ? (
              <div>
                <div className="w-20 h-20 bg-amber-50 dark:bg-amber-950/40 text-amber-500 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <Crown className="w-10 h-10" />
                </div>
                <h3 className="text-3xl font-black text-gray-900 dark:text-white mb-2">¡VICTORIA!</h3>
                <p className="text-emerald-600 dark:text-emerald-400 font-bold text-lg mb-6">¡Ganaste el duelo!</p>
              </div>
            ) : (
              <div>
                <div className="w-20 h-20 bg-red-50 dark:bg-red-950/40 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-10 h-10" />
                </div>
                <h3 className="text-3xl font-black text-gray-900 dark:text-white mb-2">DERROTA</h3>
                <p className="text-red-500 font-bold text-lg mb-6">
                  {myRank >= 0 ? `Puesto #${myRank + 1} de ${sortedPlayers.length}` : 'No se pudo determinar tu posición'}
                </p>
              </div>
            )}

            <div className="space-y-2 max-w-sm mx-auto mb-8">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Clasificación Final</p>
              {sortedPlayers.map((p, idx) => (
                <div
                  key={p.userId}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl text-sm",
                    p.userId === user?.id
                      ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800"
                      : "bg-gray-50 dark:bg-gray-900"
                  )}
                >
                  <span className={cn(
                    "w-6 h-6 rounded-full font-black text-xs flex items-center justify-center flex-shrink-0",
                    idx === 0 ? "bg-amber-400 text-amber-950" : idx === 1 ? "bg-gray-300 text-gray-800" : idx === 2 ? "bg-amber-700 text-amber-100" : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                  )}>
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-left font-semibold text-gray-900 dark:text-white truncate">
                    {p.displayName}
                    {p.userId === user?.id && <span className="text-xs text-emerald-600 ml-1">(Tú)</span>}
                  </span>
                  {idx === 0 && activeMatch.winnerId === p.userId && (
                    <Crown className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  )}
                  <span className="font-black text-gray-900 dark:text-white">{p.score} pts</span>
                </div>
              ))}
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
                Volver al Lobby
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

            <div className="text-base md:text-lg text-gray-800 dark:text-gray-200 leading-relaxed font-medium">
              <MathRenderer text={currentQuestionData.statement} />
            </div>

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

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-8">
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
          Sala de Competencia
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
          Tabla de Clasificación
        </button>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      {activeTab === 'arena' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 font-bold">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Crear Nueva Sala</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                Genera un código privado para que hasta 15 jugadores se unan y compitan respondiendo las mismas preguntas en vivo.
              </p>

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
              {isActionLoading ? 'Creando sala...' : 'Crear Sala'}
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 font-bold">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Unirse con Código</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                Ingresa el código de 6 caracteres que te compartió un jugador para unirte a la sala.
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
              {isActionLoading ? 'Uniéndose...' : 'Unirse a la Sala'}
            </button>
          </div>
        </div>
      ) : (
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
