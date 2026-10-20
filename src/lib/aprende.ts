/**
 * Tipos y helpers para la sección "Aprende".
 * Los datos vienen de JSON generados por convertir.py y se almacenan en Supabase.
 * No se recalculan ni se "arreglan" claves: se consumen tal cual llegan.
 */

export interface AprendeBloqueTexto {
  bloque: 'texto';
  titulo?: string;
  contenido: Array<
    | { t: 'p'; texto: string }
    | { t: 'lista'; items: string[] }
  >;
}

export interface AprendeBloqueDefinicion {
  bloque: 'definicion';
  termino: string;
  contenido: string;
}

export interface AprendeBloqueNotacion {
  bloque: 'notacion';
  simbolo: string;
  se_lee: string;
  ejemplo: string;
}

export interface AprendeBloqueRepaso {
  bloque: 'repaso';
  titulo: string;
  contenido: string;
  contenido_bloques?: AprendeBloqueTexto['contenido'];
}

export interface AprendeOpcion {
  letra: string;
  texto: string;
}

export interface AprendeBloquePrueba {
  bloque: 'prueba';
  pregunta: string;
  opciones: AprendeOpcion[];
  correcta: string;
  explicacion: string;
}

export interface AprendeBloqueAutoevaluacion {
  bloque: 'autoevaluacion';
  pregunta: string;
  opciones?: AprendeOpcion[];
  correcta?: string;
  valor?: number | string;
  aceptadas?: (number | string)[];
  explicacion: string;
  errores?: Record<string, string>;
  tip?: string;
  comprobacion?: string;
}

export interface AprendePaso {
  texto: string;
}

export interface AprendeBloqueEjemplo {
  bloque: 'ejemplo';
  titulo: string;
  enunciado: string;
  letras?: string;
  paso: AprendePaso[];
  comprobacion?: string;
  resultado?: string;
}

export interface AprendeBloqueSVG {
  bloque: 'svg';
  svg: string;
  descripcion?: string;
  revision?: boolean;
}

export interface AprendeBloqueErrorComun {
  bloque: 'error_comun';
  texto: string;
}

export interface AprendeBloqueTip {
  bloque: 'tip';
  titulo?: string;
  contenido: string;
}

export interface AprendeBloqueAntesDeEmpezar {
  bloque: 'antes_de_empezar';
  // texto plano del prerrequisito
  texto?: string;
  contenido?: string;
}

export interface AprendeBloqueFuentes {
  bloque: 'fuentes';
  items: string[];
}

export type AprendeBloque =
  | AprendeBloqueTexto
  | AprendeBloqueDefinicion
  | AprendeBloqueNotacion
  | AprendeBloqueRepaso
  | AprendeBloquePrueba
  | AprendeBloqueAutoevaluacion
  | AprendeBloqueEjemplo
  | AprendeBloqueSVG
  | AprendeBloqueErrorComun
  | AprendeBloqueTip
  | AprendeBloqueAntesDeEmpezar
  | AprendeBloqueFuentes;

export interface AprendeLeccionJSON {
  tipo: 'leccion';
  id: string;
  modulo: string;
  titulo: string;
  alcance: string;
  requisitos: string[];
  bloques: AprendeBloque[];
}

export interface AprendeEjercicioJSON {
  tipo: 'ejercicio';
  id: string;
  tema: string;
  nivel: number;
  enunciado: string;
  descripcion?: string;
  svg?: string;
  opciones: AprendeOpcion[];
  correcta: string;
  pista?: string;
  explicacion: AprendePaso[];
  errores?: Record<string, string>;
  tip?: string;
  comprobacion?: string;
  verificado?: boolean;
}

export interface AprendeJSON {
  lecciones: AprendeLeccionJSON[];
  ejercicios: AprendeEjercicioJSON[];
}

/** Tipo de progreso guardado en Supabase (aprende_progreso) */
export type AprendeEstado = 'correcto' | 'incorrecto' | 'omitido';

/** Resultado de una respuesta de ejercicio */
export interface AprendeResultado {
  correcto: boolean;
  explicacion?: string;
  errorOpcion?: string;
  tip?: string;
}

/** Normaliza la respuesta numérica de autoevaluación */
export function normalizarRespuestaNumerica(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}
