/**
 * Diagramas SVG dentro de explicaciones (y cualquier texto Markdown).
 *
 * La IA devuelve el dibujo como código (` ```svg ... ``` ` o `<svg>` pegado
 * directo). Aquí se detecta, se limpia y se convierte a imagen data-uri para
 * que Markdown la pinte como figura. Sin base64 de PNGs ni migraciones.
 */

const FENCE_RE = /```svg\s*\n([\s\S]*?)\n?```/gi;
const RAW_SVG_RE = /<svg(?:\s[^>]*)?>[\s\S]*?<\/svg\s*>/gi;
const CODE_FENCE_RE = /```[\s\S]*?(?:```|$)/g;

/** Quita scripts, manejadores de eventos y javascript: (el dibujo queda intacto). */
export function sanitizeSvg(svg: string): string {
  return (
    svg
      .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|xlink:href)\s*=\s*("|')\s*javascript:[\s\S]*?\2/gi, '$1=$2#$2')
      // La IA a veces escribe el xmlns como enlace Markdown:
      // xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)".
      // Se deja la URL pelada o el navegador rechaza el dibujo.
      .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1')
      .trim()
  );
}

function svgToMarkdownImage(svg: string): string | null {
  let clean = sanitizeSvg(svg);
  if (!/<svg[\s>]/i.test(clean)) return null;
  // Sin xmlns el navegador no lo reconoce como SVG en <img>.
  if (!/xmlns\s*=/i.test(clean)) {
    clean = clean.replace(/<svg(\s|>)/i, '<svg xmlns="http://www.w3.org/2000/svg"$1');
  }
  // En <img> los paréntesis romperían el Markdown y # debe ir escapado.
  const encoded = encodeURIComponent(clean).replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `![diagrama](data:image/svg+xml,${encoded})`;
}

/**
 * Convierte bloques ```svg y <svg> sueltos a imágenes Markdown.
 * No toca otros bloques de código (ej. un ejemplo dentro de ```html).
 */
export function renderSvgDiagrams(text: string): string {
  if (!text || !/<svg[\s>]/i.test(text)) return text;

  // 1. Apartar TODOS los cercados de código para no tocar ejemplos.
  const fences: string[] = [];
  const shelved = text.replace(CODE_FENCE_RE, (m) => {
    fences.push(m);
    return `\u0000FENCE${fences.length - 1}\u0000`;
  });

  // 2. Convertir los cercados ```svg apartados.
  const converted = fences.map((fence) => {
    FENCE_RE.lastIndex = 0;
    const m = FENCE_RE.exec(fence);
    if (!m) return fence;
    return svgToMarkdownImage(m[1]) ?? fence;
  });

  // 3. Convertir <svg> sueltos fuera de cercados.
  RAW_SVG_RE.lastIndex = 0;
  const withRaw = shelved.replace(RAW_SVG_RE, (m) => svgToMarkdownImage(m) ?? m);

  // 4. Devolver los cercados (convertidos o intactos).
  return withRaw.replace(/\u0000FENCE(\d+)\u0000/g, (_, i) => converted[Number(i)] ?? '');
}
