import { Exam, Question, QuestionOption, Section, SharedText } from '../types';
import type { SupabaseExamRow, SupabaseQuestionRow } from './supabase';
import { normalizeConfidence, normalizeDifficulty } from './jsonClean';

/**
 * Parsea `periodo` ("2024-1", "2024", null).
 * `year` y `semester` pueden ser null (simulacros de institutos):
 * no se aplica ningún fallback a año actual / semestre 1.
 */
function parsePeriodo(periodo: string | null): { year: number | null; semester: 1 | 2 | null } {
  if (!periodo) return { year: null, semester: null };
  const m = periodo.match(/(\d{4})\s*[-_/]?\s*([12])?/);
  if (!m) return { year: null, semester: null };
  const year = Number(m[1]);
  return {
    year: Number.isFinite(year) ? year : null,
    semester: m[2] === '2' ? 2 : m[2] === '1' ? 1 : null,
  };
}

/** Serializa año/semestre (admitiendo null) al formato `periodo` de Supabase. */
export function toPeriodo(year: number | null, semester: 1 | 2 | null): string | null {
  if (year == null && semester == null) return null;
  if (year != null && semester != null) return `${year}-${semester}`;
  if (year != null) return `${year}`;
  return null;
}

function toSectionId(area: string): string {
  const a = area.toLowerCase();
  if (a.includes('lector') || a.includes('competencia') || a === 'lectora') return 'competencia-lectora';
  return 'razonamiento-logico';
}

function normalizeOptions(raw: unknown): QuestionOption[] {
  if (Array.isArray(raw)) {
    return (raw as Array<{ id?: string; texto?: string; text?: string; value?: string }>).slice(0, 5).map((opt, idx) => {
      const letter = String(opt.id ?? ['A', 'B', 'C', 'D', 'E'][idx] ?? 'A').toUpperCase().slice(0, 1) as QuestionOption['id'];
      const text = String(opt.texto ?? opt.text ?? opt.value ?? '').trim();
      return { id: letter, text };
    });
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const out: QuestionOption[] = [];
    for (const key of ['A', 'B', 'C', 'D', 'E']) {
      const v = obj[key] ?? obj[key.toLowerCase()];
      if (v !== undefined) out.push({ id: key as QuestionOption['id'], text: String(v).trim() });
    }
    return out;
  }
  return [];
}

function normalizeImages(raw: unknown): Question['assets'] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((item, idx) => {
      if (typeof item === 'string') {
        if (!item) return null;
        return { id: `img-${idx}`, type: 'image' as const, imagePath: item, croppedImage: item.startsWith('data:') ? item : undefined };
      }
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const url = String(o['imagePath'] ?? o['croppedImage'] ?? o['base64'] ?? o['url'] ?? o['content'] ?? o['image'] ?? '');
        if (!url) return null;
        const target = typeof o['target'] === 'string' ? (o['target'] as string) : undefined;
        return {
          id: String(o['id'] ?? `img-${idx}`),
          type: 'image' as const,
          target,
          imagePath: url,
          croppedImage: url.startsWith('data:') ? url : typeof o['croppedImage'] === 'string' ? (o['croppedImage'] as string) : undefined,
          description: typeof o['description'] === 'string' ? (o['description'] as string) : undefined,
        };
      }
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

function normalizeSharedTexts(raw: unknown): SharedText[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s, idx) => {
      const appliesRaw = s['appliesToQuestions'] ?? s['appliesTo'] ?? [];
      const appliesToQuestions = Array.isArray(appliesRaw)
        ? appliesRaw.map(Number).filter((n) => Number.isFinite(n))
        : [];
      return {
        id: String(s['id'] ?? `texto-${idx + 1}`),
        title: String(s['title'] ?? s['titulo'] ?? ''),
        text: String(s['text'] ?? s['content'] ?? s['contenido'] ?? ''),
        content: typeof s['content'] === 'string' ? (s['content'] as string) : undefined,
        appliesToQuestions,
      };
    })
    .filter((s) => s.text.length > 0 || s.title.length > 0);
}

