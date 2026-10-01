import { Question } from '../types';

/** Bloques oficiales por área (JSON v3, listas cerradas). */
export const RL_CATEGORIES = [
  'Proporcionalidad y cálculo',
  'Álgebra y patrones',
  'Geométrico y espacial',
  'Análisis de información',
  'Lógica y deducción',
] as const;

export const CL_CATEGORIES = ['Literal', 'Inferencial', 'Analógica'] as const;

export function categoriesForSection(sectionId: string): string[] {
  const s = (sectionId ?? '').toLowerCase();
  if (s.includes('lector') || s.includes('competencia') || s.includes('lectora')) {
    return [...CL_CATEGORIES];
  }
  return [...RL_CATEGORIES];
}

export interface TopicNode {
  topic: string;
  count: number;
}

export interface CategoryNode {
  category: string;
  count: number;
  topics: TopicNode[];
}

/**
 * Construye el árbol Área → Categoría → Tema con conteos.
 * Las preguntas sin `category` caen en "Sin clasificar" para no perderlas.
 * Sirve tanto para los filtros de práctica como para la futura sección "Aprende".
 */
export function buildCategoryTree(questions: Question[]): CategoryNode[] {
  const byCat = new Map<string, Map<string, number>>();
  for (const q of questions) {
    const cat = (q.category ?? '').trim() || 'Sin clasificar';
    const topic = (q.topic ?? '').trim() || 'Sin tema';
    if (!byCat.has(cat)) byCat.set(cat, new Map());
    const topics = byCat.get(cat)!;
    topics.set(topic, (topics.get(topic) ?? 0) + 1);
  }
  return Array.from(byCat.entries())
    .map(([category, topics]) => ({
      category,
      count: Array.from(topics.values()).reduce((a, b) => a + b, 0),
      topics: Array.from(topics.entries())
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic, 'es')),
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, 'es'));
}

export function filterByCategoryTopic(
  questions: Question[],
  category: string | 'all',
  topic: string | 'all'
): Question[] {
  return questions.filter((q) => {
    const cat = (q.category ?? '').trim() || 'Sin clasificar';
    const top = (q.topic ?? '').trim() || 'Sin tema';
    if (category !== 'all' && cat !== category) return false;
    if (topic !== 'all' && top !== topic) return false;
    return true;
  });
}
