import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useAuth } from '../context/AuthContext';
import { Question, PracticeSession } from '../types';
import { BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { CheckCircle2, XCircle, ChevronRight, ChevronDown, ChevronUp, HelpCircle, ArrowLeft, Brain, Award, RotateCcw, Home, BookOpen, PenTool } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from './Layout';
import { MathRenderer } from './MathRenderer';
import { SharedContextBox } from './SharedContextBox';
import { Whiteboard } from './Whiteboard';

export type PracticeComponent = 'razonamiento-logico' | 'competencia-lectora';

const COMPONENTS: Array<{ id: PracticeComponent; name: string; short: string; description: string }> = [
  {
    id: 'razonamiento-logico',
    name: 'Razonamiento Lógico',
    short: 'RL',
    description: 'Proporcionalidad, geometría, probabilidad y secuencias.',
  },
  {
    id: 'competencia-lectora',
    name: 'Competencia Lectora',
    short: 'CL',
    description: 'Comprensión, vocabulario e inferencia a partir de textos.',
  },
];

export function Practice() {
  const { exams, isLoadingExams, addPracticeSession, updatePracticeSession } = useStore();
  const setFocusMode = useStore((s) => s.setFocusMode);
  const { user } = useAuth();

  // Se practica por componente (RL / CL): las preguntas se reúnen de TODOS los exámenes importados.
  const [selectedComponent, setSelectedComponent] = useState<PracticeComponent | ''>('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Pizarra lateral para explicar en grupo: oculta el sidebar y divide la pantalla
  // (pregunta a la izquierda, pizarra a la derecha). Se mantiene montada al ocultarla
  // para no borrar lo dibujado.
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [boardMounted, setBoardMounted] = useState(false);

  const toggleWhiteboard = () => {
    if (showWhiteboard) {
      setShowWhiteboard(false);
      setFocusMode(false);
    } else {
      setBoardMounted(true);
      setShowWhiteboard(true);
      setFocusMode(true);
    }
  };

  const exitToConfig = () => {
    setShowWhiteboard(false);
    setFocusMode(false);
    setSelectedComponent('');
    setIsFinished(false);
  };

  // Al salir de la vista, restaurar el sidebar
  useEffect(() => {
    return () => setFocusMode(false);
  }, [setFocusMode]);
  
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [isResolved, setIsResolved] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [showNavigator, setShowNavigator] = useState(true);

  // Session tracking state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);
  const [accumulatedAnswers, setAccumulatedAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});

  // Preguntas publicadas/aprobadas agrupadas por componente, de todos los exámenes
  const publishedByComponent = useMemo(() => {
    const map: Record<PracticeComponent, Question[]> = {
      'razonamiento-logico': [],
      'competencia-lectora': [],
    };
    exams.forEach((e) =>
      e.sections.forEach((s) => {
        if (s.id === 'razonamiento-logico' || s.id === 'competencia-lectora') {
          map[s.id].push(
            ...s.questions.filter((q) => q.status === 'PUBLISHED' || q.status === 'APPROVED')
          );
        }
      })
    );
    return map;
  }, [exams]);

  const questions = selectedComponent ? publishedByComponent[selectedComponent] : [];
  const currentQuestion: Question | undefined = questions[currentQuestionIndex];
  const componentInfo = COMPONENTS.find((c) => c.id === selectedComponent);

  // El texto de lectura compartida vive en el examen de origen de cada pregunta
  const parentExam = currentQuestion
    ? exams.find((e) => e.sections.some((s) => s.questions.some((q) => q.id === currentQuestion.id)))
    : undefined;

  const handleStart = () => {
    if (!selectedComponent || questions.length === 0) return;
    const sessionId = `practice_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();
    setActiveSessionId(sessionId);
    setSessionStartTime(now);
    setAccumulatedAnswers({});
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setIsResolved(false);
    setShowExplanation(false);
    setIsFinished(false);

    const newSession: PracticeSession = {
      id: sessionId,
      userId: user?.id,
      examId: 'componentes',
      sectionId: selectedComponent,
      startTime: now,
      answers: {},
      score: 0,
      completedAt: new Date().toISOString()
    };
    addPracticeSession(newSession, user?.id);
  };

  const handleResolve = () => {
    if (!selectedOption || !currentQuestion) return;
    setIsResolved(true);
    setShowExplanation(true);

    const nextAnswers = { ...accumulatedAnswers, [currentQuestion.id]: selectedOption };
    setAccumulatedAnswers(nextAnswers);

    // Calculate score
    let correctCount = 0;
    Object.entries(nextAnswers).forEach(([qId, ans]) => {
      const q = questions.find(item => item.id === qId);
      if (q && q.correctAnswer === ans) {
        correctCount++;
      }
    });

    const now = Date.now();
    const currentScore = Math.round((correctCount / Object.keys(nextAnswers).length) * 100);

    if (activeSessionId) {
      updatePracticeSession(activeSessionId, nextAnswers, currentScore, now, user?.id);
    }
  };

  // Navegación libre: se puede saltar entre preguntas sin responder.
  // Al volver a una ya respondida se restaura su estado.
  const goToQuestion = (index: number) => {
    const clamped = Math.max(0, Math.min(index, questions.length - 1));
    const target = questions[clamped];
    const saved = target ? accumulatedAnswers[target.id] ?? null : null;
    setCurrentQuestionIndex(clamped);
    setSelectedOption(saved);
    setIsResolved(saved !== null);
    setShowExplanation(saved !== null);
  };

  const handlePrev = () => {
    goToQuestion(currentQuestionIndex - 1);
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      goToQuestion(currentQuestionIndex + 1);
    } else {
      setIsFinished(true);
    }
  };

  if (isLoadingExams) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Cargando material de práctica...</p>
      </div>
    );
  }

  // Finished Practice Session View
  if (isFinished) {
    let correctCount = 0;
    Object.entries(accumulatedAnswers).forEach(([qId, ans]) => {
      const q = questions.find(item => item.id === qId);
      if (q && q.correctAnswer === ans) correctCount++;
    });
    const totalAnswered = Object.keys(accumulatedAnswers).length;
    const finalScore = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

    return (
      <div className="max-w-2xl mx-auto my-8 p-8 md:p-12 text-center bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm animate-in zoom-in-95 duration-200">
        <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Award className="w-10 h-10" />
        </div>

        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tracking-wider uppercase bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-full">
          Práctica Completada
        </span>

        <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mt-4 mb-2">
          ¡Buen trabajo en tu sesión!
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          {componentInfo ? `${componentInfo.name} (${componentInfo.short})` : 'Práctica por componente'} — preguntas de todos los exámenes
        </p>

        <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-8 bg-gray-50 dark:bg-gray-900/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-xs text-gray-500">Correctas</p>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{correctCount}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Respondidas</p>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{totalAnswered}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Precisión</p>
            <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">{finalScore}%</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={handleStart}
            className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Repetir Práctica
          </button>
          <button
            onClick={exitToConfig}
            className="w-full sm:w-auto px-6 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold rounded-xl transition-all"
          >
            Cambiar de Área
          </button>
          <Link
            to="/"
            className="w-full sm:w-auto px-6 py-3 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            Ir al Inicio
          </Link>
        </div>
      </div>
    );
  }

  if (!selectedComponent || !currentQuestion) {
    const totalAvailable = publishedByComponent['razonamiento-logico'].length + publishedByComponent['competencia-lectora'].length;
    if (totalAvailable === 0) {
      return (
        <div className="max-w-2xl mx-auto p-8 text-center animate-in fade-in bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">No hay preguntas publicadas todavía</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Carga un archivo JSON desde el panel de Administración y publica preguntas para poder practicar por componente.
          </p>
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 animate-in fade-in">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Practicar por componente</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">
          Elige Razonamiento Lógico o Competencia Lectora. Las preguntas se reúnen de todos los exámenes importados.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {COMPONENTS.map((c) => {
            const count = publishedByComponent[c.id].length;
            const isActive = selectedComponent === c.id;
            const Icon = c.id === 'razonamiento-logico' ? Brain : BookOpen;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedComponent(c.id)}
                className={cn(
                  'text-left p-5 rounded-2xl border-2 transition-all',
                  isActive
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 bg-white dark:bg-gray-800'
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                    isActive ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'
                  )}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-xs font-black">
                    {c.short}
                  </span>
                </div>
                <p className="font-bold text-gray-900 dark:text-white">{c.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{c.description}</p>
                <p className={cn(
                  'text-xs font-bold mt-3',
                  count > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                )}>
                  {count} pregunta{count === 1 ? '' : 's'} lista{count === 1 ? '' : 's'}
                </p>
              </button>
            );
          })}
        </div>

        {selectedComponent && questions.length === 0 && (
          <p className="mt-4 text-sm text-amber-600 dark:text-amber-400 font-medium">
            Aún no hay preguntas publicadas en {componentInfo?.name}. Elige el otro componente o publica preguntas desde Administración.
          </p>
        )}

        <button
          disabled={!selectedComponent || questions.length === 0}
          onClick={handleStart}
          className="w-full mt-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
        >
          {selectedComponent && questions.length > 0
            ? `Comenzar Práctica (${questions.length} preguntas)`
            : 'Comenzar Práctica'}
        </button>
      </div>
    );
  }

  const isCorrect = selectedOption === currentQuestion.correctAnswer;

  return (
    <div className={cn(showWhiteboard ? "max-w-none" : "max-w-4xl", "mx-auto animate-in slide-in-from-bottom-4 duration-500")}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exitToConfig}
            className="flex items-center text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Cambiar de componente
          </button>
          <button
            onClick={toggleWhiteboard}
            title={showWhiteboard ? 'Ocultar pizarra' : 'Abrir pizarra para explicar en grupo'}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
              showWhiteboard
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60"
            )}
          >
            <PenTool className="w-4 h-4" />
            {showWhiteboard ? 'Ocultar pizarra' : 'Explicar en pizarra'}
          </button>
        </div>
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-[11px] font-black">
            {componentInfo?.short}
          </span>
          Pregunta {currentQuestionIndex + 1} de {questions.length}
        </div>
      </div>

      {/* Navegador de preguntas: salto libre sin necesidad de responder */}
      <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <button
          onClick={() => setShowNavigator(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            Navegador de preguntas
            <span className="text-xs font-semibold text-gray-400">
              {Object.keys(accumulatedAnswers).length}/{questions.length} respondidas
            </span>
          </span>
          {showNavigator ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showNavigator && (
          <div className="px-4 pb-4 flex flex-wrap gap-1.5">
            {questions.map((q, idx) => {
              const answered = accumulatedAnswers[q.id] !== undefined;
              const isCurrent = idx === currentQuestionIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => goToQuestion(idx)}
                  title={`Ir a la pregunta ${idx + 1}${answered ? ' (respondida)' : ''}`}
                  className={cn(
                    "w-9 h-9 rounded-lg text-xs font-black transition-all",
                    isCurrent
                      ? "bg-emerald-600 text-white shadow-sm scale-105"
                      : answered
                        ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  )}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={cn(showWhiteboard && "grid grid-cols-1 xl:grid-cols-5 gap-6 items-start")}>
        <div className={cn("min-w-0", showWhiteboard && "xl:col-span-2")}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {/* Question Statement */}
        <div className="p-4 sm:p-6 md:p-8 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs font-bold uppercase tracking-wider">
              {currentQuestion.topic}
            </span>
            <span className={cn(
              "text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full",
              currentQuestion.difficulty === 'easy' ? "text-green-700 bg-green-100" :
              currentQuestion.difficulty === 'medium' ? "text-amber-700 bg-amber-100" :
              "text-red-700 bg-red-100"
            )}>
              {currentQuestion.difficulty === 'easy' ? 'Fácil' : currentQuestion.difficulty === 'medium' ? 'Media' : 'Difícil'}
            </span>
          </div>
          
          {/* Shared Reading Context / Situation if available (del examen de origen) */}
          <SharedContextBox
            sharedTexts={parentExam?.sharedTexts}
            questionNumber={currentQuestion.number}
          />
          
          <h3 className="text-lg sm:text-xl text-gray-900 dark:text-white leading-relaxed mb-6 font-medium break-words">
            <MathRenderer text={currentQuestion.statement} />
          </h3>

          {/* Render Assets (Images, Math, Tables) */}
          {currentQuestion.assets && currentQuestion.assets.length > 0 && (
            <div className="my-6 space-y-4">
              {currentQuestion.assets.map((asset, idx) => {
                const imgSrc = asset.imagePath || asset.croppedImage || asset.content || asset.base64;
                if (asset.type === 'image' && !imgSrc) return null;

                return (
                  <div key={asset.id || idx} className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                    {asset.type === 'image' && imgSrc && (
                      <img 
                        src={imgSrc} 
                        alt={asset.description || "Imagen de la pregunta"} 
                        className="max-w-full max-h-96 object-contain rounded-lg shadow-sm" 
                      />
                    )}
                    {asset.type === 'math' && (
                      <div className="text-lg overflow-x-auto w-full flex justify-center py-4 flex-col items-center gap-4">
                        {asset.imagePath && <img src={asset.imagePath} alt="Formula original" className="max-w-full h-auto opacity-75 rounded" />}
                        {asset.content && <BlockMath math={asset.content} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Options */}
          <div className="space-y-3 mt-8">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedOption === option.id;
              const isCorrectOption = currentQuestion.correctAnswer === option.id;
              
              let optionClasses = "w-full text-left p-4 rounded-xl border-2 transition-all flex items-start gap-4 ";
              
              if (!isResolved) {
                optionClasses += isSelected 
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" 
                  : "border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300";
              } else {
                if (isCorrectOption) {
                  optionClasses += "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100";
                } else if (isSelected && !isCorrectOption) {
                  optionClasses += "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100";
                } else {
                  optionClasses += "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-500 opacity-60";
                }
              }

              return (
                <button
                  key={option.id}
                  disabled={isResolved}
                  onClick={() => setSelectedOption(option.id)}
                  className={optionClasses}
                >
                  <span className={cn(
                    "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2",
                    isSelected && !isResolved ? "border-emerald-500 text-emerald-600 bg-white" :
                    isResolved && isCorrectOption ? "border-green-500 bg-green-500 text-white" :
                    isResolved && isSelected && !isCorrectOption ? "border-red-500 bg-red-500 text-white" :
                    "border-gray-300 dark:border-gray-600"
                  )}>
                    {option.id}
                  </span>
                  <span className="mt-1 flex-1">
                    <MathRenderer text={option.text} />
                  </span>
                  
                  {isResolved && isCorrectOption && <CheckCircle2 className="w-6 h-6 ml-auto text-green-500" />}
                  {isResolved && isSelected && !isCorrectOption && <XCircle className="w-6 h-6 ml-auto text-red-500" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Actions Area */}
        <div className="p-4 sm:p-6 md:p-8 bg-gray-50 dark:bg-gray-900/50">
          {!isResolved ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    disabled={currentQuestionIndex === 0}
                    onClick={handlePrev}
                    className="flex-1 sm:flex-none px-5 py-3 rounded-xl font-bold text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={handleNext}
                    className="flex-1 sm:flex-none px-5 py-3 rounded-xl font-bold text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
                  >
                    {currentQuestionIndex >= questions.length - 1 ? 'Finalizar' : 'Omitir →'}
                  </button>
                </div>
                <button
                  disabled={!selectedOption}
                  onClick={handleResolve}
                  className="w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  Resolver
                </button>
              </div>
              <button
                onClick={() => setShowExplanation(true)}
                className="text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center justify-center text-sm font-medium"
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                Ver explicación sin resolver
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
              <button
                disabled={currentQuestionIndex === 0}
                onClick={handlePrev}
                className="w-full sm:w-auto px-5 py-3 rounded-xl font-bold text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Anterior
              </button>
              <button
                onClick={handleNext}
                className={cn(
                  "w-full sm:w-auto flex items-center justify-center px-8 py-3 rounded-xl font-bold text-white transition-colors shadow-sm",
                  currentQuestionIndex >= questions.length - 1
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-blue-600 hover:bg-blue-700"
                )}
              >
                {currentQuestionIndex >= questions.length - 1 ? 'Finalizar y Ver Resumen' : 'Siguiente Pregunta'}
                <ChevronRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Explanation Box */}
      {showExplanation && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border-l-4 border-l-blue-500 p-4 sm:p-6 md:p-8 animate-in slide-in-from-top-4 duration-300">
          <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-blue-500" />
            Explicación Pedagógica
          </h4>
          <div className="text-gray-700 dark:text-gray-300 text-base leading-relaxed">
            <MathRenderer text={currentQuestion.explanation} />
          </div>
        </div>
      )}
        </div>

        {/* Pizarra amplia para explicar la pregunta en grupo (3/5 del ancho) */}
        {boardMounted && (
          <div className={cn(!showWhiteboard && "hidden", "xl:col-span-3 xl:sticky xl:top-6")}>
            <Whiteboard className="h-[75vh] xl:h-[calc(100vh-10rem)]" />
          </div>
        )}
      </div>
    </div>
  );
}
