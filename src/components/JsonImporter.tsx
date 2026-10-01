import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { FileJson, Upload, Download, CheckCircle2, AlertTriangle, FileCode, Copy, Check, Info } from 'lucide-react';
import { cn } from './Layout';
import { supabase, formatDbError } from '../lib/supabase';
import { areaToSupabase, toPeriodo } from '../lib/examAdapter';
import {
  cleanImportText,
  cleanQuestionTexts,
  isTruncatedJson,
  normalizeConfidence,
  normalizeDifficulty,
  parseExamJson,
} from '../lib/jsonClean';

interface JsonImporterProps {
  onImportSuccess?: () => void;
}

export const SAMPLE_JSON_TEMPLATE = {
  title: 'Examen UdeA 2024-1 (Ejemplo)',
  year: 2024,
  semester: 1,
  sharedTexts: [
    {
      id: 'texto-1',
      title: 'TEXTO 1 - Comprensión de Lectura',
      text: 'Lea el siguiente texto y responda la pregunta a continuación:\n\n*«La investigación científica no es solo acumulación de datos, sino la búsqueda incesante de principios explicativos unificadores...»*',
      appliesToQuestions: [3],
    },
  ],
  questions: [
    {
      number: 1,
      sectionId: 'razonamiento-logico',
      statement: 'En una fábrica se producen 120 piezas por hora utilizando 3 máquinas idénticas. Si se agregan 2 máquinas con el mismo rendimiento, ¿cuántas piezas en total se producirán en una jornada de 4 horas?',
      options: [
        { id: 'A', text: '600 piezas' },
        { id: 'B', text: '800 piezas' },
        { id: 'C', text: '720 piezas' },
        { id: 'D', text: '960 piezas' },
      ],
      correctAnswer: 'B',
      explanation: 'Cada máquina produce 120 / 3 = 40 piezas/hora. Con 5 máquinas: 5 × 40 = 200 piezas/hora. En 4 horas: 200 × 4 = 800 piezas.',
      topic: 'Proporcionalidad directa',
      category: 'Proporcionalidad y cálculo',
      confidence: 'high',
      difficulty: 'medium',
      assets: [],
    },
    {
      number: 2,
      sectionId: 'razonamiento-logico',
      statement: 'Observe la siguiente figura geométrica adjunta. Determine el área de la región sombreada si el cuadrado exterior tiene lado de 10 cm.',
      options: [
        { id: 'A', text: '25 cm²' },
        { id: 'B', text: '50 cm²' },
        { id: 'C', text: '75 cm²' },
        { id: 'D', text: '100 cm²' },
      ],
      correctAnswer: 'B',
      explanation: 'El área sombreada equivale geométricamente a la mitad del cuadrado exterior: $(10 \\times 10) / 2 = 50\\text{ cm}^2$.',
      topic: 'Áreas sombreadas',
      category: 'Geométrico y espacial',
      confidence: 'high',
      difficulty: 'medium',
      assets: [],
    },
    {
      number: 3,
      sectionId: 'competencia-lectora',
      statement: 'De acuerdo con el texto, la palabra «paradójico» en el segundo párrafo se emplea con el sentido de:',
      options: [
        { id: 'A', text: 'Contradictorio pero verosímil' },
        { id: 'B', text: 'Completamente inverosímil y absurdo' },
        { id: 'C', text: 'Irrelevante para la conclusión principal' },
        { id: 'D', text: 'Demostrado científicamente' },
      ],
      correctAnswer: 'A',
      explanation: '> **Tip:** una paradoja plantea una contradicción aparente que encierra una verdad válida en su contexto.',
      topic: 'Vocabulario en contexto',
      category: 'Literal',
      confidence: 'medium',
      difficulty: 'easy',
      assets: [],
    },
  ],
};

/**
 * Extrae las imágenes de una pregunta (herramienta de recorte v2):
 * `{ type: "image", target, description, croppedImage, croppedFromPage }`.
 * Se conserva `target`/`description` cuando existen para poder separar
 * visualmente el bloque de opciones y mostrar el contexto compartido.
 * El orden del arreglo se respeta (compartido → enunciado → tabla → opciones).
 */
