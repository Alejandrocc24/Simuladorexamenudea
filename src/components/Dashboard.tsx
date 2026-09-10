import React from 'react';
import { useStore } from '../store/useStore';
import { Link } from 'react-router-dom';
import { BookOpen, Brain, Clock, Target, Trophy, PenTool, Settings, Swords, ArrowRight, Info } from 'lucide-react';

type ComponentId = 'razonamiento-logico' | 'competencia-lectora';

function levelFor(accuracy: number, answered: number): string {
  if (answered === 0) return 'Sin datos todavía';
  if (accuracy >= 80) return 'Nivel sólido, sigue así';
  if (accuracy >= 60) return 'En progreso, vas bien';
  return 'Por reforzar: dedícale más sesiones';
}

export function Dashboard() {
  const { exams, practiceSessions, mockSessions } = useStore();
  
  // Calculate practice stats (las preguntas se buscan en todos los exámenes por id,
  // así valen tanto las sesiones antiguas por examen como las nuevas por componente)
  let totalPracticeAnswered = 0;
  let correctPracticeAnswers = 0;
  let totalSecondsSpent = 0;

  const allQuestionsById = new Map<string, { correctAnswer: string | null; sectionId: string }>();
  exams.forEach((e) =>
    e.sections.forEach((s) =>
      s.questions.forEach((q) => allQuestionsById.set(q.id, q))
    )
  );

  // Rendimiento por componente (RL / CL), combinando práctica y simulacros
  const byComponent: Record<ComponentId, { answered: number; correct: number }> = {
    'razonamiento-logico': { answered: 0, correct: 0 },
    'competencia-lectora': { answered: 0, correct: 0 },
  };

  const tallyAnswer = (qId: string, answer: string) => {
    const q = allQuestionsById.get(qId);
    if (!q) return false;
    const isCorrect = q.correctAnswer === answer;
    if (q.sectionId === 'razonamiento-logico' || q.sectionId === 'competencia-lectora') {
      byComponent[q.sectionId].answered++;
      if (isCorrect) byComponent[q.sectionId].correct++;
    }
    return isCorrect;
  };

  practiceSessions.forEach(session => {
    Object.entries(session.answers).forEach(([qId, answer]) => {
      totalPracticeAnswered++;
      if (tallyAnswer(qId, answer)) {
        correctPracticeAnswers++;
      }
    });

    if (session.durationSeconds) {
      totalSecondsSpent += session.durationSeconds;
    } else if (session.endTime && session.startTime) {
      totalSecondsSpent += Math.round((session.endTime - session.startTime) / 1000);
    }
  });

  // Calculate mock exam stats
  let totalMockAnswered = 0;
  let correctMockAnswers = 0;
  mockSessions.forEach(mock => {
    totalMockAnswered += (mock.answeredCount || 0);
    correctMockAnswers += (mock.correctCount || 0);
    totalSecondsSpent += (mock.timeSpentSeconds || 0);
    Object.entries(mock.answers || {}).forEach(([qId, answer]) => {
      tallyAnswer(qId, answer);
    });
  });

  const totalAnswered = totalPracticeAnswered + totalMockAnswered;
  const totalCorrect = correctPracticeAnswers + correctMockAnswers;
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  const componentCards: Array<{ id: ComponentId; name: string; short: string }> = [
    { id: 'razonamiento-logico', name: 'Razonamiento Lógico', short: 'RL' },
    { id: 'competencia-lectora', name: 'Competencia Lectora', short: 'CL' },
  ];
  const componentStats = componentCards.map((c) => {
    const { answered, correct } = byComponent[c.id];
    return {
      ...c,
      answered,
      correct,
      accuracy: answered > 0 ? Math.round((correct / answered) * 100) : 0,
    };
  });
  const bothHaveData = componentStats.every((s) => s.answered > 0);
  const weaker = bothHaveData
    ? componentStats.reduce((a, b) => (a.accuracy <= b.accuracy ? a : b))
    : null;

  // Format total time spent
  const totalHours = Math.floor(totalSecondsSpent / 3600);
  const totalMinutes = Math.floor((totalSecondsSpent % 3600) / 60);
  const formattedTime = totalHours > 0 ? `${totalHours}h ${totalMinutes}m` : `${totalMinutes} min`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          Prepárate para el examen de admisión UdeA
        </h1>
        <p className="mt-2 text-base sm:text-lg text-gray-600 dark:text-gray-300">
          Practica, simula y compite con preguntas reales de exámenes anteriores.
        </p>
      </header>

      {/* Aviso de independencia: proyecto no oficial, sin afiliación con la UdeA */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200">
        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          <strong>Aviso importante:</strong> este es un proyecto de estudio independiente, con fines
          educativos y sin ánimo oficial. <strong>No tenemos ninguna relación con la Universidad de
          Antioquia</strong>: no somos un canal oficial, no representamos a la universidad y el contenido
          aquí publicado no constituye material oficial de admisión.
        </p>
      </div>

      {/* Stats Bar - Elongated Horizontally with Official UdeA Institutional Green (#005F2B) */}
      <div className="w-full bg-gradient-to-r from-[#005F2B] via-[#005526] to-[#004720] rounded-2xl p-5 md:px-8 md:py-6 shadow-md border border-[#004720] text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-white/15">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-100">
              Métricas del Aspirante
            </span>
          </div>
          <span className="text-[11px] text-emerald-200/80 font-medium">
            Progreso integral de estudio
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/15 gap-4 md:gap-0">
          <div className="flex items-center gap-4 md:justify-center md:pr-6 py-2 md:py-0">
            <div className="p-3.5 bg-white/10 rounded-xl text-emerald-300 ring-1 ring-white/15 flex-shrink-0">
              <Target className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100/90">Precisión global</p>
              <p className="text-3xl font-black text-white tracking-tight">{accuracy}%</p>
            </div>
          </div>

          <div className="flex items-center gap-4 md:justify-center md:px-6 py-2 md:py-0">
            <div className="p-3.5 bg-white/10 rounded-xl text-emerald-300 ring-1 ring-white/15 flex-shrink-0">
              <Brain className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100/90">Preguntas resueltas</p>
              <p className="text-3xl font-black text-white tracking-tight">{totalAnswered}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 md:justify-center md:pl-6 py-2 md:py-0">
            <div className="p-3.5 bg-white/10 rounded-xl text-emerald-300 ring-1 ring-white/15 flex-shrink-0">
              <Clock className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100/90">Tiempo invertido</p>
              <p className="text-3xl font-black text-white tracking-tight">{formattedTime}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Rendimiento por componente */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white mt-4 mb-2">
          Rendimiento por componente
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Precisión combinada de tus prácticas y simulacros en cada componente del examen.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {componentStats.map((s) => {
            const Icon = s.id === 'razonamiento-logico' ? Brain : BookOpen;
            const accent = s.id === 'razonamiento-logico'
              ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
              : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40';
            const bar = s.id === 'razonamiento-logico' ? 'bg-emerald-500' : 'bg-blue-500';
            return (
              <div key={s.id} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-3 rounded-xl ${accent}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900 dark:text-white truncate">{s.name}</h3>
                      <span className="px-2 py-0.5 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-[11px] font-black">
                        {s.short}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{levelFor(s.accuracy, s.answered)}</p>
                  </div>
                  <p className="ml-auto text-3xl font-black text-gray-900 dark:text-white">{s.answered > 0 ? `${s.accuracy}%` : '—'}</p>
                </div>
                <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
                  <div className={`h-full ${bar} transition-all duration-500`} style={{ width: `${s.accuracy}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span><strong className="text-gray-800 dark:text-gray-200">{s.correct}</strong> aciertos</span>
                  <span><strong className="text-gray-800 dark:text-gray-200">{s.answered}</strong> respondidas</span>
                  <span><strong className="text-gray-800 dark:text-gray-200">{s.answered - s.correct}</strong> falladas</span>
                </div>
              </div>
            );
          })}
        </div>
        {totalAnswered === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Aún no tienes datos. Completa una práctica o un simulacro y aquí verás tu avance por componente.
          </p>
        ) : weaker ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3">
            💡 Tu componente por reforzar es <strong>{weaker.name} ({weaker.short})</strong> con {weaker.accuracy}% de
            precisión. Te sugerimos más sesiones de práctica en ese componente.
          </p>
        ) : (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Sigue practicando en ambos componentes para desbloquear la recomendación de refuerzo.
          </p>
        )}
      </div>

      {/* Action Cards */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white mt-4 mb-6">
          Modos de Estudio y Competencia
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <Link to="/practice" className="group flex flex-col items-start p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-all hover:shadow-md">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Práctica</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Resuelve preguntas por área y obtén retroalimentación inmediata paso a paso.</p>
          </Link>

          <Link to="/mock-exam" className="group flex flex-col items-start p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all hover:shadow-md">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400 mb-4 group-hover:scale-110 transition-transform">
              <Trophy className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Simulacro</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Enfrenta 80 preguntas con cronómetro de 3 horas y condiciones reales.</p>
          </Link>

          <Link to="/competition" className="group flex flex-col items-start p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-amber-500 dark:hover:border-amber-500 transition-all hover:shadow-md">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-xl text-amber-600 dark:text-amber-400 mb-4 group-hover:scale-110 transition-transform">
              <Swords className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              Duelos 1v1
              <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full">En vivo</span>
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Compite en tiempo real contra otros aspirantes y escala el ranking ELO.</p>
          </Link>

          <Link to="/whiteboard" className="group flex flex-col items-start p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-500 transition-all hover:shadow-md">
            <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-purple-600 dark:text-purple-400 mb-4 group-hover:scale-110 transition-transform">
              <PenTool className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Pizarra</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Usa el lienzo digital para rayar, hacer cálculos y resolver problemas geométricos.</p>
          </Link>

          <Link to="/admin" className="group flex flex-col items-start p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-gray-500 dark:hover:border-gray-500 transition-all hover:shadow-md">
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-gray-600 dark:text-gray-400 mb-4 group-hover:scale-110 transition-transform">
              <Settings className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Administración</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Importa exámenes desde JSON a Supabase, revisa, edita y publica las preguntas.</p>
          </Link>
        </div>
      </div>

      {/* Recent Mock Exams Summary (if available) */}
      {mockSessions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              Tus Simulacros Realizados
            </h3>
            <Link to="/mock-exam" className="text-sm text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1">
              Ver todos <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {mockSessions.slice(0, 3).map((sess) => (
              <div key={sess.id} className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-black text-emerald-600">{sess.overallScorePercentage}%</span>
                  <span className="text-xs text-gray-400">{new Date(sess.completedAt).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300 font-semibold truncate mb-1">{sess.examTitle}</p>
                <div className="flex justify-between text-[11px] text-gray-500">
                  <span>{sess.correctCount} / {sess.totalQuestions} aciertos</span>
                  <span>{Math.floor(sess.timeSpentSeconds / 60)} min</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
