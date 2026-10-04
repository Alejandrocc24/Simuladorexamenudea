import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useAuth } from '../context/AuthContext';
import { FileUp, CheckCircle, AlertTriangle, Settings, FileJson, Trash2, ShieldAlert, LogIn, Users, Inbox, ChevronDown, ChevronUp, Pencil, Check, X } from 'lucide-react';
import { BlockMath } from 'react-katex';
import { cn } from './Layout';

import { JsonImporter } from './JsonImporter';
import { QuestionsManager } from './QuestionsManager';
import { ReportsManager } from './ReportsManager';
import { ConfirmModal } from './ConfirmModal';
import { QuestionEditor } from './QuestionEditor';
import { UserManagement } from './UserManagement';

export function Admin() {
  const { exams, updateQuestion, deleteQuestion, deleteExam, clearAllExams, renameExam } = useStore();
  const { user, isAdmin, loading: authLoading } = useAuth();

  const [adminSection, setAdminSection] = useState<'manage-questions' | 'import-review' | 'users' | 'reports'>('manage-questions');
  const [reportsCount, setReportsCount] = useState(0);
  const [renamingExamId, setRenamingExamId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  // Acordeón del paso 2: colapsado por defecto salvo el más reciente.
  const [expandedExams, setExpandedExams] = useState<Set<string> | null>(() => {
    try {
      const raw = localStorage.getItem('admin_expanded_exams');
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      // sin almacenamiento: se usa el valor por defecto
    }
    return null;
  });

  const isExpanded = (examId: string, isFirst: boolean) =>
    expandedExams ? expandedExams.has(examId) : isFirst;

  const toggleExpanded = (examId: string, isFirst: boolean) => {
    const next = new Set(expandedExams ?? (exams[0] ? [exams[0].id] : []));
    if (isExpanded(examId, isFirst)) next.delete(examId);
    else next.add(examId);
    setExpandedExams(next);
    try {
      localStorage.setItem('admin_expanded_exams', JSON.stringify(Array.from(next)));
    } catch {
      // ignorar
    }
  };

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
    onConfirm: () => {},
  });

  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);

  const allQuestions = exams.flatMap((e) => e.sections.flatMap((s) => s.questions));
  const activeQuestion = allQuestions.find((q) => q.id === activeQuestionId);
  const activeExam = exams.find((e) => e.id === activeQuestion?.examId);

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Verificando credenciales de administración...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto my-16 bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 text-center space-y-5 animate-in fade-in duration-300">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Acceso Restringido</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            El panel de administración está reservado para el correo administrador configurado en <code>VITE_ADMIN_EMAIL</code>.
          </p>
        </div>

        {!user ? (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">Inicia sesión con email o Google:</p>
            <Link
              to="/login"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Ir al login</span>
            </Link>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 space-y-1 text-left border border-gray-200 dark:border-gray-800">
            <p className="font-semibold text-gray-700 dark:text-gray-300">Cuenta activa:</p>
            <p className="font-mono font-bold text-gray-800 dark:text-gray-200 truncate">{user.email}</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold pt-1">
              Esta cuenta no tiene rol de administrador.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-full px-4 xl:px-8 mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Panel de Administración</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Carga exámenes desde JSON a Supabase, revisa, edita o elimina preguntas.
          </p>
        </div>

        <div className="flex flex-wrap bg-gray-100 dark:bg-gray-800 p-1.5 rounded-xl text-xs font-bold gap-1 self-start sm:self-auto">
          <button
            onClick={() => setAdminSection('manage-questions')}
            className={cn(
              'px-4 py-2.5 rounded-lg transition-all flex items-center gap-2',
              adminSection === 'manage-questions'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs font-black'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
            <span>Gestión y Eliminación</span>
            <span className="px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-[10px]">{allQuestions.length}</span>
          </button>

          <button
            onClick={() => setAdminSection('import-review')}
            className={cn(
              'px-4 py-2.5 rounded-lg transition-all flex items-center gap-2',
              adminSection === 'import-review'
                ? 'bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-300 shadow-xs font-black'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <FileUp className="w-4 h-4 text-emerald-500" />
            <span>Importar y Revisar</span>
          </button>

          <button
            onClick={() => setAdminSection('users')}
            className={cn(
              'px-4 py-2.5 rounded-lg transition-all flex items-center gap-2',
              adminSection === 'users'
                ? 'bg-white dark:bg-gray-700 text-amber-700 dark:text-amber-300 shadow-xs font-black'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <Users className="w-4 h-4 text-amber-500" />
            <span>Usuarios</span>
          </button>

          <button
            onClick={() => setAdminSection('reports')}
            className={cn(
              'px-4 py-2.5 rounded-lg transition-all flex items-center gap-2',
              adminSection === 'reports'
                ? 'bg-white dark:bg-gray-700 text-amber-700 dark:text-amber-300 shadow-xs font-black'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <Inbox className="w-4 h-4 text-amber-500" />
            <span>Reportes</span>
            {reportsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black">
                {reportsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {adminSection === 'users' ? (
        <UserManagement currentUserId={user?.id} />
      ) : adminSection === 'reports' ? (
        <ReportsManager
          onCountChange={setReportsCount}
          onReviewQuestion={(qId) => {
            setActiveQuestionId(qId);
            setAdminSection('import-review');
          }}
        />
      ) : adminSection === 'manage-questions' ? (
        <QuestionsManager
          onSelectQuestionForReview={(qId) => {
            setActiveQuestionId(qId);
            setAdminSection('import-review');
          }}
        />
      ) : (
        <div className="space-y-6 max-w-6xl">
          {/* Paso 1: importar a ancho completo para que el formulario respire */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <span className="w-7 h-7 rounded-full bg-emerald-600 text-white text-sm font-black flex items-center justify-center flex-shrink-0">
                1
              </span>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> Importar examen
              </h3>
              <span className="sm:ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded-full px-3 py-1">
                <FileJson className="w-3.5 h-3.5" /> JSON → Supabase
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 sm:ml-10">
              Sube un archivo <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">.json</code> o
              pega su contenido. Las preguntas se guardan directamente en Supabase.
            </p>
            <div className="max-w-2xl sm:ml-10">
              <JsonImporter
                onImportSuccess={() => {
                  const refreshed = useStore.getState().exams;
                  const firstQ = refreshed.flatMap((e) => e.sections.flatMap((s) => s.questions))[0];
                  if (firstQ) setActiveQuestionId(firstQ.id);
                }}
              />
            </div>
          </div>

          {/* Paso 2 y 3: lista (2/5) + revisión (3/5) */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white text-sm font-black flex items-center justify-center flex-shrink-0">
                  2
                </span>
                <h3 className="font-bold text-gray-900 dark:text-white">Elige una pregunta</h3>
              </div>

            {allQuestions.length > 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col h-[520px]">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">Preguntas Importadas</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {allQuestions.length} preguntas en {exams.length} examen(es)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: '¿Vaciar todas las preguntas?',
                          message: '¿Estás seguro de que deseas eliminar TODOS los exámenes y preguntas en Supabase? Esta acción no se puede deshacer.',
                          confirmLabel: 'Vaciar Todo',
                          onConfirm: async () => {
                            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                            await clearAllExams();
                            setActiveQuestionId(null);
                          },
                        });
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                      title="Eliminar todos los exámenes y preguntas cargadas"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Vaciar Todo
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-3">
                  {exams.map((exam, examIdx) => (
                    <div key={exam.id} className="mb-3 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl p-2 border border-gray-100 dark:border-gray-800">
                      <div className="flex items-center justify-between mb-1 px-1 gap-1">
                        <button
                          onClick={() => toggleExpanded(exam.id, examIdx === 0)}
                          title={isExpanded(exam.id, examIdx === 0) ? 'Contraer' : 'Expandir'}
                          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0"
                        >
                          {isExpanded(exam.id, examIdx === 0) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <div className="min-w-0 pr-1 flex-1">
                          {renamingExamId === exam.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    void (async () => {
                                      try {
                                        await renameExam(exam.id, renameDraft);
                                        setRenamingExamId(null);
                                        setRenameError(null);
                                      } catch (err) {
                                        setRenameError(err instanceof Error ? err.message : 'No se pudo renombrar.');
                                      }
                                    })();
                                  }
                                  if (e.key === 'Escape') setRenamingExamId(null);
                                }}
                                autoFocus
                                className="w-full text-xs p-1 bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 rounded font-medium text-gray-900 dark:text-white outline-none"
                              />
                              <button
                                onClick={() => {
                                  void (async () => {
                                    try {
                                      await renameExam(exam.id, renameDraft);
                                      setRenamingExamId(null);
                                      setRenameError(null);
                                    } catch (err) {
                                      setRenameError(err instanceof Error ? err.message : 'No se pudo renombrar.');
                                    }
                                  })();
                                }}
                                className="p-1 text-emerald-600 hover:text-emerald-800 flex-shrink-0"
                                title="Guardar nombre"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setRenamingExamId(null)}
                                className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <h4 className="font-bold text-xs uppercase text-gray-700 dark:text-gray-300 truncate" title={exam.title}>
                                {exam.title}
                              </h4>
                              <span className="text-[10px] text-gray-400">
                                {exam.sections.reduce((acc, s) => acc + s.questions.length, 0)} preguntas
                                {' · '}
                                {exam.sections.flatMap((s) => s.questions).filter((q) => q.status === 'NEEDS_REVIEW').length} en revisión
                              </span>
                              {exam.published ? (
                                <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold" title="Todas aprobadas: visible en práctica y simulacro">
                                  Publicado
                                </span>
                              ) : (
                                <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold" title="Tiene pendientes: ninguna se muestra hasta completar">
                                  Sin publicar
                                </span>
                              )}
                            </>
                          )}
                          {renameError && renamingExamId === exam.id && (
                            <p className="text-[10px] text-red-500 font-semibold">{renameError}</p>
                          )}
                        </div>
                        {renamingExamId !== exam.id && (
                          <button
                            onClick={() => {
                              setRenameDraft(exam.title);
                              setRenameError(null);
                              setRenamingExamId(exam.id);
                            }}
                            className="text-xs text-gray-400 hover:text-emerald-600 px-1.5 py-1 rounded font-semibold transition-colors flex-shrink-0"
                            title="Renombrar examen"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: `¿Eliminar documento "${exam.title}"?`,
                              message: `Se eliminarán todas las ${exam.sections.reduce((acc, s) => acc + s.questions.length, 0)} preguntas de este examen en Supabase. Esta acción es irreversible.`,
                              confirmLabel: 'Eliminar Examen',
                              onConfirm: async () => {
                                setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                                await deleteExam(exam.id);
                                if (activeQuestionId && exam.sections.some((s) => s.questions.some((q) => q.id === activeQuestionId))) {
                                  setActiveQuestionId(null);
                                }
                              },
                            });
                          }}
                          className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 px-2 py-1 rounded font-semibold transition-colors flex items-center gap-1 flex-shrink-0"
                          title="Eliminar este examen"
                        >
                          <Trash2 className="w-3 h-3" />
                          Eliminar
                        </button>
                      </div>
                      {isExpanded(exam.id, examIdx === 0) &&
                      exam.sections
                        .flatMap((s) => s.questions)
                        .map((q, idx) => (
                          <div key={`${q.id}-${idx}`} className="flex items-center gap-1 w-full min-w-0 my-0.5">
                            <button
                              onClick={() => setActiveQuestionId(q.id)}
                              className={cn(
                                'flex-1 min-w-0 text-left p-2 rounded-lg text-xs flex items-center justify-between transition-colors',
                                activeQuestionId === q.id
                                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-100 font-bold'
                                  : 'hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-300'
                              )}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden pr-1">
                                <span className="font-bold whitespace-nowrap text-gray-900 dark:text-white">Q{q.number}</span>
                                <span className="truncate opacity-75">{q.statement}</span>
                              </div>
                              {q.status === 'NEEDS_REVIEW' ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 ml-1" />
                              ) : q.status === 'APPROVED' || q.status === 'PUBLISHED' ? (
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 ml-1" />
                              ) : null}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmModal({
                                  isOpen: true,
                                  title: `¿Eliminar pregunta Q${q.number}?`,
                                  message: `Esta pregunta será eliminada de forma permanente del examen "${exam.title}".`,
                                  confirmLabel: 'Eliminar Pregunta',
                                  onConfirm: async () => {
                                    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                                    await deleteQuestion(exam.id, q.sectionId, q.id);
                                    if (activeQuestionId === q.id) setActiveQuestionId(null);
                                  },
                                });
                              }}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors flex-shrink-0"
                              title={`Eliminar pregunta Q${q.number}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-gray-500">No hay exámenes importados todavía.</div>
            )}
          </div>

          <div className="lg:col-span-3">
            {activeQuestion ? (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-emerald-600 text-white text-sm font-black flex items-center justify-center flex-shrink-0">
                    3
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-white">Revisa y publica</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {activeExam?.title} — Pregunta Q{activeQuestion.number}
                    </p>
                  </div>
                </div>
                <QuestionEditor
                  question={activeQuestion}
                  onSave={async (updates) => {
                    await updateQuestion(activeQuestion.examId, activeQuestion.sectionId, activeQuestion.id, updates);
                  }}
                  onDelete={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: `¿Eliminar pregunta Q${activeQuestion.number}?`,
                      message: `Se eliminará definitivamente la pregunta Q${activeQuestion.number} del examen. Esta acción no se puede deshacer.`,
                      confirmLabel: 'Eliminar Pregunta',
                      onConfirm: async () => {
                        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                        await deleteQuestion(activeQuestion.examId, activeQuestion.sectionId, activeQuestion.id);
                        setActiveQuestionId(null);
                      },
                    });
                  }}
                />

                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm flex justify-between items-center gap-2">
                      <span>Recursos visuales / Figuras</span>
                      <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded whitespace-nowrap">Importado JSON</span>
                    </h3>
                  </div>

                  <div className="p-4 bg-gray-100 dark:bg-gray-900/50">
                    {activeQuestion.assets && activeQuestion.assets.length > 0 ? (
                      <div className="space-y-6">
                        {activeQuestion.assets.map((asset, idx) => (
                          <div key={asset.id || idx} className="flex flex-col gap-2">
                            {asset.type === 'math' && asset.content && (
                              <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 overflow-x-auto shadow-sm">
                                <span className="text-xs font-bold text-gray-500 uppercase block mb-2">Fórmula (LaTeX)</span>
                                <BlockMath math={asset.content} />
                              </div>
                            )}
                            {asset.imagePath || asset.croppedImage ? (
                              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <CheckCircle className="w-4 h-4" /> Imagen vinculada
                                  </span>
                                  <span className="text-[11px] text-gray-400 font-mono">{asset.id}</span>
                                </div>
                                <div className="flex justify-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
                                  <img
                                    src={asset.imagePath || asset.croppedImage}
                                    alt={asset.description || 'Figura'}
                                    className="max-h-72 max-w-full object-contain rounded"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 border border-dashed border-amber-300 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs">
                                Figura pendiente de imagen.
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                        <CheckCircle className="w-10 h-10 text-emerald-500/40 mb-2" />
                        <p className="text-sm font-medium">Esta pregunta es solo de texto.</p>
                        <p className="text-xs text-gray-500 mt-1">Las imágenes del JSON se muestran aquí automáticamente.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-10 text-center text-gray-500 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50">
                <Settings className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-1">Nada que revisar por ahora</h4>
                <p className="text-sm max-w-sm mx-auto">
                  {allQuestions.length === 0
                    ? 'Importa un examen JSON en el paso 1 y sus preguntas aparecerán en la lista.'
                    : 'Selecciona una pregunta de la lista del paso 2 para editarla, aprobarla o publicarla aquí.'}
                </p>
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel || 'Eliminar'}
        cancelLabel="Cancelar"
        isDestructive={true}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