function extractImages(q: Record<string, unknown>): Array<string | Record<string, unknown>> {
  const out: Array<string | Record<string, unknown>> = [];
  const pushUrl = (v: unknown) => {
    if (typeof v === 'string' && v) out.push(v);
  };
  const pushEntry = (o: Record<string, unknown>) => {
    const url = o['imagePath'] ?? o['croppedImage'] ?? o['base64'] ?? o['image'] ?? o['url'] ?? o['content'];
    if (typeof url !== 'string' || !url) return;
    const target = typeof o['target'] === 'string' ? o['target'] : undefined;
    const description = typeof o['description'] === 'string' ? o['description'] : undefined;
    const croppedFromPage = o['croppedFromPage'];
    // Sin metadatos se guarda el string plano (compatibilidad con filas viejas).
    if (!target && !description) {
      out.push(url);
      return;
    }
    const entry: Record<string, unknown> = { imagePath: url, croppedImage: url };
    if (target) entry['target'] = target;
    if (description) entry['description'] = description;
    if (typeof croppedFromPage === 'number') entry['croppedFromPage'] = croppedFromPage;
    out.push(entry);
  };
  const assets = q['assets'];
  if (Array.isArray(assets)) {
    for (const a of assets) {
      if (typeof a === 'string') pushUrl(a);
      else if (a && typeof a === 'object') pushEntry(a as Record<string, unknown>);
    }
  }
  const recortes = q['imagenes_recorte'];
  if (Array.isArray(recortes)) {
    for (const img of recortes) {
      if (typeof img === 'string') pushUrl(img);
      else if (img && typeof img === 'object') {
        const o = img as Record<string, unknown>;
        pushUrl(o['croppedImage'] ?? o['base64']);
      }
    }
  }
  if (typeof q['imagen_recorte'] === 'string') pushUrl(q['imagen_recorte']);
  const imagenes = q['imagenes'];
  if (Array.isArray(imagenes)) imagenes.forEach(pushUrl);
  return out.filter(Boolean).slice(0, 10);
}

function normalizeYear(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function normalizeSemester(raw: unknown): 1 | 2 | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (n === 1) return 1;
  if (n === 2) return 2;
  return null;
}

function normalizeSharedTexts(raw: unknown): Array<{ id: string; title: string; text: string; appliesToQuestions: number[] }> {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .filter((s) => s && typeof s === 'object')
    .map((s, idx) => {
      const appliesRaw = s['appliesToQuestions'] ?? s['appliesTo'] ?? [];
      const appliesToQuestions = Array.isArray(appliesRaw)
        ? appliesRaw.map(Number).filter((n) => Number.isFinite(n))
        : [];
      return {
        id: String(s['id'] ?? `texto-${idx + 1}`),
        title: cleanImportText(s['title'] ?? s['titulo'] ?? ''),
        text: cleanImportText(s['text'] ?? s['content'] ?? s['contenido'] ?? ''),
        appliesToQuestions,
      };
    })
    .filter((s) => s.text.length > 0 || s.title.length > 0);
}

function normalizeOptionsForSupabase(q: Record<string, unknown>): Array<{ id: string; texto: string }> {
  const raw = q['options'] ?? q['opciones'];
  if (Array.isArray(raw)) {
    return (raw as Array<{ id?: string; texto?: string; text?: string; value?: string }>).slice(0, 5).map((opt, idx) => ({
      id: String(opt.id ?? ['A', 'B', 'C', 'D', 'E'][idx] ?? 'A').toUpperCase().slice(0, 1),
      texto: String(opt.texto ?? opt.text ?? opt.value ?? '').trim(),
    }));
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const out: Array<{ id: string; texto: string }> = [];
    for (const key of ['A', 'B', 'C', 'D', 'E']) {
      const v = obj[key] ?? obj[key.toLowerCase()];
      if (v !== undefined) out.push({ id: key, texto: String(v).trim() });
    }
    return out;
  }
  return [];
}

