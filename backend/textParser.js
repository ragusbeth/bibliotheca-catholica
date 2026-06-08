/**
 * textParser.js
 * Extrae texto plano y estructura (capítulos, párrafos numerados)
 * desde TXT, CSV, MD, PDF y DOCX.
 */

const path = require('path');

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

/**
 * Divide un texto largo en capítulos detectando encabezados comunes:
 *   "Capítulo 1", "CAPÍTULO I", "Libro I", "Parte I", líneas en mayúsculas, etc.
 * Devuelve [{ title, content }]
 */
function detectChapters(text) {
  const headingRe = /^(?:CAP[IÍ]TULO|Capítulo|LIBRO|Libro|PARTE|Parte|SALMO|Salmo|Psalm|PSALM|Chapter|CHAPTER)\s+[\dIVXLCivxlc]+[.:)–-]?\s*.*/;
  const allCapsRe = /^[A-ZÁÉÍÓÚÑÜ\s]{8,60}$/;

  const lines = text.split('\n');
  const chapters = [];
  let current = { title: 'Inicio', lines: [] };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { current.lines.push(''); continue; }

    if (headingRe.test(trimmed) || allCapsRe.test(trimmed)) {
      if (current.lines.some(l => l.trim())) chapters.push(current);
      current = { title: trimmed, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some(l => l.trim())) chapters.push(current);

  // Si no se detectó ningún capítulo, agrupar en bloques de ~300 líneas
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
    return result;
  }

  return chapters;
}

/**
 * Convierte líneas de un capítulo en párrafos/versículos numerados.
 * Detecta:
 *   - Versículos bíblicos:  "1 En el principio..."  o  "1. En el principio..."
 *   - Párrafos numerados del CIC: "1. La Iglesia..."  "26. La fe cristiana..."
 *   - Texto continuo: lo agrupa en bloques y los numera
 */
function linesToVerses(lines) {
  const verseRe = /^(\d{1,4})[.\s)\-–]\s+(.+)/;
  const verses = [];
  let paraBuffer = [];
  let autoNum = 1;

  function flushBuffer() {
    if (!paraBuffer.length) return;
    const text = paraBuffer.join(' ').trim();
    if (text) verses.push({ v: autoNum++, text });
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
      // Si la línea anterior era numerada, cada párrafo distinto = nueva entrada
      if (verses.length && paraBuffer.length === 0) {
        paraBuffer.push(trimmed);
      } else {
        paraBuffer.push(trimmed);
        // Párrafo largo: cortar en oración si supera 400 chars
        if (paraBuffer.join(' ').length > 400) flushBuffer();
      }
    }
  }
  flushBuffer();
  return verses;
}

/**
 * Detecta notas al pie del estilo:
 *   * Nota...   /   (a) Nota...   /   [1] Nota...
 * Las separa del texto principal.
 */
function extractFootnotes(text) {
  const footRe = /^[\*\(a-z\)\[\d\]]{1,4}\s+.{10,}/gm;
  const footnotes = [];
  const matches = text.match(footRe) || [];
  for (const m of matches) footnotes.push(m.trim());
  return footnotes;
}

// ─── PARSERS POR FORMATO ──────────────────────────────────────────────────────

async function parseTxt(buffer, encoding = 'utf-8') {
  let text = buffer.toString(encoding);
  // Normalizar saltos de línea
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return structureText(text);
}

async function parseCsv(buffer) {
  const text = buffer.toString('utf-8');
  // CSV simple: cada fila es un versículo; columnas: número, texto [, nota]
  const lines = text.split('\n').filter(l => l.trim());
  const verses = [];
  let autoNum = 1;
  for (const line of lines) {
    const cols = line.split(/[,;]\s*/);
    const maybeNum = parseInt(cols[0]);
    if (!isNaN(maybeNum) && cols.length >= 2) {
      verses.push({ v: maybeNum, text: cols[1]?.replace(/^"|"$/g, '').trim(), footnote: cols[2]?.replace(/^"|"$/g, '').trim() || undefined });
    } else {
      verses.push({ v: autoNum++, text: line.replace(/^"|"$/g, '').trim() });
    }
  }
  const chapters = [{ title: 'Contenido', verses }];
  return { chapters, chapterTitles: ['Contenido'], hasFootnotes: verses.some(v => v.footnote) };
}

async function parsePdf(buffer) {
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return structureText(data.text);
  } catch (err) {
    console.error('PDF parse error:', err.message);
    throw new Error('No se pudo leer el PDF. Asegúrese de que no esté protegido con contraseña y vuelva a intentarlo.');
  }
}

async function parseDocx(buffer) {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return structureText(result.value);
  } catch (err) {
    console.error('DOCX parse error:', err.message);
    throw new Error('No se pudo leer el archivo DOCX. Asegúrese de que sea un archivo Word válido (.docx).');
  }
}

async function parseMd(buffer) {
  // Quitar sintaxis Markdown básica y tratar como texto
  let text = buffer.toString('utf-8');
  text = text
    .replace(/^#{1,6}\s+/gm, '')   // encabezados
    .replace(/\*\*(.*?)\*\*/g, '$1') // negrita
    .replace(/\*(.*?)\*/g, '$1')     // cursiva
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // links
  return structureText(text);
}

// ─── ESTRUCTURADOR CENTRAL ────────────────────────────────────────────────────

function structureText(rawText) {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawChapters = detectChapters(text);
  const hasFootnotes = text.includes('*') || /^\s*[\(\[]\w[\)\]]/m.test(text);

  const chapters = rawChapters.map(ch => ({
    title: ch.title,
    verses: linesToVerses(ch.lines),
  })).filter(ch => ch.verses.length > 0);

  // Garantizar al menos un capítulo
  if (!chapters.length) {
    chapters.push({ title: 'Contenido', verses: [{ v: 1, text: rawText.slice(0, 2000) }] });
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
    default:     throw new Error(`Formato .${ext} no soportado`);
  }
}

module.exports = { parseFile, structureText, detectChapters, linesToVerses };
