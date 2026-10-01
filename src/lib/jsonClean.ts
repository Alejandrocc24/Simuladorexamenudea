/**
 * Limpieza defensiva del JSON v3 al importar.
 * El recortador (v2) ya limpia, pero el importador debe aplicar lo mismo
 * por si llega un JSON sin pasar por él.
 */

/** Quita marcas `[cite: N]` / `[cite: N, M]` que Gemini deja en el texto. */
export function stripCitations(text: string): string {
  return text.replace(/\[cite:\s*[\d,\s]+\]/gi, '');
}

/**
 * Corrige barras invertidas de LaTeX duplicadas.
 * Tras `JSON.parse`, la cadena debe contener UNA barra (`\frac`),
 * pero Gemini a veces deja DOS (`\\frac`) y KaTeX interpreta `\\`
 * como salto de línea, rompiendo la fórmula.
 */
export function fixDoubleBackslashes(text: string): string {
  return text.replace(/\\\\(?=[A-Za-z{},;])/g, '\\');
}

/** Limpieza completa para un campo de texto del examen. */
export function cleanImportText(value: unknown): string {
  if (typeof value !== 'string') return typeof value === 'number' ? String(value) : '';
  return fixDoubleBackslashes(stripCitations(value)).trim();
}

/** Limpia los campos de texto de una pregunta / texto compartido. */
export function cleanQuestionTexts<T extends Record<string, unknown>>(q: T): T {
  const out: Record<string, unknown> = { ...q };
  if ('statement' in out) out['statement'] = cleanImportText(out['statement']);
  if ('enunciado' in out) out['enunciado'] = cleanImportText(out['enunciado']);
  if ('explanation' in out) out['explanation'] = cleanImportText(out['explanation']);
  if ('explicacion' in out) out['explicacion'] = cleanImportText(out['explicacion']);
  if ('title' in out && typeof out['title'] === 'string') {
    out['title'] = cleanImportText(out['title']);
  }
  if ('text' in out && typeof out['text'] === 'string') {
    out['text'] = cleanImportText(out['text']);
  }
  const rawOptions = out['options'] ?? out['opciones'];
  if (Array.isArray(rawOptions)) {
    out['options'] = (rawOptions as Array<Record<string, unknown>>).map((opt) => {
      if (opt && typeof opt === 'object') {
        const o = { ...opt };
        if ('text' in o) o['text'] = cleanImportText(o['text']);
        if ('texto' in o) o['texto'] = cleanImportText(o['texto']);
        return o;
      }
      return opt;
    });
  }
  return out as T;
}

/**
 * Detecta un JSON cortado antes de intentar importarlo.
 * Un JSON completo termina en `}` o `]` (con espacios finales permitidos).
 */
export function isTruncatedJson(rawText: string): boolean {
  const t = rawText.trim();
  if (!t) return false;
  return !/[\}\]]\s*$/.test(t);
}

/** Intenta parsear avisando si el JSON parece cortado. */
export function parseExamJson(rawText: string): unknown {
  if (isTruncatedJson(rawText)) {
    throw new Error(
      'El JSON parece estar cortado (no termina en `}` o `]`). ' +
        'Revisa que el archivo esté completo y vuelve a intentarlo; no se importó nada.'
    );
  }
  try {
    return JSON.parse(rawText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'JSON inválido';
    if (/unexpected end|end of (json )?input|truncat/i.test(msg)) {
      throw new Error(
        `El JSON parece estar cortado (${msg}). No se importó nada; pega el archivo completo.`
      );
    }
    throw err;
  }
}

/** Normaliza `difficulty` del JSON a easy|medium|hard. */
export function normalizeDifficulty(raw: unknown): 'easy' | 'medium' | 'hard' {
  const v = String(raw ?? 'medium').toLowerCase().trim();
  if (v === 'easy' || v === 'facil' || v === 'fácil') return 'easy';
  if (v === 'hard' || v === 'dificil' || v === 'difícil') return 'hard';
  return 'medium';
}

/** Normaliza `confidence` del JSON v3 a high|medium|low. */
export function normalizeConfidence(raw: unknown): 'high' | 'medium' | 'low' | null {
  const v = String(raw ?? '').toLowerCase().trim();
  if (v === 'high' || v === 'alta') return 'high';
  if (v === 'medium' || v === 'media') return 'medium';
  if (v === 'low' || v === 'baja') return 'low';
  return null;
}
