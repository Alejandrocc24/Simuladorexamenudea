export type Difficulty = 'easy' | 'medium' | 'hard';
export type AreaId = 'razonamiento-logico' | 'competencia-lectora' | string;
export type QuestionStatus = 'DRAFT' | 'NEEDS_REVIEW' | 'APPROVED' | 'PUBLISHED';

export interface QuestionAsset {
  id: string;
  type: 'image' | 'math' | 'table';
  /** Dónde va la imagen dentro de la pregunta (informativo, v2/v3 del recortador). */
  target?: 'statement' | 'table' | 'options' | 'shared' | string;
  content?: string; // URL for image, LaTeX for math, etc.
  imagePath?: string; // URL to the cropped image
  croppedImage?: string; // Direct base64 Data URI
  base64?: string; // Alternative base64 representation
  description?: string;
  needsCropping?: boolean;
  bbox?: { x: number; y: number; width: number; height: number }; // Percentage coords 0-100
  confidence?: number;
  questionIds?: string[]; // To share asset across questions
}

export interface QuestionOption {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export type QuestionConfidence = 'high' | 'medium' | 'low';

export interface Question {
  id: string;
  examId: string;
  sectionId: AreaId;
  number: number;
  statement: string;
  options: QuestionOption[];
  correctAnswer: 'A' | 'B' | 'C' | 'D' | null;
  assets?: QuestionAsset[];
  explanation: string;
  topic: string;
  /** Bloque oficial del examen (lista cerrada por área, JSON v3). */
  category?: string;
  /** Confianza de la extracción IA. Uso interno, no se muestra al estudiante. */
  confidence?: QuestionConfidence | string;
  /** Hash del enunciado normalizado (detección de duplicados). */
  statementHash?: string | null;
  /** Referencia legible a la posible original ("Q12 · Examen 2024-1"). */
  duplicadaDe?: string | null;
  difficulty: Difficulty;
  status: QuestionStatus;
  needsReview?: boolean;
  reviewNotes?: string;
  sharedTextId?: string;
  source: {
    fileId: string;
    originalFileName: string;
    extractionMethod: 'pdf-text' | 'ocr' | 'manual';
    importedAt: string;
    page: number;
    originalText?: string;
    answerSource?: string;
    pageImageUrl?: string;
  };
}

export interface Section {
  id: AreaId;
  name: string;
  questions: Question[];
}

export interface SharedText {
  id: string;
  title: string;
  text: string;
  content?: string;
  appliesToQuestions: number[];
}

export interface Exam {
  id: string;
  title: string;
  /** Null en simulacros de institutos (sin año/semestre oficial). */
  year: number | null;
  semester: 1 | 2 | null;
  /**
   * Todo o nada: true solo cuando TODAS sus preguntas están aprobadas/
   * publicadas individualmente. Si hay una pendiente, ninguna se ve en
   * práctica o simulacro.
   */
  published: boolean;
  sections: Section[];
  sharedTexts?: SharedText[];
  sourceFileId?: string;
  sourceFileName?: string;
}

export interface PracticeSession {
  id: string;
  userId?: string;
  examId: string;
  sectionId: AreaId;
  startTime: number;
  endTime?: number;
  durationSeconds?: number;
  answers: Record<string, 'A' | 'B' | 'C' | 'D'>;
  score?: number;
  totalQuestions?: number;
  correctCount?: number;
  completedAt?: string;
}

export interface SectionScoreSummary {
  sectionId: string;
  sectionName: string;
  total: number;
  answered: number;
  correct: number;
  percentage: number;
}

export interface MockExamSession {
  id: string;
  userId?: string;
  examId: string;
  examTitle: string;
  startTime: number;
  endTime?: number;
  durationSeconds: number; // e.g. 180 * 60 = 10800
  timeSpentSeconds: number;
  answers: Record<string, 'A' | 'B' | 'C' | 'D'>;
  flaggedQuestionIds: string[];
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  overallScorePercentage: number;
  sectionBreakdown: Record<string, SectionScoreSummary>;
  completedAt: string;
}
