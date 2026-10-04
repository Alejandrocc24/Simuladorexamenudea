import React, { useState } from 'react';
import { SharedText, QuestionAsset } from '../types';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { contextLabel, displayContextTitle, inlineLabelOf, processSharedText } from '../lib/sessionGroups';

export interface SessionOrderItem {
  examId: string;
  number: number;
}

interface SharedContextBoxProps {
  sharedTexts?: SharedText[];
  questionNumber: number;
  /** Examen de origen (la identidad del grupo es examen + contexto). */
  examId?: string;
  /** Preguntas en orden de sesión para calcular posiciones (Regla 6). */
  sessionOrder?: SessionOrderItem[];
  className?: string;
  defaultExpanded?: boolean;
  /**
   * Assets con `target = "shared"` de la pregunta actual.
   * La herramienta de recorte repite la figura del texto compartido
   * como asset en cada pregunta del grupo; si se pasan aquí,
   * se muestran dentro del contexto y la página no debe repetirlos.
   */
  sharedImages?: QuestionAsset[];
}

export const SharedContextBox: React.FC<SharedContextBoxProps> = ({
  sharedTexts,
  questionNumber,
  examId = '',
  sessionOrder = [],
  className = '',
  defaultExpanded = true,
  sharedImages = []
}) => {
  if (!sharedTexts || !Array.isArray(sharedTexts) || sharedTexts.length === 0) {
    return null;
  }

  // Find all shared texts that apply to this question
  const matchingTexts = sharedTexts.filter(st =>
    Array.isArray(st.appliesToQuestions) && st.appliesToQuestions.includes(questionNumber)
  );

  if (matchingTexts.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-4 mb-6 ${className}`}>
      {matchingTexts.map((st) => (
        <SharedTextCard
          key={st.id}
          sharedText={st}
          defaultExpanded={defaultExpanded}
          sharedImages={sharedImages}
          label={contextLabel(st.appliesToQuestions ?? [], sessionOrder, examId)}
        />
      ))}
    </div>
  );
};

interface SharedTextCardProps {
  sharedText: SharedText;
  defaultExpanded: boolean;
  sharedImages?: QuestionAsset[];
  /** Etiqueta calculada por posiciones de sesión (Regla 6); null = sin orden. */
  label?: string | null;
}

const SharedTextCard: React.FC<SharedTextCardProps> = ({ sharedText, defaultExpanded, sharedImages = [], label = null }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const images = (sharedImages ?? []).filter((a) => {
    const src = a.imagePath || a.croppedImage || a.content || a.base64;
    return a.type === 'image' && !!src;
  });
  const title = displayContextTitle(sharedText.title);
  const body = label ? processSharedText(sharedText.text, inlineLabelOf(label)) : sharedText.text;

  return (
    <div className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/40 dark:from-indigo-950/30 dark:via-gray-900 dark:to-blue-950/20 shadow-sm overflow-hidden transition-all">
      {/* Header Bar */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-5 py-3.5 flex items-center justify-between cursor-pointer select-none bg-indigo-100/60 dark:bg-indigo-950/50 border-b border-indigo-200/70 dark:border-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/80 transition-colors"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-wider uppercase text-indigo-700 dark:text-indigo-300">
                Contexto de lectura / Situación
              </span>
              {label && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-200/70 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 font-semibold">
                  {label}
                </span>
              )}
            </div>
            <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">
              {title}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
          <span className="hidden sm:inline">{isExpanded ? 'Ocultar texto' : 'Ver texto completo'}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Content Area */}
      {isExpanded && (
        <div className="p-5 sm:p-6 text-gray-800 dark:text-gray-200 text-base leading-relaxed max-h-[600px] overflow-y-auto border-t border-indigo-100 dark:border-gray-800">
          {images.length > 0 && (
            <div className="mb-4 space-y-3">
              {images.map((a, idx) => {
                const src = a.imagePath || a.croppedImage || a.content || a.base64;
                return (
                  <figure key={a.id || idx} className="flex flex-col items-center gap-1.5">
                    <img
                      src={src}
                      alt={a.description || 'Figura del texto compartido'}
                      className="max-w-full max-h-80 object-contain rounded-lg border border-indigo-100 dark:border-indigo-900/50 bg-white dark:bg-gray-900"
                    />
                    {a.description && (
                      <figcaption className="text-xs text-gray-500 dark:text-gray-400 text-center">{a.description}</figcaption>
                    )}
                  </figure>
                );
              })}
            </div>
          )}
          <MathRenderer text={body} />
        </div>
      )}
    </div>
  );
};
