import React, { useEffect, useMemo, useState } from 'react';
import { supabase, formatDbError } from '../lib/supabase';
import { reportReasonLabel } from './ReportQuestion';
import { MathRenderer } from './MathRenderer';
import { Inbox, CheckCircle2, XCircle, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';
import { cn } from './Layout';

export interface QuestionReport {
  id: string;
  question_id: string;
  question_number: number;
  exam_id: string;
  exam_title: string;
  area: string;
  topic: string;
  statement: string;
  reporter_email: string;
  reason: string;
  message: string;
  status: string;
  created_at: string;
}

interface ReportsManagerProps {
  onCountChange?: (pending: number) => void;
  onReviewQuestion?: (questionId: string) => void;
}

type StatusFilter = 'pendiente' | 'resuelta' | 'descartada' | 'all';

export function ReportsManager({ onCountChange, onReviewQuestion }: ReportsManagerProps) {
  const [reports, setReports] = useState<QuestionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('pendiente');
  const [missingTable, setMissingTable] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('admin_list_reports');
      if (error) throw new Error(formatDbError(error));
      setReports((data ?? []) as QuestionReport[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudieron cargar los reportes.';
      if (/function|does not exist|relation/i.test(msg)) {
        setMissingTable(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingCount = useMemo(() => reports.filter((r) => r.status === 'pendiente').length, [reports]);

  useEffect(() => {
    onCountChange?.(pendingCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount]);

  const filtered = useMemo(
    () => (filter === 'all' ? reports : reports.filter((r) => r.status === filter)),
    [reports, filter]
  );

  const resolve = async (report: QuestionReport, status: 'resuelta' | 'descartada') => {
    setActionId(report.id);
    setError(null);
    try {
      const { error } = await supabase.rpc('admin_resolve_report', {
        p_report_id: report.id,
        p_status: status,
      });
      if (error) throw new Error(formatDbError(error));
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status } : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el reporte.');
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-sm text-gray-500">
        <RefreshCw className="w-4 h-4 animate-spin" /> Cargando reportes...
      </div>
    );
  }

  if (missingTable) {
    return (
      <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-xl flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>Ejecuta <code>supabase/migration_v5_question_reports.sql</code> para activar los reportes de preguntas.</span>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Inbox className="w-4 h-4 text-amber-500" /> Reportes de preguntas
            {pendingCount > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500 text-white font-black">
                {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Errores que los usuarios encuentran al practicar.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(['pendiente', 'resuelta', 'descartada', 'all'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-bold transition-colors',
                filter === f
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              )}
            >
              {f === 'all' ? `Todos (${reports.length})` : `${f[0].toUpperCase()}${f.slice(1)}s (${reports.filter((r) => r.status === f).length})`}
            </button>
          ))}
          <button
            onClick={fetchReports}
            className="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title="Recargar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="m-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="p-4 space-y-3">
        {filtered.length === 0 && (
          <div className="py-10 text-center">
            <Inbox className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">Sin reportes aquí</p>
            <p className="text-xs text-gray-400 mt-1">
              {filter === 'pendiente' ? 'Nadie ha reportado errores. Todo en orden.' : 'No hay reportes con este estado.'}
            </p>
          </div>
        )}
        {filtered.map((r) => {
          const busy = actionId === r.id;
          return (
            <div
              key={r.id}
              className={cn(
                'rounded-xl border p-4 space-y-3',
                r.status === 'pendiente'
                  ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/10'
                  : 'border-gray-200 dark:border-gray-700'
              )}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-1 bg-gray-900 text-white dark:bg-white dark:text-gray-900 rounded-md font-black">
                  Q{r.question_number}
                </span>
                <span className="font-bold text-gray-700 dark:text-gray-300 truncate max-w-[220px]" title={r.exam_title}>
                  {r.exam_title || 'Examen'}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 font-bold">
                  {reportReasonLabel(r.reason)}
                </span>
                {r.status !== 'pendiente' && (
                  <span className={cn(
                    'px-2 py-0.5 rounded font-bold',
                    r.status === 'resuelta'
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  )}>
                    {r.status === 'resuelta' ? 'Resuelta' : 'Descartada'}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-gray-400">
                  {r.reporter_email || 'Anónimo'} · {new Date(r.created_at).toLocaleString('es-CO')}
                </span>
              </div>

              <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 rounded-lg p-3">
                “{r.message}”
              </p>

              <details className="text-xs text-gray-500 dark:text-gray-400">
                <summary className="cursor-pointer font-semibold hover:text-gray-800 dark:hover:text-gray-200">
                  Ver enunciado reportado ({r.topic || r.area})
                </summary>
                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300">
                  <MathRenderer text={r.statement} />
                </div>
              </details>

              <div className="flex flex-wrap items-center gap-2">
                {onReviewQuestion && (
                  <button
                    onClick={() => onReviewQuestion(r.question_id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                  >
                    Revisar pregunta <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                {r.status === 'pendiente' && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => resolve(r, 'resuelta')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 rounded-lg disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Marcar resuelta
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => resolve(r, 'descartada')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Descartar
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