export function supabaseQuestionToApp(q: SupabaseQuestionRow, examTitle: string): Question {
  const options = normalizeOptions(q.opciones);
  const rawAnswer = (q.respuesta_correcta ?? '').toString().trim().toUpperCase();
  const correctAnswer = ['A', 'B', 'C', 'D'].includes(rawAnswer)
    ? (rawAnswer as 'A' | 'B' | 'C' | 'D')
    : null;
  const hasValidOptions = options.length >= 4 && options.slice(0, 4).every(o => o.text.length > 0);
  const confidence = normalizeConfidence(q.confidence);
  // `confidence = low` queda pendiente de revisión hasta que el admin la apruebe,
  // aunque traiga respuesta oficial.
  const lowConfidence = confidence === 'low';
  const published = Boolean(q.tiene_respuesta_oficial) && correctAnswer !== null && hasValidOptions && !lowConfidence;

  return {
    id: q.id,
    examId: q.exam_id,
    sectionId: toSectionId(q.area),
    number: q.numero_original ?? 0,
    statement: q.enunciado_md ?? '',
    options,
    correctAnswer,
    assets: normalizeImages(q.imagenes),
    explanation: q.explicacion_md ?? '',
    topic: q.tema ?? (toSectionId(q.area) === 'competencia-lectora' ? 'Competencia Lectora' : 'Razonamiento Lógico'),
    category: typeof q.category === 'string' && q.category ? q.category : undefined,
    confidence: confidence ?? (typeof q.confidence === 'string' && q.confidence ? q.confidence : undefined),
    difficulty: normalizeDifficulty(q.difficulty),
    status: published ? 'PUBLISHED' : 'NEEDS_REVIEW',
    needsReview: !published,
    reviewNotes: published
      ? ''
      : lowConfidence
        ? 'Importada con confidence=low: pendiente de revisión por el administrador antes de publicar.'
        : 'Pregunta importada desde JSON; requiere respuesta oficial y 4 opciones completas.',
    source: {
      fileId: q.exam_id,
      originalFileName: `${examTitle}.json`,
      extractionMethod: 'manual',
      importedAt: q.created_at ?? new Date().toISOString(),
      page: 1,
      originalText: q.enunciado_md ?? '',
    },
  };
}

export function supabaseToExams(
  examRows: SupabaseExamRow[],
  questionRows: SupabaseQuestionRow[]
): Exam[] {
  const byExam = new Map<string, SupabaseQuestionRow[]>();
  for (const q of questionRows) {
    const list = byExam.get(q.exam_id) ?? [];
    list.push(q);
    byExam.set(q.exam_id, list);
  }

  return examRows.map((e) => {
    const { year, semester } = parsePeriodo(e.periodo);
    const qs = (byExam.get(e.id) ?? [])
      .map((q) => supabaseQuestionToApp(q, e.nombre ?? 'Examen'))
      .sort((a, b) => a.number - b.number);

    const sectionsMap = new Map<string, Section>();
    sectionsMap.set('razonamiento-logico', { id: 'razonamiento-logico', name: 'Razonamiento Lógico', questions: [] });
    sectionsMap.set('competencia-lectora', { id: 'competencia-lectora', name: 'Competencia Lectora', questions: [] });

    for (const q of qs) {
      if (!sectionsMap.has(q.sectionId)) {
        sectionsMap.set(q.sectionId, { id: q.sectionId, name: q.sectionId, questions: [] });
      }
      sectionsMap.get(q.sectionId)!.questions.push(q);
    }

    return {
      id: e.id,
      title: e.nombre ?? 'Examen sin título',
      year,
      semester,
      sections: Array.from(sectionsMap.values()).filter((s) => s.questions.length > 0),
      sharedTexts: normalizeSharedTexts(e.shared_texts ?? e.sharedTexts),
      sourceFileId: e.id,
      sourceFileName: `${e.nombre ?? 'examen'}.json`,
    };
  });
}

// Helpers para el importador JSON -> filas Supabase
export function areaToSupabase(sectionId: string): 'logico' | 'lectora' {
  const s = sectionId.toLowerCase();
  if (s.includes('lector') || s.includes('competencia') || s.includes('español') || s === 'lectora') return 'lectora';
  return 'logico';
}
