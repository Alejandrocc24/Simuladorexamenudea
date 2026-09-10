import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  text: string;
  className?: string;
}

/**
 * Renders text containing Markdown (tables, bold, lists, etc.) 
 * and LaTeX math formulas ($...$ or $$...$$) using KaTeX.
 * Also cleans citation tags like [cite: 1].
 */
export const MathRenderer: React.FC<MathRendererProps> = ({ text, className = '' }) => {
  if (!text) return null;

  // Clean out [cite: ...] or [cite: 1, 2] artifacts from AI extraction
  const cleanText = text.replace(/\[cite:\s*[\d,\s]+\]/gi, '').trim();

  return (
    <div className={`prose-math leading-relaxed ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          table: ({ ...props }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-2xs">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm" {...props} />
            </div>
          ),
          thead: ({ ...props }) => (
            <thead className="bg-gray-100 dark:bg-gray-800 font-semibold text-gray-900 dark:text-white" {...props} />
          ),
          th: ({ ...props }) => (
            <th className="px-3 py-2 text-left font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700" {...props} />
          ),
          td: ({ ...props }) => (
            <td className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300" {...props} />
          ),
          p: ({ ...props }) => (
            <p className="my-1.5 inline-block w-full" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="list-disc list-inside my-2 space-y-1" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="list-decimal list-inside my-2 space-y-1" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="border-l-4 border-emerald-500 pl-4 py-1 my-2 italic bg-emerald-50/50 dark:bg-emerald-950/20 text-gray-700 dark:text-gray-300 rounded-r-lg" {...props} />
          ),
          code: ({ ...props }) => (
            <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-emerald-600 dark:text-emerald-400" {...props} />
          )
        }}
      >
        {cleanText}
      </Markdown>
    </div>
  );
};
