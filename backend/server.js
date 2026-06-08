require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const { parseFile } = require('./textParser');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'bibliotheca_catholica_secret_2024';

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.csv', '.md', '.pdf', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));

// ─── INIT DATABASE ───────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'lector',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS books (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100),
      icon VARCHAR(10) DEFAULT '📄',
      chapters TEXT[],
      content TEXT,
      format VARCHAR(20) DEFAULT 'txt',
      has_footnotes BOOLEAN DEFAULT false,
      has_margin_refs BOOLEAN DEFAULT false,
      is_shared BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      book_id VARCHAR(100) NOT NULL,
      chapter VARCHAR(255),
      verse INTEGER,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, book_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      comment_key VARCHAR(255) NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, comment_key)
    );

    CREATE TABLE IF NOT EXISTS user_documents (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      book_name VARCHAR(255),
      chapter VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ Database initialized');
}

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email))
    return res.status(400).json({ error: 'Email inválido' });
  try {
    const exists = await pool.query(
      'SELECT id FROM users WHERE username=$1 OR email=$2', [username, email]
    );
    if (exists.rows.length > 0) {
      const conflict = exists.rows[0];
      return res.status(409).json({ error: 'El usuario o email ya existe' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, username, email, role',
      [username, email, hash, role || 'lector']
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Ingrese usuario y contraseña' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (!result.rows.length)
      return res.status(401).json({ error: 'Usuario no encontrado' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Contraseña incorrecta' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  const result = await pool.query('SELECT id, username, email, role FROM users WHERE id=$1', [req.user.id]);
  res.json(result.rows[0]);
});

// ─── BOOKS ROUTES ─────────────────────────────────────────────────────────────
app.get('/api/books', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM books WHERE user_id=$1 OR is_shared=true ORDER BY created_at ASC',
    [req.user.id]
  );
  res.json(result.rows);
});

app.post('/api/books', authMiddleware, async (req, res) => {
  const { name, category, icon, chapters, content, format, has_footnotes, has_margin_refs, is_shared } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });

  let finalContent = content || '';
  let finalChapters = chapters;
  let finalHasFootnotes = has_footnotes;

  // Si viene texto plano, estructurarlo
  if (content && (!chapters || chapters.length <= 1)) {
    try {
      const buf = Buffer.from(content, 'utf-8');
      const parsed = await parseFile(buf, 'texto.txt');
      finalContent = JSON.stringify(parsed.chapters);
      finalChapters = parsed.chapterTitles;
      finalHasFootnotes = parsed.hasFootnotes;
    } catch {}
  }

  const result = await pool.query(
    `INSERT INTO books (user_id, name, category, icon, chapters, content, format, has_footnotes, has_margin_refs, is_shared)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.user.id, name, category || 'Otro', icon || '📄',
     finalChapters || ['Capítulo 1'], finalContent, format || 'txt',
     finalHasFootnotes || false, has_margin_refs || false, is_shared || false]
  );
  res.json(result.rows[0]);
});

app.post('/api/books/upload', authMiddleware, upload.single('file'), async (req, res) => {
  const file = req.file;
  const { name, category } = req.body;
  if (!file) return res.status(400).json({ error: 'No se recibió archivo' });

  const format = path.extname(file.originalname).toLowerCase().replace('.', '');

  let parsed;
  try {
    parsed = await parseFile(file.buffer, file.originalname);
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }

  // Guardamos la estructura completa como JSON en el campo content
  const contentJson = JSON.stringify(parsed.chapters);
  const chapterTitles = parsed.chapterTitles;

  const result = await pool.query(
    `INSERT INTO books (user_id, name, category, icon, chapters, content, format, has_footnotes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      req.user.id,
      name || file.originalname.replace(/\.[^.]+$/, ''),
      category || 'Otro',
      '📄',
      chapterTitles,
      contentJson,
      format,
      parsed.hasFootnotes,
    ]
  );
  res.json(result.rows[0]);
});

app.delete('/api/books/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM books WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ─── PROGRESS ROUTES ──────────────────────────────────────────────────────────
app.get('/api/progress/:bookId', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM reading_progress WHERE user_id=$1 AND book_id=$2',
    [req.user.id, req.params.bookId]
  );
  res.json(result.rows[0] || null);
});

app.post('/api/progress', authMiddleware, async (req, res) => {
  const { book_id, chapter, verse } = req.body;
  await pool.query(
    `INSERT INTO reading_progress (user_id, book_id, chapter, verse, updated_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (user_id, book_id) DO UPDATE SET chapter=$3, verse=$4, updated_at=NOW()`,
    [req.user.id, book_id, chapter, verse]
  );
  res.json({ ok: true });
});

// ─── COMMENTS ROUTES ──────────────────────────────────────────────────────────
app.get('/api/comments', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT comment_key, text FROM comments WHERE user_id=$1',
    [req.user.id]
  );
  const map = {};
  result.rows.forEach(r => { map[r.comment_key] = r.text; });
  res.json(map);
});

app.post('/api/comments', authMiddleware, async (req, res) => {
  const { comment_key, text } = req.body;
  if (!comment_key) return res.status(400).json({ error: 'comment_key requerido' });
  await pool.query(
    `INSERT INTO comments (user_id, comment_key, text, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (user_id, comment_key) DO UPDATE SET text=$3, updated_at=NOW()`,
    [req.user.id, comment_key, text]
  );
  res.json({ ok: true });
});

app.delete('/api/comments/:key', authMiddleware, async (req, res) => {
  await pool.query(
    'DELETE FROM comments WHERE user_id=$1 AND comment_key=$2',
    [req.user.id, decodeURIComponent(req.params.key)]
  );
  res.json({ ok: true });
});

// ─── DOCUMENTS ROUTES ─────────────────────────────────────────────────────────
app.get('/api/documents', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM user_documents WHERE user_id=$1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(result.rows);
});

app.post('/api/documents', authMiddleware, async (req, res) => {
  const { title, content, book_name, chapter } = req.body;
  const result = await pool.query(
    'INSERT INTO user_documents (user_id, title, content, book_name, chapter) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.user.id, title, content, book_name, chapter]
  );
  res.json(result.rows[0]);
});

app.delete('/api/documents/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM user_documents WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ─── START ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`✅ Bibliotheca Catholica API corriendo en puerto ${PORT}`));
}).catch(err => {
  console.error('❌ Error iniciando DB:', err);
  process.exit(1);
});
