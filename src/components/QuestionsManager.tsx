import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { statementHash } from '../lib/jsonClean';
import { Question } from '../types';
import { 
  Trash2, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  Image as ImageIcon, 
  FileText, 
  CheckSquare, 
  Square,
  BookOpen,
  Edit3,
  Fingerprint
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { cn } from './Layout';
import { ConfirmModal } from './ConfirmModal';

interface QuestionsManagerProps {
  onSelectQuestionForReview?: (questionId: string) => void;
}

export function QuestionsManager({ onSelectQuestionForReview }: QuestionsManagerProps) {
  const { exams, deleteQuestion, deleteExam, fetchExams } = useStore();

  const [selectedExamId, setSelectedExamId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [hashRunning, setHashRunning] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // In-app Confirm Modal State (replaces blocked window.confirm)
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

  // Flatten all questions with exam and section context
  const flatQuestions = useMemo(() => {
    const list: Array<{
      question: Question;
      examId: string;
      examTitle: string;
      sectionId: string;
      sectionTitle: string;
    }> = [];

    exams.forEach(exam => {
      exam.sections.forEach(section => {
        section.questions.forEach(q => {
          list.push({
            question: q,
            examId: exam.id,
            examTitle: exam.title,
            sectionId: section.id,
            sectionTitle: section.name || section.id
          });
        });
      });
    });

    return list;
  }, [exams]);

  // Filter questions
  const filteredQuestions = useMemo(() => {
    return flatQuestions.filter(item => {
      const q = item.question;
      
      // Filter by Exam
      if (selectedExamId !== 'all' && item.examId !== selectedExamId) {
        return false;
      }

      // Filter by Status
      if (selectedStatus === 'NEEDS_REVIEW' && q.status !== 'NEEDS_REVIEW') {
        return false;
      }
      if (selectedStatus === 'APPROVED' && q.status !== 'APPROVED' && q.status !== 'PUBLISHED') {
        return false;
      }

      // Filter by Section
      if (selectedSection !== 'all') {
        const sec = item.sectionId.toLowerCase();
        if (selectedSection === 'rl' && !sec.includes('razonamiento')) return false;
        if (selectedSection === 'cl' && !sec.includes('lector') && !sec.includes('competencia')) return false;
      }

      // Filter by Category (bloque oficial v3)
      if (selectedCategory !== 'all' && (q.category ?? 'Sin clasificar') !== selectedCategory) {
        return false;
      }

      // Filter by Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesNumber = String(q.number).includes(query);
        const matchesStatement = (q.statement || '').toLowerCase().includes(query);
        const matchesTopic = (q.topic || '').toLowerCase().includes(query);
        const matchesCategory = (q.category || '').toLowerCase().includes(query);
        if (!matchesNumber && !matchesStatement && !matchesTopic && !matchesCategory) {
          return false;
        }
      }

      return true;
    });
  }, [flatQuestions, selectedExamId, selectedStatus, selectedSection, selectedCategory, searchQuery]);

  // Categorías disponibles con conteo (para el filtro)
  const categoryOptions = useMemo(() => {
    const map = new Map<string, number>();
    flatQuestions.forEach(({ question: q }) => {
      const cat = (q.category ?? '').trim() || 'Sin clasificar';
      map.set(cat, (map.get(cat) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  }, [flatQuestions]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 4000);
  };

  // Delete single question with in-app confirm
  const handleDeleteQuestion = (examId: string, sectionId: string, questionId: string, qNumber: number) => {
    setConfirmModal({
      isOpen: true,
      title: `¿Eliminar pregunta Q${qNumber}?`,
      message: `Esta pregunta se eliminará de forma permanente del examen y de la base de datos. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar Pregunta',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          await deleteQuestion(examId, sectionId, questionId);
          setSelectedQuestionIds(prev => {
            const next = new Set(prev);
            next.delete(questionId);
            return next;
          });
          showNotification('success', `Pregunta Q${qNumber} eliminada correctamente.`);
        } catch (err) {
          showNotification('error', 'Error al eliminar la pregunta.');
        }
      }
    });
  };

  // Bulk delete selected with in-app confirm
  const handleBulkDelete = () => {
    const count = selectedQuestionIds.size;
    if (count === 0) return;

    setConfirmModal({
      isOpen: true,
      title: `¿Eliminar las ${count} preguntas seleccionadas?`,
      message: `Se eliminarán permanentemente las ${count} preguntas marcadas de sus respectivos exámenes. Esta acción es irreversible.`,
      confirmLabel: `Eliminar ${count} preguntas`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const idsToDelete = Array.from(selectedQuestionIds);
          for (const qId of idsToDelete) {
            const target = flatQuestions.find(item => item.question.id === qId);
            if (target) {
              await deleteQuestion(target.examId, target.sectionId, target.question.id);
            } else {
              let found = false;
              for (const ex of exams) {
                for (const sec of ex.sections) {
                  const q = sec.questions.find(item => item.id === qId);
                  if (q) {
                    await deleteQuestion(ex.id, sec.id, q.id);
                    found = true;
                    break;
                  }
                }
                if (found) break;
              }
              if (!found) {
                await deleteQuestion('', '', qId);
              }
            }
          }
          setSelectedQuestionIds(new Set());
          showNotification('success', `Se han eliminado ${count} preguntas exitosamente.`);
        } catch (err) {
          showNotification('error', 'Hubo un error al eliminar algunas preguntas.');
        }
      }
    });
  };

  const toggleSelectAll = () => {
    if (selectedQuestionIds.size === filteredQuestions.length && filteredQuestions.length > 0) {
      setSelectedQuestionIds(new Set());
    } else {
      setSelectedQuestionIds(new Set(filteredQuestions.map(item => item.question.id)));
    }
  };

  const toggleQuestionSelection = (id: string) => {
    setSelectedQuestionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Counts for overview
  const totalCount = flatQuestions.length;
  const reviewCount = flatQuestions.filter(q => q.question.status === 'NEEDS_REVIEW').length;
  const approvedCount = flatQuestions.filter(q => q.question.status === 'APPROVED' || q.question.status === 'PUBLISHED').length;
  const missingHashCount = flatQuestions.filter(q => !q.question.statementHash).length;

  // Backfill de hashes para preguntas importadas antes de la migración v3c
  // (una sola vez; así los próximos imports detectan duplicados viejos).
  const runHashBackfill = async () => {
    const missing = flatQuestions.filter(q => !q.question.statementHash && q.question.statement.trim());
    if (missing.length === 0) return;
    setHashRunning(true);
    try {
      const BATCH = 50;
      for (let i = 0; i < missing.length; i += BATCH) {
        await Promise.all(
          missing.slice(i, i + BATCH).map(({ question: q }) =>
            supabase.from('questions').update({ statement_hash: statementHash(q.statement) }).eq('id', q.id)
          )
        );
      }
      await fetchExams();
      showNotification('success', `Hashes generados para ${missing.length} pregunta(s). Los próximos imports detectarán duplicados.`);
    } catch (err) {
      showNotification('error', 'No se pudieron generar los hashes (¿aplicaste la migración v3c?).');
    } finally {
      setHashRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedbackMessage && (
        <div className={cn(
          "p-4 rounded-xl flex items-center gap-3 shadow-md animate-in fade-in slide-in-from-top-2 duration-300 font-medium text-sm",
          feedbackMessage.type === 'success' 
            ? "bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200" 
            : "bg-red-50 dark:bg-red-950/70 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-200"
        )}>
          {feedbackMessage.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Total Preguntas</span>
          <span className="text-2xl font-black text-gray-900 dark:text-white mt-1 block">{totalCount}</span>
          <span className="text-[11px] text-gray-400 mt-1 block">en {exams.length} documento(s)</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Por Revisar</span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block">{reviewCount}</span>
          <span className="text-[11px] text-gray-400 mt-1 block">Pendientes de confirmación</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Aprobadas / Listas</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">{approvedCount}</span>
          <span className="text-[11px] text-gray-400 mt-1 block">Listas para simulacro</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">Documentos</span>
          <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">{exams.length}</span>
          <span className="text-[11px] text-gray-400 mt-1 block">Exámenes en base de datos</span>
        </div>
      </div>

      {/* Control / Filter Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por número (ej: 42), tema o texto del enunciado..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Exam selector */}
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="text-xs font-semibold bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Todos los documentos ({totalCount})</option>
              {exams.map(e => {
                const count = e.sections.reduce((acc, s) => acc + s.questions.length, 0);
                return (
                  <option key={e.id} value={e.id}>
                    {e.title} ({count} preguntas)
                  </option>
                );
              })}
            </select>

            {/* Status selector */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs font-semibold bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Todos los estados</option>
              <option value="NEEDS_REVIEW">Pendientes de revisión ({reviewCount})</option>
              <option value="APPROVED">Aprobadas ({approvedCount})</option>
            </select>

            {/* Section selector */}
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="text-xs font-semibold bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Todas las áreas</option>
              <option value="rl">Razonamiento Lógico</option>
              <option value="cl">Competencia Lectora</option>
            </select>

            {/* Category selector (bloque oficial v3) */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs font-semibold bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-emerald-500"
              title="Filtrar por categoría oficial"
            >
              <option value="all">Todas las categorías</option>
              {categoryOptions.map(([cat, count]) => (
                <option key={cat} value={cat}>
                  {cat} ({count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk Action & Selection Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-700/60 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              {selectedQuestionIds.size === filteredQuestions.length && filteredQuestions.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Square className="w-4 h-4 text-gray-400" />
              )}
              <span>
                {selectedQuestionIds.size === filteredQuestions.length && filteredQuestions.length > 0 
                  ? 'Deseleccionar todas' 
                  : `Seleccionar visibles (${filteredQuestions.length})`}
              </span>
            </button>

            {selectedQuestionIds.size > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold">
                {selectedQuestionIds.size} seleccionada(s)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {missingHashCount > 0 && (
              <button
                onClick={runHashBackfill}
                disabled={hashRunning}
                title="Calcula el hash de duplicados para preguntas importadas antes de la migración v3c (una sola vez)"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs transition-colors disabled:opacity-50"
              >
                <Fingerprint className="w-3.5 h-3.5" />
                {hashRunning ? 'Generando...' : `Generar hashes (${missingHashCount})`}
              </button>
            )}
            {selectedQuestionIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-xs transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar {selectedQuestionIds.size} seleccionada(s)
              </button>
            )}

            {selectedExamId !== 'all' && (
              <button
                onClick={() => {
                  const examTarget = exams.find(e => e.id === selectedExamId);
                  if (!examTarget) return;
                  setConfirmModal({
                    isOpen: true,
                    title: `¿Eliminar documento "${examTarget.title}"?`,
                    message: `Se eliminará todo el documento y todas sus preguntas asociadas. Esta acción no se puede deshacer.`,
                    confirmLabel: 'Eliminar Documento',
                    onConfirm: async () => {
                      setConfirmModal(prev => ({ ...prev, isOpen: false }));
                      await deleteExam(selectedExamId);
                      setSelectedExamId('all');
                      showNotification('success', `Documento "${examTarget.title}" eliminado por completo.`);
                    }
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 text-gray-700 dark:text-gray-300 rounded-lg font-semibold transition-colors"
                title="Eliminar este documento y todas sus preguntas"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                Eliminar este documento completo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Questions List / Cards */}
      {filteredQuestions.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center border border-gray-100 dark:border-gray-700">
          <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h4 className="text-base font-bold text-gray-800 dark:text-gray-200">No se encontraron preguntas</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
            {totalCount === 0 
              ? 'No hay ningún examen cargado. Importa un archivo JSON desde la pestaña de Importación.' 
              : 'No hay preguntas que coincidan con los filtros de búsqueda seleccionados.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuestions.map(({ question: q, examId, examTitle, sectionId, sectionTitle }) => {
            const isSelected = selectedQuestionIds.has(q.id);
            const hasImages = (q.assets && q.assets.some(a => a.type === 'image' && (a.imagePath || a.croppedImage || a.content || a.base64))) || false;
            const parentExam = exams.find(e => e.id === examId);
            const matchingShared = parentExam?.sharedTexts?.filter(st => st.appliesToQuestions?.includes(q.number)) || [];

            return (
              <div 
                key={q.id}
                className={cn(
                  "bg-white dark:bg-gray-800 rounded-xl border p-4 transition-all hover:shadow-sm",
                  isSelected 
                    ? "border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20" 
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                )}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => toggleQuestionSelection(q.id)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    <span className="px-2.5 py-1 bg-gray-900 text-white dark:bg-white dark:text-gray-900 rounded-md font-black text-xs">
                      Q{q.number}
                    </span>

                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                      {sectionTitle || sectionId}
                    </span>

                    {q.category && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold truncate max-w-[220px]" title={`Categoría: ${q.category} · Tema: ${q.topic}`}>
                        {q.category}
                      </span>
                    )}

                    {q.confidence === 'low' && (
                      <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300" title="Confianza IA baja: requiere revisión antes de publicar">
                        confidence: low
                      </span>
                    )}

                    <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 truncate max-w-[200px]" title={examTitle}>
                      {examTitle}
                    </span>

                    {/* Status Badge */}
                    {q.status === 'NEEDS_REVIEW' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-3 h-3" /> Pendiente revisión
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                        <CheckCircle className="w-3 h-3" /> Aprobada
                      </span>
                    )}

                    {/* Has Image Badge */}
                    {hasImages && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-semibold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                        <ImageIcon className="w-3 h-3" /> Con imagen
                      </span>
                    )}

                    {/* Shared context badge */}
                    {matchingShared.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-semibold bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300" title={matchingShared.map(s => s.title || s.id).join(', ')}>
                        <FileText className="w-3 h-3" /> Contexto compartido
                      </span>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {onSelectQuestionForReview && (
                      <button
                        onClick={() => onSelectQuestionForReview(q.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        title="Ver y editar en panel de revisión"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-blue-500" />
                        Revisar
                      </button>
                    )}

                    {/* Prominent Red Delete Button */}
                    <button
                      onClick={() => handleDeleteQuestion(examId, sectionId, q.id, q.number)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-900/60 rounded-lg transition-colors border border-red-200 dark:border-red-900/50"
                      title={`Eliminar pregunta Q${q.number}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>

                {/* Statement Body */}
                <div className="pt-3">
                  <div className="text-sm text-gray-900 dark:text-white leading-relaxed line-clamp-3">
                    <MathRenderer text={q.statement} />
                  </div>

                  {/* Options summary */}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {q.options.map(opt => (
                      <span 
                        key={opt.id} 
                        className={cn(
                          "px-2 py-0.5 rounded border text-[11px]",
                          q.correctAnswer === opt.id 
                            ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-800 dark:text-emerald-200 font-bold" 
                            : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400"
                        )}
                      >
                        <strong className="mr-1">{opt.id}:</strong> 
                        <span className="truncate max-w-[150px] inline-block align-bottom">{opt.text}</span>
                      </span>
                    ))}
                    {q.correctAnswer && (
                      <span className="ml-auto text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center gap-1">
                        Respuesta correcta: <span className="underline">{q.correctAnswer}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* In-app Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel || 'Eliminar'}
        cancelLabel="Cancelar"
        isDestructive={true}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