export function JsonImporter({ onImportSuccess }: JsonImporterProps) {
  const { fetchExams } = useStore();
  const [subMode, setSubMode] = useState<'file' | 'paste'>('file');
  const [jsonText, setJsonText] = useState('');
  const [parsedData, setParsedData] = useState<unknown | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyzeJSON = (data: unknown) => {
    const d = data as Record<string, unknown>;
    try {
      let questionsList: Array<Record<string, unknown>> = [];
      let examTitle = 'Examen sin título';

      if (Array.isArray(data)) {
        questionsList = data as Array<Record<string, unknown>>;
        examTitle = `Examen (${questionsList.length} preguntas)`;
      } else if (d && Array.isArray(d['questions'])) {
        questionsList = d['questions'] as Array<Record<string, unknown>>;
        examTitle = String(d['title'] ?? 'Examen UdeA');
      } else if (d && Array.isArray(d['exams'])) {
        const exams = d['exams'] as Array<Record<string, unknown>>;
        questionsList = exams.flatMap((e) => (Array.isArray(e['questions']) ? (e['questions'] as Array<Record<string, unknown>>) : []));
        examTitle = String(exams[0]?.['title'] ?? 'Múltiples Exámenes');
      } else {
        throw new Error('El JSON no contiene un arreglo de preguntas ("questions" o directamente una lista [ ... ]).');
      }

      if (questionsList.length === 0) {
        throw new Error('El archivo JSON no contiene ninguna pregunta.');
      }

      let rlCount = 0;
      let clCount = 0;
      let imagesCount = 0;
      let sharedTextsCount = 0;
      let lowConfidenceCount = 0;

      questionsList.forEach((q) => {
        const sec = String(q['sectionId'] ?? q['area'] ?? q['section'] ?? '').toLowerCase();
        if (sec.includes('lector') || sec.includes('competencia') || sec.includes('español')) clCount++;
        else rlCount++;
        imagesCount += extractImages(q).length;
        if (normalizeConfidence(q['confidence']) === 'low') lowConfidenceCount++;
      });

      if (d && Array.isArray(d['sharedTexts'])) {
        sharedTextsCount = (d['sharedTexts'] as unknown[]).length;
      } else if (d && Array.isArray(d['exams'])) {
        sharedTextsCount = (d['exams'] as Array<Record<string, unknown>>).reduce(
          (acc, e) => acc + (Array.isArray(e['sharedTexts']) ? (e['sharedTexts'] as unknown[]).length : 0),
          0
        );
      }

      return { title: examTitle, totalQuestions: questionsList.length, rlCount, clCount, base64ImagesCount: imagesCount, sharedTextsCount, lowConfidenceCount };
    } catch (e: unknown) {
      throw new Error(e instanceof Error ? e.message : 'Error validando estructura del examen.');
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setSuccessMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (isTruncatedJson(text)) {
          throw new Error('El JSON parece estar cortado (no termina en `}` o `]`). No se importó nada; verifica el archivo completo.');
        }
        const parsed = parseExamJson(text);
        analyzeJSON(parsed);
        setParsedData(parsed);
      } catch (err: unknown) {
        setParsedData(null);
        setParseError(`JSON inválido: ${err instanceof Error ? err.message : 'error desconocido'}`);
      }
    };
    reader.onerror = () => {
      setParseError('No se pudo leer el archivo seleccionado.');
    };
    reader.readAsText(file);
  };

  const handleTextChange = (text: string) => {
    setJsonText(text);
    setParseError(null);
    setSuccessMessage(null);

    if (!text.trim()) {
      setParsedData(null);
      return;
    }

    try {
      const parsed = parseExamJson(text);
      analyzeJSON(parsed);
      setParsedData(parsed);
    } catch (err: unknown) {
      setParsedData(null);
      setParseError(err instanceof Error ? err.message : 'JSON inválido');
    }
  };

  interface ExamToImport {
    title: string;
    year: number | null;
    semester: 1 | 2 | null;
    questions: Array<Record<string, unknown>>;
    sharedTexts: Array<{ id: string; title: string; text: string; appliesToQuestions: number[] }>;
  }

  const collectExamsToImport = (data: unknown): Array<ExamToImport> => {
    const d = data as Record<string, unknown>;
    if (Array.isArray(data)) {
      return [{
        title: `Examen Importado ${new Date().toLocaleDateString('es-CO')}`,
        year: null,
        semester: null,
        questions: data as Array<Record<string, unknown>>,
        sharedTexts: [],
      }];
    }
    if (d && Array.isArray(d['exams'])) {
      return (d['exams'] as Array<Record<string, unknown>>).map((e) => ({
        title: cleanImportText(e['title'] ?? e['nombre'] ?? 'Examen sin título') || 'Examen sin título',
        year: normalizeYear(e['year']),
        semester: normalizeSemester(e['semester']),
        questions: (Array.isArray(e['questions']) ? e['questions'] : []) as Array<Record<string, unknown>>,
        sharedTexts: normalizeSharedTexts(e['sharedTexts']),
      }));
    }
    if (d && Array.isArray(d['questions'])) {
      return [
        {
          title: cleanImportText(d['title'] ?? 'Examen sin título') || 'Examen sin título',
          year: normalizeYear(d['year']),
          semester: normalizeSemester(d['semester']),
          questions: d['questions'] as Array<Record<string, unknown>>,
          sharedTexts: normalizeSharedTexts(d['sharedTexts']),
        },
      ];
    }
    throw new Error('Formato JSON no reconocido.');
  };

  const handleImportSubmit = async () => {
    if (!parsedData) return;

    setIsSubmitting(true);
    setParseError(null);
    setSuccessMessage(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('Debes iniciar sesión como administrador para importar.');
      }

      const examsToImport = collectExamsToImport(parsedData);
      let totalQuestions = 0;
      let pendingReview = 0;

      for (const examData of examsToImport) {
        const periodo = toPeriodo(examData.year, examData.semester);
        const tipo = examData.year == null ? 'simulacro' : 'examen_real';
        // `shared_texts` es columna nueva (ver supabase/migration_v3.sql).
        // Si aún no existe en el proyecto, se reintenta sin ella.
        let examId: string | null = null;
        const baseExamPayload: Record<string, unknown> = { nombre: examData.title, periodo, tipo };
        try {
          const { data: examRow, error: examError } = await supabase
            .from('exams')
            .insert({ ...baseExamPayload, shared_texts: examData.sharedTexts })
            .select('id')
            .single();
          if (examError) throw examError;
          examId = (examRow as Record<string, unknown>)['id'] as string;
        } catch (errWithShared) {
          const msg = errWithShared instanceof Error ? errWithShared.message : String(errWithShared);
          if (!/shared_texts|column|columna/i.test(msg)) throw errWithShared;
          const { data: examRow, error: examError } = await supabase
            .from('exams')
            .insert(baseExamPayload)
            .select('id')
            .single();
          if (examError || !examRow) throw new Error(examError ? formatDbError(examError) : 'No se pudo crear el examen.');
          examId = (examRow as Record<string, unknown>)['id'] as string;
        }
        if (!examId) throw new Error('No se pudo crear el examen.');

        const rows = examData.questions.map((rawQ, idx) => {
          const q = cleanQuestionTexts(rawQ);
          const number = q['number'] !== undefined ? Number(q['number']) : idx + 1;
          const sectionId = String(q['sectionId'] ?? q['section'] ?? q['area'] ?? 'razonamiento-logico');
          const opciones = normalizeOptionsForSupabase(q);
          const rawAnswer = String(q['correctAnswer'] ?? q['respuesta_correcta'] ?? '').trim().toUpperCase();
          const respuesta_correcta = ['A', 'B', 'C', 'D', 'E'].includes(rawAnswer) ? rawAnswer : null;
          const confidence = normalizeConfidence(q['confidence']);
          const needsReviewByConfidence = confidence === 'low';
          // confidence=low → pendiente de revisión (tiene_respuesta_oficial=false
          // hasta que el admin la apruebe), aunque traiga respuesta.
          const tiene_respuesta_oficial = respuesta_correcta !== null && !needsReviewByConfidence;
          if (needsReviewByConfidence) pendingReview++;
          return {
            exam_id: examId as string,
            numero_original: Number.isFinite(number) ? number : idx + 1,
            area: areaToSupabase(sectionId),
            tema: cleanImportText(q['topic'] ?? q['tema'] ?? '') || null,
            category: typeof q['category'] === 'string' && String(q['category']).trim() ? String(q['category']).trim() : null,
            confidence: confidence,
            difficulty: normalizeDifficulty(q['difficulty']),
            enunciado_md: cleanImportText(q['statement'] ?? q['enunciado'] ?? q['enunciado_md'] ?? ''),
            imagenes: extractImages(q),
            opciones,
            respuesta_correcta,
            tiene_respuesta_oficial,
            explicacion_md: cleanImportText(q['explanation'] ?? q['explicacion'] ?? '') || null,
          };
        });

        // Insertar por lotes para evitar payloads gigantes.
        // Las columnas nuevas (category/confidence/difficulty) pueden no existir
        // aún: ante ese error se reintenta con el esquema anterior.
        const BATCH = 100;
        const stripNewColumns = (r: Record<string, unknown>) => {
          const { category: _c, confidence: _cf, difficulty: _d, ...rest } = r;
          return rest;
        };
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH);
          const { error } = await supabase.from('questions').insert(chunk);
          if (error) {
            if (/category|confidence|difficulty|column|columna/i.test(error.message)) {
              const { error: legacyError } = await supabase.from('questions').insert(chunk.map(stripNewColumns));
              if (legacyError) throw new Error(formatDbError(legacyError));
            } else {
              throw new Error(formatDbError(error));
            }
          }
        }
        totalQuestions += rows.length;
      }

      await fetchExams();
      setSuccessMessage(
        `¡Éxito! Se importaron ${totalQuestions} preguntas correctamente a Supabase.` +
          (pendingReview > 0 ? ` ${pendingReview} quedaron pendientes de revisión (confidence=low).` : '')
      );
      setParsedData(null);
      setJsonText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onImportSuccess) onImportSuccess();
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : 'Error durante la importación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([JSON.stringify(SAMPLE_JSON_TEMPLATE, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_examen_udea.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(JSON.stringify(SAMPLE_JSON_TEMPLATE, null, 2));
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  };

  const stats = parsedData ? analyzeJSON(parsedData) : null;

  return (
    <div className="space-y-4">
      <div className="flex bg-gray-100 dark:bg-gray-700/50 p-1 rounded-xl text-xs font-semibold">
        <button
          onClick={() => setSubMode('file')}
          className={cn(
            'flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5',
            subMode === 'file'
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs font-bold'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
          )}
        >
          <Upload className="w-3.5 h-3.5" /> Subir archivo .json
        </button>
        <button
          onClick={() => setSubMode('paste')}
          className={cn(
            'flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5',
            subMode === 'paste'
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs font-bold'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
          )}
        >
          <FileCode className="w-3.5 h-3.5" /> Pegar texto JSON
        </button>
      </div>

      {subMode === 'file' && (
        <div className="text-center p-5 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50/50 dark:bg-gray-900/30">
          <input type="file" ref={fileInputRef} accept=".json,application/json" className="hidden" onChange={handleFileSelected} />
          <FileJson className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">Selecciona tu archivo JSON con las preguntas (las imágenes van como URL o data-uri en <code>assets</code>).</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
          >
            Seleccionar archivo .json
          </button>
        </div>
      )}

      {subMode === 'paste' && (
        <div>
          <textarea
            rows={5}
            value={jsonText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder='Pega aquí el contenido JSON del examen (o un arreglo [ { "number": 1, ... } ])...'
            className="w-full text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      <div className="flex items-center justify-between text-xs pt-1">
        <button onClick={handleDownloadTemplate} className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 hover:underline font-semibold">
          <Download className="w-3.5 h-3.5" /> Descargar plantilla .json
        </button>
        <button onClick={handleCopyTemplate} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          {copiedTemplate ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copiedTemplate ? '¡Copiado!' : 'Copiar plantilla'}
        </button>
      </div>

      {stats && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-3 rounded-xl text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-emerald-900 dark:text-emerald-200">{stats.title}</span>
            <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300 rounded font-bold">
              {stats.totalQuestions} preguntas
            </span>
          </div>
          <div className="grid gap-2 text-emerald-800 dark:text-emerald-300 font-medium grid-cols-3">
            <div className="bg-white/60 dark:bg-black/20 p-1.5 rounded text-center">
              <span className="block text-[10px] text-gray-500">R. Lógico</span>
              <span className="font-bold text-sm">{stats.rlCount}</span>
            </div>
            <div className="bg-white/60 dark:bg-black/20 p-1.5 rounded text-center">
              <span className="block text-[10px] text-gray-500">C. Lectora</span>
              <span className="font-bold text-sm">{stats.clCount}</span>
            </div>
            <div className="bg-white/60 dark:bg-black/20 p-1.5 rounded text-center">
              <span className="block text-[10px] text-gray-500">Imágenes</span>
              <span className="font-bold text-sm">{stats.base64ImagesCount}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200">
              {stats.sharedTextsCount} texto(s) compartido(s)
            </span>
            {stats.lowConfidenceCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                {stats.lowConfidenceCount} con confidence=low → revisión
              </span>
            )}
          </div>

          <button
            onClick={handleImportSubmit}
            disabled={isSubmitting}
            className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Guardando en Supabase...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" /> Importar al Simulador
              </>
            )}
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 text-xs rounded-xl flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {parseError && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs rounded-xl flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <span className="break-all">{parseError}</span>
        </div>
      )}

      <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={() => setShowDocs(!showDocs)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-1 font-medium"
        >
          <Info className="w-3.5 h-3.5" /> {showDocs ? 'Ocultar estructura JSON' : 'Ver estructura requerida del JSON'}
        </button>

        {showDocs && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-[11px] text-gray-600 dark:text-gray-400 space-y-2 border border-gray-200 dark:border-gray-800">
            <p className="font-bold text-gray-800 dark:text-gray-200">Estructura JSON v3:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-gray-700 dark:text-gray-300">title / year / semester:</strong> <code>year</code> y <code>semester</code> pueden ser <code>null</code> (simulacros de institutos; se muestra el título tal cual).</li>
              <li><strong className="text-gray-700 dark:text-gray-300">sharedTexts:</strong> <code>[&#123; "id", "title", "text", "appliesToQuestions": [16, 17] &#125;]</code>. Se guardan en el examen y se muestran en lectura.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">statement:</strong> Enunciado (soporta LaTeX como $x^2$).</li>
              <li><strong className="text-gray-700 dark:text-gray-300">options:</strong> 4 opciones <code>[&#123; "id": "A", "text": "..." &#125;, ...]</code>. Si son dibujos, usar <code>"Opción A (ver figura)"</code> (nunca vacío).</li>
              <li><strong className="text-gray-700 dark:text-gray-300">correctAnswer:</strong> <code>"A"</code>, <code>"B"</code>, <code>"C"</code> o <code>"D"</code>.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">sectionId:</strong> <code>"razonamiento-logico"</code> o <code>"competencia-lectora"</code>.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">category:</strong> RL: Proporcionalidad y cálculo, Álgebra y patrones, Geométrico y espacial, Análisis de información, Lógica y deducción. CL: Literal, Inferencial, Analógica.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">confidence:</strong> <code>"high" | "medium" | "low"</code> (interno). <code>low</code> importa la pregunta como pendiente de revisión.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">difficulty:</strong> <code>"easy" | "medium" | "hard"</code>.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">assets:</strong> <code>&#123; "type": "image", "target": "statement" | "table" | "options" | "shared", "description", "croppedImage": "data:..." &#125;</code>. Ordenados: compartido → enunciado → tabla → opciones.</li>
            </ul>
            <p className="pt-1">Al importar se limpian <code>[cite: N]</code> y barras LaTeX dobles, y se rechazan JSON cortados. Columnas nuevas requeridas en Supabase: ver <code>supabase/migration_v3.sql</code>.</p>
          </div>
        )}
      </div>
    </div>
  );
}
