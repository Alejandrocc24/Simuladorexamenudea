import React, { useState, useEffect } from 'react';
import { Question } from '../types';
import { MathRenderer } from './MathRenderer';
import { categoriesForSection } from '../lib/taxonomy';
import { 
  CheckCircle, 
  AlertTriangle, 
  Trash2, 
  Save, 
  Eye, 
  Edit3, 
  Brain, 
  Check, 
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { cn } from './Layout';

interface QuestionEditorProps {
  question: Question;
  onSave: (updates: Partial<Question>) => Promise<void>;
  onDelete: () => void;
}

export function QuestionEditor({ question, onSave, onDelete }: QuestionEditorProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  // Form State
  const [statement, setStatement] = useState(question.statement || '');
  const [options, setOptions] = useState(question.options || []);
  const [correctAnswer, setCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D' | undefined>(question.correctAnswer);
  const [explanation, setExplanation] = useState(question.explanation || '');
  const [topic, setTopic] = useState(question.topic || '');
  const [category, setCategory] = useState(question.category || '');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>(question.difficulty || 'medium');

  // Status feedback
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state whenever question changes
  useEffect(() => {
    setStatement(question.statement || '');
    setOptions(question.options && question.options.length === 4 
      ? question.options 
      : [
          { id: 'A', text: question.options?.[0]?.text || '' },
          { id: 'B', text: question.options?.[1]?.text || '' },
          { id: 'C', text: question.options?.[2]?.text || '' },
          { id: 'D', text: question.options?.[3]?.text || '' }
        ]
    );
    setCorrectAnswer(question.correctAnswer);
    setExplanation(question.explanation || '');
    setTopic(question.topic || '');
    setCategory(question.category || '');
    setDifficulty(question.difficulty || 'medium');
    setValidationError(null);
    setSaveSuccess(false);
  }, [question.id, question.statement, question.correctAnswer, question.status]);

  const handleOptionChange = (id: 'A' | 'B' | 'C' | 'D', text: string) => {
    setOptions(prev => prev.map(opt => opt.id === id ? { ...opt, text } : opt));
  };

  const validate = (): boolean => {
    if (!statement.trim() || statement.trim().length < 5) {
      setValidationError('El enunciado debe tener al menos 5 caracteres.');
      return false;
    }
    if (!options || options.length !== 4) {
      setValidationError('La pregunta debe contener las 4 opciones: A, B, C y D.');
      return false;
    }
    for (const opt of options) {
      if (!opt.text || !opt.text.trim()) {
        setValidationError(`La opción ${opt.id} no puede estar vacía.`);
        return false;
      }
    }
    if (!correctAnswer || !['A', 'B', 'C', 'D'].includes(correctAnswer)) {
      setValidationError('Debes seleccionar una opción (A, B, C o D) como respuesta correcta.');
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSave = async (extraUpdates: Partial<Question> = {}) => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      await onSave({
        statement,
        options,
        correctAnswer,
        explanation,
        topic,
        category: category || undefined,
        difficulty,
        needsReview: false,
        ...extraUpdates
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setValidationError('Error al guardar los cambios en la pregunta.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!validate()) return;
    const hasMissingAssets = question.assets && question.assets.some(a => !a.imagePath && !a.content && !a.croppedImage);
    if (hasMissingAssets) {
      setValidationError('Esta pregunta tiene figuras que requieren recorte o vinculación de imagen antes de publicarse.');
      return;
    }
    await handleSave({ status: 'PUBLISHED' });
  };

  const handleApprove = async () => {
    if (!validate()) return;
    await handleSave({ status: 'APPROVED' });
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 animate-in slide-in-from-right-4 flex flex-col">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="truncate">Edición: Pregunta Q{question.number}</span>
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {question.sectionId === 'razonamiento-logico' ? 'Razonamiento Lógico' : 'Competencia Lectora'}
            {question.confidence && (
              <span className={cn(
                'ml-2 px-2 py-0.5 rounded-full font-bold',
                question.confidence === 'low'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
              )} title="Confianza de la extracción IA (uso interno, no se muestra al estudiante)">
                confidence: {question.confidence}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status badge */}
          <span className={cn(
            "px-2.5 py-1 text-xs font-bold uppercase rounded-full",
            question.status === 'NEEDS_REVIEW' ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" :
            question.status === 'APPROVED' ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300" :
            question.status === 'PUBLISHED' ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" :
            "bg-gray-100 text-gray-800"
          )}>
            {question.status === 'NEEDS_REVIEW' ? 'Revisión' : question.status === 'APPROVED' ? 'Aprobada' : 'Publicada'}
          </span>

          <button
            onClick={onDelete}
            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors border border-transparent hover:border-red-200"
            title="Eliminar pregunta"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs: Edit vs Preview */}
      <div className="flex items-center justify-between mb-4 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl text-xs font-bold">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('edit')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors",
              activeTab === 'edit' ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Editar Contenido
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors",
              activeTab === 'preview' ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            Vista Previa
          </button>
        </div>

        {saveSuccess && (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold pr-2 animate-in fade-in">
            <Check className="w-3.5 h-3.5" /> ¡Guardado!
          </span>
        )}
      </div>

      {/* Validation Error Banner */}
      {validationError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{validationError}</span>
        </div>
      )}

      {/* TAB 1: EDIT MODE */}
      {activeTab === 'edit' ? (
        <div className="space-y-4 flex-1">
          {/* Metadata Row: Category / Topic / Difficulty */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Categoría (bloque oficial)
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-xs p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="">Sin clasificar</option>
                {categoriesForSection(question.sectionId).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Tema (dentro de su categoría)
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ej: Proporcionalidad directa, Áreas sombreadas"
                className="w-full text-xs p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Nivel de Dificultad
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                className="w-full text-xs p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
              >
                <option value="easy">Fácil</option>
                <option value="medium">Media</option>
                <option value="hard">Difícil</option>
              </select>
            </div>
          </div>

          {/* Statement Field */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                Enunciado de la Pregunta
              </label>
              <span className="text-[10px] text-gray-400">Soporta fórmulas en LaTeX con $f(x)$</span>
            </div>
            <textarea
              rows={4}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Escribe o corrige el enunciado de la pregunta..."
              className="w-full text-sm p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed font-normal"
            />
          </div>

          {/* Options List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                Opciones y Respuesta Correcta
              </label>
              <span className="text-[10px] text-emerald-600 font-bold">
                Haz clic en el botón A/B/C/D para marcar la correcta
              </span>
            </div>

            <div className="space-y-2">
              {options.map((opt) => {
                const isSelectedCorrect = correctAnswer === opt.id;
                return (
                  <div 
                    key={opt.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-xl border transition-colors",
                      isSelectedCorrect 
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30" 
                        : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setCorrectAnswer(opt.id as 'A' | 'B' | 'C' | 'D')}
                      className={cn(
                        "w-8 h-8 rounded-lg font-black text-xs flex items-center justify-center transition-all flex-shrink-0 cursor-pointer shadow-xs",
                        isSelectedCorrect 
                          ? "bg-emerald-600 text-white ring-2 ring-emerald-500 ring-offset-1" 
                          : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-emerald-100 hover:text-emerald-700"
                      )}
                      title={`Marcar opción ${opt.id} como correcta`}
                    >
                      {opt.id}
                    </button>

                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => handleOptionChange(opt.id as 'A' | 'B' | 'C' | 'D', e.target.value)}
                      placeholder={`Texto para la opción ${opt.id}...`}
                      className="flex-1 text-xs p-2 bg-transparent border-0 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500 rounded font-medium"
                    />

                    {isSelectedCorrect && (
                      <span className="text-[10px] uppercase font-black text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 flex-shrink-0">
                        Correcta
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Explanation Field */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-blue-500" />
                Explicación Pedagógica
              </label>
              <span className="text-[10px] text-gray-400">Paso a paso para el estudiante</span>
            </div>
            <textarea
              rows={3}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Explica detalladamente por qué la opción correcta es la seleccionada..."
              className="w-full text-xs p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed font-normal"
            />
          </div>
        </div>
      ) : (
        /* TAB 2: LIVE PREVIEW */
        <div className="space-y-4 flex-1 p-2">
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 space-y-3">
            <span className="text-xs font-bold uppercase text-gray-400">{topic || 'Sin tema'}</span>
            <div className="text-base text-gray-900 dark:text-white font-medium leading-relaxed">
              <MathRenderer text={statement} />
            </div>
          </div>

          <div className="space-y-2">
            {options.map((opt) => (
              <div 
                key={opt.id}
                className={cn(
                  "p-3 rounded-xl border flex items-start gap-3 text-xs",
                  correctAnswer === opt.id 
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 font-bold" 
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                )}
              >
                <span className="font-bold flex-shrink-0">{opt.id}.</span>
                <span className="flex-1"><MathRenderer text={opt.text} /></span>
                {correctAnswer === opt.id && (
                  <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-black">CORRECTA</span>
                )}
              </div>
            ))}
          </div>

          {explanation && (
            <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-xs text-blue-950 dark:text-blue-200 space-y-1">
              <strong className="flex items-center gap-1.5 text-blue-800 dark:text-blue-300">
                <Brain className="w-3.5 h-3.5" />
                Explicación:
              </strong>
              <div className="leading-relaxed">
                <MathRenderer text={explanation} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-4 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => handleSave()}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Guardar Cambios</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isSaving}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
            title="Aprobar pregunta para el banco"
          >
            Aprobar
          </button>
          
          <button
            type="button"
            onClick={handlePublish}
            disabled={isSaving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-xs"
            title="Aprobar y publicar directamente al modo Práctica"
          >
            Publicar a Práctica
          </button>
        </div>
      </div>
    </div>
  );
}
