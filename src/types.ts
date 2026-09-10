export type Difficulty = 'easy' | 'medium' | 'hard';
export type AreaId = 'razonamiento-logico' | 'competencia-lectora' | string;
export type QuestionStatus = 'DRAFT' | 'NEEDS_REVIEW' | 'APPROVED' | 'PUBLISHED';

export interface QuestionAsset {
  id: string;
  type: 'image' | 'math' | 'table';
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
  year: number;
  semester: 1 | 2 | null;
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
