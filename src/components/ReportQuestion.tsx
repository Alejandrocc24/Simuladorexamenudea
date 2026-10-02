import React, { useState } from 'react';
import { Flag, X, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase, formatDbError } from '../lib/supabase';
import { cn } from './Layout';

export const REPORT_REASONS: Array<{ id: string; label: string }> = [
  { id: 'respuesta-mala', label: 'La respuesta está mala' },
  { id: 'enunciado-error', label: 'Al enunciado le falta algo / tiene un error' },
  { id: 'opciones-error', label: 'Las opciones están mal o confusas' },
  { id: 'explicacion-error', label: 'La explicación está mal' },
  { id: 'imagen-error', label: 'La imagen no se ve / falta' },
  { id: 'otro', label: 'Otro motivo' },
];

export function reportReasonLabel(id: string): string {
  return REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
}

interface ReportQuestionProps {
  questionId: string;
  questionNumber?: number;
  className?: string;
}

/** Botón "Reportar" + modal con motivos y texto libre. */
export function ReportQuestion({ questionId, questionNumber, className = '' }: ReportQuestionProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('respuesta-mala');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const reset = () => {
    setReason('respuesta-mala');
    setMessage('');
    setError(null);
  };

  const handleSubmit = async () => {
    if (message.trim().length < 3) {
      setError('Cuéntanos brevemente cuál es el problema.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const { error } = await supabase.rpc('submit_question_report', {
        p_question_id: questionId,
        p_reason: reason,
        p_message: message.trim(),
      });
      if (error) throw new Error(formatDbError(error));
      setSent(true);
      setTimeout(() => {
        setOpen(false);
        setSent(false);
        reset();
      }, 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el reporte.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          reset();
          setSent(false);
          setOpen(true);
        }}
        title="Reportar un error en esta pregunta"
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border',
          'bg-gray-50 border-gray-200 text-gray-500 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700',
          'dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-amber-950/40 dark:hover:text-amber-300',
          className
        )}
      >
        <Flag className="w-3.5 h-3.5" />
        <span>Reportar</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !sending && setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-5 space-y-4 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-500" />
                Reportar pregunta{questionNumber ? ` #${questionNumber}` : ''}
              </h3>
              <button
                onClick={() => !sending && setOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {sent ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm rounded-xl flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                <span>¡Gracias! Revisaremos tu reporte.</span>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">¿Cuál es el problema?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REPORT_REASONS.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setReason(r.id)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border',
                          reason === r.id
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-amber-300'
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Explícalo con tus palabras
                  </label>
                  <textarea
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ej: la respuesta correcta debería ser la C porque..."
                    className="w-full text-sm p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500 leading-relaxed"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={sending}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sending ? 'Enviando...' : 'Enviar reporte'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
