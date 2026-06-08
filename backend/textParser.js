/**
 * textParser.js — v2
 * Extrae y estructura texto desde TXT, CSV, MD, PDF y DOCX.
 * Mejoras v2:
 *   - PDF: limpia índices, encabezados repetidos y números de página
 *   - DOCX: mejor manejo de párrafos vacíos y estilos
 *   - Cross-refs internas: detecta [ver §23] y similares para navegación
 */

const path = require('path');

// ─── LIMPIEZA DE TEXTO PDF ────────────────────────────────────────────────────

/**
 * El texto extraído de PDF suele tener:
 *   - Números de página sueltos ("3", "47")
 *   - Encabezados repetidos en cada página ("CATECISMO DE LA IGLESIA CATÓLICA")
 *   - Líneas del índice: "Capítulo 3 .............. 45"
 *   - Líneas cortadas en mitad de oración por salto de página
 * Esta función limpia todo eso.
 */
function cleanPdfText(raw) {
  const lines = raw.split('\n');
  const cleaned = [];
  const seenHeaders = new Map(); // título -> cantidad de veces visto

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Saltar líneas vacías (las preservamos como separadores luego)
    if (!trimmed) { cleaned.push(''); continue; }

    // Saltar números de página solos (1-4 dígitos solos en la línea)
    if (/^\d{1,4}$/.test(trimmed)) continue;

    // Saltar líneas de índice: "Algo ........... 23" o "Algo __ 23"
    if (/[.…_]{4,}\s*\d+\s*$/.test(trimmed)) continue;
    if (/^.{1,60}\s{2,}\d{1,4}\s*$/.test(trimmed) && trimmed.length < 70) continue;

    // Detectar encabezados repetidos (aparecen >3 veces = cabecera de página)
    const upper = trimmed.toUpperCase();
    if (upper.length > 5 && upper === trimmed) {
      seenHeaders.set(upper, (seenHeaders.get(upper) || 0) + 1);
      if (seenHeaders.get(upper) > 2) continue; // saltar repetición
    }

    // Saltar líneas muy cortas que son claramente artefactos (< 4 chars, no número de versículo)
    if (trimmed.length < 4 && !/^\d+[.)]\s*$/.test(trimmed)) continue;

    cleaned.push(line);
  }

  // Unir líneas que parecen cortadas (línea sin punto final seguida de línea en minúscula)
  const joined = [];
  for (let i = 0; i < cleaned.length; i++) {
    const cur = cleaned[i].trim();
    const next = (cleaned[i + 1] || '').trim();
    if (
      cur &&
      next &&
      !cur.endsWith('.') && !cur.endsWith(':') && !cur.endsWith('?') && !cur.endsWith('!') &&
      next.length > 0 && next[0] === next[0].toLowerCase() && !/^\d/.test(next)
    ) {
      joined.push(cur + ' ' + next);
      i++; // saltar la siguiente línea ya unida
    } else {
      joined.push(cur);
    }
  }

  return joined.join('\n');
}

// ─── DETECCIÓN DE CAPÍTULOS ───────────────────────────────────────────────────

function detectChapters(text) {
  // Patrones de encabezado de capítulo
  const headingRe = /^(?:CAP[IÍ]TULO|Capítulo|LIBRO|Libro|PARTE|Parte|SALMO|Salmo|Psalm|PSALM|Chapter|CHAPTER|SECCIÓN|Sección|ARTÍCULO|Artículo)\s+[\dIVXLCivxlc]+[.:)–\-]?\s*.*/;
  // Líneas completamente en mayúsculas de 8-80 chars (títulos de sección)
  const allCapsRe = /^[A-ZÁÉÍÓÚÑÜ\s\d]{8,80}$/;
  // Numeración romana sola en línea: "I.", "II.", "III."
  const romanRe = /^[IVXLC]{1,6}[.)]\s*$/;

  const lines = text.split('\n');
  const chapters = [];
  let current = { title: 'Inicio', lines: [] };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { current.lines.push(''); continue; }

    const isHeading = headingRe.test(trimmed) || romanRe.test(trimmed) ||
      (allCapsRe.test(trimmed) && trimmed.length >= 8 && trimmed.length <= 80);

    if (isHeading) {
      if (current.lines.some(l => l.trim())) chapters.push(current);
      current = { title: trimmed, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some(l => l.trim())) chapters.push(current);

  // Sin capítulos detectados → dividir en bloques de ~300 líneas
  if (chapters.length <= 1) {
    const allLines = text.split('\n');
    const size = 300;
    const result = [];
    for (let i = 0; i < allLines.length; i += size) {
      result.push({
        title: `Sección ${Math.floor(i / size) + 1}`,
        lines: allLines.slice(i, i + size),
      });
    }
    return result.length ? result : [{ title: 'Contenido', lines: allLines }];
  }

  return chapters;
}

// ─── CONVERSIÓN DE LÍNEAS A VERSÍCULOS/PÁRRAFOS ───────────────────────────────

