import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { FileJson, Upload, Download, CheckCircle2, AlertTriangle, FileCode, Copy, Check, Info } from 'lucide-react';
import { cn } from './Layout';
import { supabase } from '../lib/supabase';
import { areaToSupabase } from '../lib/examAdapter';

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
      topic: 'Proporcionalidad y Regla de Tres',
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
      topic: 'Geometría Plana',
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
      explanation: 'Una paradoja plantea una contradicción aparente que encierra una verdad válida en su contexto.',
      topic: 'Vocabulario en Contexto',
      difficulty: 'easy',
      assets: [],
    },
  ],
};

function extractImages(q: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v) out.push(v);
  };
  const assets = q['assets'];
  if (Array.isArray(assets)) {
    for (const a of assets) {
      if (typeof a === 'string') push(a);
      else if (a && typeof a === 'object') {
        const o = a as Record<string, unknown>;
        push(o['imagePath'] ?? o['croppedImage'] ?? o['base64'] ?? o['image'] ?? o['url'] ?? o['content']);
      }
    }
  }
  const recortes = q['imagenes_recorte'];
  if (Array.isArray(recortes)) {
    for (const img of recortes) {
      if (typeof img === 'string') push(img);
      else if (img && typeof img === 'object') {
        const o = img as Record<string, unknown>;
        push(o['croppedImage'] ?? o['base64']);
      }
    }
  }
  if (typeof q['imagen_recorte'] === 'string') push(q['imagen_recorte']);
  const imagenes = q['imagenes'];
  if (Array.isArray(imagenes)) imagenes.forEach(push);
  return out.filter(Boolean).slice(0, 10);
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

      questionsList.forEach((q) => {
        const sec = String(q['sectionId'] ?? q['area'] ?? q['section'] ?? '').toLowerCase();
        if (sec.includes('lector') || sec.includes('competencia') || sec.includes('español')) clCount++;
        else rlCount++;
        imagesCount += extractImages(q).length;
      });

      return { title: examTitle, totalQuestions: questionsList.length, rlCount, clCount, base64ImagesCount: imagesCount, sharedTextsCount: 0 };
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
        const parsed = JSON.parse(text);
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
      const parsed = JSON.parse(text);
      analyzeJSON(parsed);
      setParsedData(parsed);
    } catch (err: unknown) {
      setParsedData(null);
      setParseError(err instanceof Error ? err.message : 'JSON inválido');
    }
  };

  const collectExamsToImport = (data: unknown): Array<{ title: string; year: number; semester: number; questions: Array<Record<string, unknown>> }> => {
    const d = data as Record<string, unknown>;
    if (Array.isArray(data)) {
      return [{ title: `Examen Importado ${new Date().toLocaleDateString('es-CO')}`, year: new Date().getFullYear(), semester: 1, questions: data as Array<Record<string, unknown>> }];
    }
    if (d && Array.isArray(d['exams'])) {
      return (d['exams'] as Array<Record<string, unknown>>).map((e) => ({
        title: String(e['title'] ?? e['nombre'] ?? `Examen ${new Date().getFullYear()}`),
        year: Number(e['year'] ?? new Date().getFullYear()) || new Date().getFullYear(),
        semester: e['semester'] === 2 ? 2 : 1,
        questions: (Array.isArray(e['questions']) ? e['questions'] : []) as Array<Record<string, unknown>>,
      }));
    }
    if (d && Array.isArray(d['questions'])) {
      return [
        {
          title: String(d['title'] ?? `Examen UdeA ${d['year'] ?? new Date().getFullYear()}`),
          year: Number(d['year'] ?? new Date().getFullYear()) || new Date().getFullYear(),
          semester: d['semester'] === 2 ? 2 : 1,
          questions: d['questions'] as Array<Record<string, unknown>>,
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

      for (const examData of examsToImport) {
        const periodo = `${examData.year}-${examData.semester}`;
        const { data: examRow, error: examError } = await supabase
          .from('exams')
          .insert({ nombre: examData.title, periodo, tipo: 'examen_real' })
          .select('id')
          .single();
        if (examError || !examRow) throw new Error(examError?.message ?? 'No se pudo crear el examen.');
        const examId = (examRow as Record<string, unknown>)['id'] as string;

        const rows = examData.questions.map((q, idx) => {
          const number = q['number'] !== undefined ? Number(q['number']) : idx + 1;
          const sectionId = String(q['sectionId'] ?? q['section'] ?? q['area'] ?? 'razonamiento-logico');
          const opciones = normalizeOptionsForSupabase(q);
          const rawAnswer = String(q['correctAnswer'] ?? q['respuesta_correcta'] ?? '').trim().toUpperCase();
          const respuesta_correcta = ['A', 'B', 'C', 'D', 'E'].includes(rawAnswer) ? rawAnswer : null;
          return {
            exam_id: examId,
            numero_original: Number.isFinite(number) ? number : idx + 1,
            area: areaToSupabase(sectionId),
            tema: String(q['topic'] ?? q['tema'] ?? ''),
            enunciado_md: String(q['statement'] ?? q['enunciado'] ?? q['enunciado_md'] ?? ''),
            imagenes: extractImages(q),
            opciones,
            respuesta_correcta,
            tiene_respuesta_oficial: respuesta_correcta !== null,
            explicacion_md: String(q['explanation'] ?? q['explicacion'] ?? ''),
          };
        });

        // Insertar por lotes para evitar payloads gigantes
        const BATCH = 100;
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH);
          const { error } = await supabase.from('questions').insert(chunk);
          if (error) throw new Error(error.message);
        }
        totalQuestions += rows.length;
      }

      await fetchExams();
      setSuccessMessage(`¡Éxito! Se importaron ${totalQuestions} preguntas correctamente a Supabase.`);
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
            <p className="font-bold text-gray-800 dark:text-gray-200">Estructura requerida:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-gray-700 dark:text-gray-300">statement:</strong> Enunciado (soporta LaTeX como $x^2$).</li>
              <li><strong className="text-gray-700 dark:text-gray-300">options:</strong> 4 opciones <code>[&#123; "id": "A", "text": "..." &#125;, ...]</code>.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">correctAnswer:</strong> <code>"A"</code>, <code>"B"</code>, <code>"C"</code> o <code>"D"</code>.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">sectionId:</strong> <code>"razonamiento-logico"</code> o <code>"competencia-lectora"</code>.</li>
              <li><strong className="text-gray-700 dark:text-gray-300">assets/imagenes:</strong> URLs o data-uri; se guardan en <code>questions.imagenes</code> (jsonb) en Supabase.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
