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
  // (defensive: the importer already strips them before saving).
  const cleanText = text.replace(/\[cite:\s*[\d,\s]+\]/gi, '').trim();

  return (
    <div className={`prose-math min-w-0 max-w-full break-words leading-relaxed ${className}`}>
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
            <td className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300 align-top" {...props} />
          ),
          tr: ({ ...props }) => (
            <tr className="align-top" {...props} />
          ),
          p: ({ ...props }) => (
            <p className="my-1.5 block w-full" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="list-disc list-outside my-2 ml-5 space-y-1 pl-1 [&_ul]:ml-4 [&_ul]:mt-1" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="list-decimal list-outside my-2 ml-5 space-y-1 pl-1 [&_ol]:ml-4 [&_ol]:mt-1" {...props} />
          ),
          li: ({ ...props }) => (
            <li className="pl-1 leading-relaxed [&>p]:my-0.5 [&>p]:inline" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="border-l-4 border-emerald-500 pl-4 pr-3 py-2 my-3 italic bg-emerald-50 dark:bg-emerald-950/30 text-gray-700 dark:text-gray-200 rounded-r-lg shadow-2xs [&>p]:my-1 [&_strong]:not-italic" {...props} />
          ),
          h1: ({ ...props }) => (
            <h1 className="text-lg font-bold mt-4 mb-2 text-gray-900 dark:text-white" {...props} />
          ),
          h2: ({ ...props }) => (
            <h2 className="text-base font-bold mt-4 mb-2 text-gray-900 dark:text-white" {...props} />
          ),
          h3: ({ ...props }) => (
            <h3 className="text-sm font-bold mt-3 mb-1.5 text-gray-900 dark:text-white" {...props} />
          ),
          hr: ({ ...props }) => (
            <hr className="my-4 border-gray-200 dark:border-gray-700" {...props} />
          ),
          a: ({ ...props }) => (
            <a className="text-emerald-700 dark:text-emerald-300 underline underline-offset-2 break-all" {...props} />
          ),
          strong: ({ ...props }) => (
            <strong className="font-bold text-gray-900 dark:text-white" {...props} />
          ),
          pre: ({ ...props }) => (
            <pre className="overflow-x-auto my-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs" {...props} />
          ),
          code: ({ ...props }) => (
            <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-emerald-600 dark:text-emerald-400 break-words" {...props} />
          )
        }}
      >
        {cleanText}
      </Markdown>
    </div>
  );
};
