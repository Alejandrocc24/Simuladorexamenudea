import React, { useState } from 'react';
import { SharedText } from '../types';
import { BookOpen, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { MathRenderer } from './MathRenderer';

interface SharedContextBoxProps {
  sharedTexts?: SharedText[];
  questionNumber: number;
  className?: string;
  defaultExpanded?: boolean;
}

export const SharedContextBox: React.FC<SharedContextBoxProps> = ({
  sharedTexts,
  questionNumber,
  className = '',
  defaultExpanded = true
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
        <SharedTextCard key={st.id} sharedText={st} defaultExpanded={defaultExpanded} />
      ))}
    </div>
  );
};

interface SharedTextCardProps {
  sharedText: SharedText;
  defaultExpanded: boolean;
}

const SharedTextCard: React.FC<SharedTextCardProps> = ({ sharedText, defaultExpanded }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

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
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-200/70 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 font-semibold flex items-center gap-1">
                <Layers className="w-3 h-3" />
                Preguntas {sharedText.appliesToQuestions.join(', ')}
              </span>
            </div>
            <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">
              {sharedText.title || 'Texto de referencia'}
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
        <div className="p-5 sm:p-6 text-gray-800 dark:text-gray-200 text-base leading-relaxed max-h-[500px] overflow-y-auto border-t border-indigo-100 dark:border-gray-800">
          <MathRenderer text={sharedText.text} />
        </div>
      )}
    </div>
  );
};