function linesToVerses(lines) {
  // Detecta: "1 Texto", "1. Texto", "1) Texto", "§1 Texto"
  const verseRe = /^§?(\d{1,4})[.)\s\-–]\s+(.+)/;
  const verses = [];
  let paraBuffer = [];
  let autoNum = 1;

  function flushBuffer() {
    if (!paraBuffer.length) return;
    const text = paraBuffer.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 3) verses.push({ v: autoNum++, text });
    paraBuffer = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushBuffer(); continue; }

    const m = trimmed.match(verseRe);
    if (m) {
      flushBuffer();
      verses.push({ v: parseInt(m[1]), text: m[2].trim() });
    } else {
      paraBuffer.push(trimmed);
      // Cortar párrafos largos cada ~500 chars
      if (paraBuffer.join(' ').length > 500) flushBuffer();
    }
  }
  flushBuffer();
  return verses;
}

// ─── DETECCIÓN DE REFERENCIAS CRUZADAS INTERNAS ───────────────────────────────

/**
 * Detecta en el texto referencias del tipo:
 *   "véase §23", "ver párrafo 45", "cfr. n. 12", "(→ 34)", "→§45"
 * Las convierte en marcas [§23] para que el frontend las renderice como links.
 */
function markInternalRefs(text) {
  return text
    .replace(/\(→\s*§?(\d+)\)/g, '[§$1]')
    .replace(/→\s*§?(\d+)/g, '[§$1]')
    .replace(/(?:véase|ver|cfr\.?|cf\.?)\s+(?:§|n\.|párr?\.?\s*)(\d+)/gi, '[§$1]')
    .replace(/\(n\.\s*(\d+)\)/g, '[§$1]');
}

// ─── PARSERS POR FORMATO ──────────────────────────────────────────────────────

async function parseTxt(buffer) {
  const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return structureText(text);
}

async function parseCsv(buffer) {
  const text = buffer.toString('utf-8');
  const lines = text.split('\n').filter(l => l.trim());
  const verses = [];
  let autoNum = 1;
  for (const line of lines) {
    // Separador: coma o punto y coma; respeta comillas
    const cols = line.match(/(".*?"|[^,;]+)/g) || [];
    const clean = cols.map(c => c.replace(/^"|"$/g, '').trim());
    const maybeNum = parseInt(clean[0]);
    if (!isNaN(maybeNum) && clean.length >= 2) {
      verses.push({ v: maybeNum, text: clean[1], footnote: clean[2] || undefined });
    } else {
      verses.push({ v: autoNum++, text: line.replace(/^"|"$/g, '').trim() });
    }
  }
  return { chapters: [{ title: 'Contenido', verses }], chapterTitles: ['Contenido'], hasFootnotes: verses.some(v => v.footnote) };
}

async function parsePdf(buffer) {
  let pdfParse;
  try { pdfParse = require('pdf-parse'); }
  catch { throw new Error('La librería pdf-parse no está instalada en el servidor. Contacte al administrador.'); }
  try {
    const data = await pdfParse(buffer);
    const cleaned = cleanPdfText(data.text);
    return structureText(cleaned);
  } catch (err) {
    if (err.message.includes('librería')) throw err;
    console.error('PDF parse error:', err.message);
    throw new Error('No se pudo leer el PDF. Verifique que no esté protegido con contraseña y que contenga texto (no solo imágenes escaneadas).');
  }
}

async function parseDocx(buffer) {
  let mammoth;
  try { mammoth = require('mammoth'); }
  catch { throw new Error('La librería mammoth no está instalada en el servidor. Contacte al administrador.'); }
  try {
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value || result.value.trim().length < 10)
      throw new Error('El archivo DOCX parece estar vacío o solo contiene imágenes.');
    return structureText(result.value);
  } catch (err) {
    if (err.message.includes('librería') || err.message.includes('vacío')) throw err;
    console.error('DOCX parse error:', err.message);
    throw new Error('No se pudo leer el archivo DOCX. Asegúrese de que sea un archivo Word válido (.docx) y no esté dañado.');
  }
}

async function parseMd(buffer) {
  let text = buffer.toString('utf-8');
  text = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return structureText(text);
}

// ─── ESTRUCTURADOR CENTRAL ────────────────────────────────────────────────────

function structureText(rawText) {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawChapters = detectChapters(text);
  const hasFootnotes = /\*[^*]/.test(text) || /^\s*[\(\[]\w[\)\]]/m.test(text);

  const chapters = rawChapters.map(ch => ({
    title: ch.title,
    verses: linesToVerses(ch.lines).map(v => ({
      ...v,
      text: markInternalRefs(v.text),
    })),
  })).filter(ch => ch.verses.length > 0);

  if (!chapters.length) {
    chapters.push({ title: 'Contenido', verses: [{ v: 1, text: rawText.slice(0, 3000) }] });
  }

  return {
    chapters,
    chapterTitles: chapters.map(c => c.title),
    hasFootnotes,
  };
}

// ─── ENTRADA PRINCIPAL ────────────────────────────────────────────────────────

async function parseFile(buffer, filename) {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  switch (ext) {
    case 'txt':  return parseTxt(buffer);
    case 'md':   return parseMd(buffer);
    case 'csv':  return parseCsv(buffer);
    case 'pdf':  return parsePdf(buffer);
    case 'docx': return parseDocx(buffer);
    default:     throw new Error(`Formato .${ext} no soportado. Use TXT, CSV, MD, PDF o DOCX.`);
  }
}

module.exports = { parseFile, structureText, detectChapters, linesToVerses, cleanPdfText };
