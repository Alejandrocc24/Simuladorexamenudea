import { Question, SharedText } from '../types';

/**
 * Grupos y unidades de sesión.
 *
 * Un grupo = preguntas de un MISMO examen conectadas por contextos
 * compartidos, de forma transitiva. Identidad: (examen + contexto).
 * Una pregunta sin contexto es una unidad suelta.
 * Al mezclar, las unidades salen completas y en orden original (por number);
 * jamás se parte un grupo.
 */

export interface Unit {
  examId: string;
  /** Ids en orden original (por number). */
  questionIds: string[];
}

function unionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  return { find, union };
}

/**
 * Construye unidades desde un pool ya filtrado. Si el filtro dejó solo parte
 * de un grupo, el resto presente sigue junto y en orden (Regla 4).
 */
export function buildUnits(
  questions: Question[],
  sharedTextsByExam: Map<string, SharedText[]>
): Unit[] {
  const byExam = new Map<string, Question[]>();
  for (const q of questions) {
    const list = byExam.get(q.examId) ?? [];
    list.push(q);
    byExam.set(q.examId, list);
  }

  const units: Unit[] = [];
  for (const [examId, qs] of byExam) {
    const indexByNumber = new Map<number, number>();
    qs.forEach((q, i) => {
      if (!indexByNumber.has(q.number)) indexByNumber.set(q.number, i);
    });
    const { find, union } = unionFind(qs.length);
    const shared = sharedTextsByExam.get(examId) ?? [];
    for (const st of shared) {
      const present = (st.appliesToQuestions ?? [])
        .map((n) => indexByNumber.get(n))
        .filter((i): i is number => i !== undefined);
      for (let k = 1; k < present.length; k++) union(present[0], present[k]);
    }
    const groups = new Map<number, number[]>();
    qs.forEach((q, i) => {
      const root = find(i);
      const list = groups.get(root) ?? [];
      list.push(i);
      groups.set(root, list);
    });
    for (const idxs of groups.values()) {
      idxs.sort((a, b) => qs[a].number - qs[b].number);
      units.push({ examId, questionIds: idxs.map((i) => qs[i].id) });
    }
  }

  // Orden determinista base: por examen y número mínimo.
  const minNumber = (u: Unit, byId: Map<string, Question>) =>
    Math.min(...u.questionIds.map((id) => byId.get(id)?.number ?? 0));
  const byId = new Map(questions.map((q) => [q.id, q]));
  units.sort((a, b) =>
    a.examId.localeCompare(b.examId) || minNumber(a, byId) - minNumber(b, byId)
  );
  return units;
}

export function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function flattenUnits(units: Unit[], byId: Map<string, Question>): Question[] {
  const out: Question[] = [];
  for (const u of units) {
    for (const id of u.questionIds) {
      const q = byId.get(id);
      if (q) out.push(q);
    }
  }
  return out;
}

/**
 * Arma exactamente `target` preguntas mezclando UNIDADES (RL).
 * Suma una unidad solo si el total no pasa el objetivo; si queda un hueco
 * que no se llena, reintenta con otra mezcla. Null si el banco no alcanza.
 */
export function assembleExact(
  questions: Question[],
  sharedTextsByExam: Map<string, SharedText[]>,
  target: number,
  maxRetries = 60
): Question[] | null {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const units = buildUnits(questions, sharedTextsByExam);
  const total = units.reduce((a, u) => a + u.questionIds.length, 0);
  if (total < target) return null;
  if (units.some((u) => u.questionIds.length > target)) return null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const picked: Unit[] = [];
    let count = 0;
    for (const u of shuffleArray(units)) {
      if (count + u.questionIds.length <= target) {
        picked.push(u);
        count += u.questionIds.length;
        if (count === target) break;
      }
    }
    if (count === target) return flattenUnits(picked, byId);
  }
  return null;
}

/** Mezcla por unidades completas (práctica), cada una en orden original. */
export function assembleShuffled(
  questions: Question[],
  sharedTextsByExam: Map<string, SharedText[]>
): Question[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return flattenUnits(shuffleArray(buildUnits(questions, sharedTextsByExam)), byId);
}

/** Orden secuencial por unidades (sin mezclar), cada una en orden original. */
export function assembleSequential(
  questions: Question[],
  sharedTextsByExam: Map<string, SharedText[]>
): Question[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return flattenUnits(buildUnits(questions, sharedTextsByExam), byId);
}

// ---------- Etiqueta del contexto (Regla 6) ----------

function compactRanges(sorted: number[]): string {
  const runs: number[][] = [];
  for (const n of sorted) {
    const last = runs[runs.length - 1];
    if (last && n === last[last.length - 1] + 1) last.push(n);
    else runs.push([n]);
  }
  const parts = runs.map((r) => {
    if (r.length === 1) return `${r[0]}`;
    if (r.length === 2) return `${r[0]} y ${r[1]}`;
    return `${r[0]} a ${r[r.length - 1]}`;
  });
  const body = parts.join(' y ');
  return parts.length === 1 && runs[0].length === 1 ? `Pregunta ${body}` : `Preguntas ${body}`;
}

/**
 * Etiqueta calculada con las posiciones (desde 1) que las preguntas del
 * contexto tienen en la sesión actual. Solo cuenta las presentes.
 * `order` = preguntas en orden de sesión; `examId` = examen del contexto.
 */
export function contextLabel(
  appliesToQuestions: number[],
  order: Array<{ examId: string; number: number }>,
  examId: string
): string | null {
  const wanted = new Set(appliesToQuestions ?? []);
  const positions: number[] = [];
  order.forEach((item, idx) => {
    if (item.examId === examId && wanted.has(item.number)) positions.push(idx + 1);
  });
  if (positions.length === 0) return null;
  positions.sort((a, b) => a - b);
  return compactRanges(positions);
}

// ---------- Título y texto del contexto (Reglas 7 y 8) ----------

const TITLE_HAS_NUMBERS = /preguntas?\s+\d/i;

/** Si el título referencia números de pregunta, se muestra "Contexto". */
export function displayContextTitle(title: string | undefined | null): string {
  const t = (title ?? '').trim();
  if (!t || TITLE_HAS_NUMBERS.test(t)) return 'Contexto';
  return t;
}

const REF_BASE =
  '(?:las\\s+)?preguntas?\\s+(?:de\\s+la\\s+|del\\s+)?\\d+(?:\\s*(?:y|a\\s+la|al|a|-)\\s*\\d+)?';
const REF_INLINE_RE = new RegExp(REF_BASE, 'gi');
const REF_HEADER_RE = new RegExp(`^\\s*${REF_BASE}\\s*\\.?\\s*$`, 'i');

/**
 * Procesa el texto al mostrar (sin modificar lo guardado):
 * - Elimina líneas que son solo un encabezado ("Preguntas 19 a 22.").
 * - Reemplaza frases dentro de una oración por la etiqueta calculada,
 *   en minúscula ("preguntas 13 y 14"), conservando "las" si la había.
 */
export function processSharedText(text: string, inlineLabel: string): string {
  if (!text) return text;
  const lines = text.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    REF_HEADER_RE.lastIndex = 0;
    if (REF_HEADER_RE.test(line)) continue;
    REF_INLINE_RE.lastIndex = 0;
    kept.push(
      line.replace(REF_INLINE_RE, (m) => `${/^las\s/i.test(m) ? 'las ' : ''}${inlineLabel}`)
    );
  }
  return kept.join('\n').trim() || text;
}

/** Versión en minúscula de una etiqueta ("Preguntas 13 y 14" → "preguntas 13 y 14"). */
export function inlineLabelOf(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}
