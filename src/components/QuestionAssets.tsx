import React from 'react';
import { BlockMath } from 'react-katex';
import { QuestionAsset } from '../types';
import { cn } from './Layout';

interface QuestionAssetsProps {
  assets?: QuestionAsset[];
  /**
   * Cuando el SharedContextBox ya mostró las imágenes `target="shared"`,
   * se excluyen aquí para no repetirlas en cada pregunta del grupo.
   */
  sharedShown?: boolean;
  className?: string;
}

/** Assets principales: enunciado / tabla (todo menos el bloque de opciones). */
export function MainQuestionAssets({ assets, sharedShown = false, className = '' }: QuestionAssetsProps) {
  const list = (assets ?? []).filter((a) => {
    if (a.target === 'options') return false;
    if (sharedShown && a.target === 'shared') return false;
    return true;
  });
  if (list.length === 0) return null;
  return (
    <div className={cn('my-6 space-y-4', className)}>
      {list.map((asset, idx) => {
        const imgSrc = asset.imagePath || asset.croppedImage || asset.content || asset.base64;
        if (asset.type === 'image' && !imgSrc) return null;
        return (
          <div
            key={asset.id || idx}
            className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800"
          >
            {asset.type === 'image' && imgSrc && (
              <>
                <img
                  src={imgSrc}
                  alt={asset.description || 'Imagen de la pregunta'}
                  className="max-w-full max-h-96 object-contain rounded-lg shadow-sm"
                />
                {asset.description && (
                  <span className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">{asset.description}</span>
                )}
              </>
            )}
            {asset.type === 'math' && (
              <div className="text-lg overflow-x-auto w-full flex justify-center py-4 flex-col items-center gap-4">
                {asset.imagePath && <img src={asset.imagePath} alt="Formula original" className="max-w-full h-auto opacity-75 rounded" />}
                {asset.content && <BlockMath math={asset.content} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Bloque `target = "options"`: se muestra separado justo encima de los
 * botones de opción para que quede claro que la figura ES las opciones.
 */
export function OptionsAssetsBlock({ assets, className = '' }: { assets?: QuestionAsset[]; className?: string }) {
  const list = (assets ?? []).filter((a) => a.target === 'options');
  if (list.length === 0) return null;
  return (
    <div className={cn('mt-6 mb-2 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4', className)}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-3">
        Figura de las opciones — elige A, B, C o D según la imagen
      </p>
      <div className="space-y-3">
        {list.map((asset, idx) => {
          const imgSrc = asset.imagePath || asset.croppedImage || asset.content || asset.base64;
          if (!imgSrc) return null;
          return (
            <div key={asset.id || idx} className="flex flex-col items-center gap-1.5">
              <img
                src={imgSrc}
                alt={asset.description || 'Opciones en figura'}
                className="max-w-full max-h-96 object-contain rounded-lg bg-white dark:bg-gray-900 shadow-sm"
              />
              {asset.description && (
                <span className="text-xs text-gray-500 dark:text-gray-400 text-center">{asset.description}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Assets con `target = "shared"` para pasarle al SharedContextBox. */
export function sharedAssetsOf(assets?: QuestionAsset[]): QuestionAsset[] {
  return (assets ?? []).filter((a) => a.target === 'shared');
}

/** ¿El SharedContextBox va a mostrar contexto para esta pregunta? */
export function hasSharedContext(sharedTexts: { appliesToQuestions: number[] }[] | undefined, questionNumber: number): boolean {
  return !!sharedTexts?.some((st) => Array.isArray(st.appliesToQuestions) && st.appliesToQuestions.includes(questionNumber));
}

const QuestionAssets: React.FC<QuestionAssetsProps> = (props) => <MainQuestionAssets {...props} />;
export default QuestionAssets;
