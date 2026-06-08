import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from './api';
import './App.css';

// ─── STATIC DATA ──────────────────────────────────────────────────────────────
const BOOKS_CATALOG = [
  { id: 'biblia',      name: 'Biblia de Jerusalén',               cat: 'Sagrada Escritura',       icon: '✝',  chapters: ['Génesis','Éxodo','Salmos','Isaías','Evangelio de Juan','Evangelio de Mateo'], hasFootnotes: true,  hasMarginRefs: true  },
  { id: 'catecismo',   name: 'Catecismo de la Iglesia Católica',  cat: 'Magisterio',              icon: '⛪', chapters: ['Profesión de Fe','Celebración del Misterio','Vida en Cristo','Oración Cristiana'],            hasFootnotes: true,  hasMarginRefs: false },
  { id: 'vaticano2',   name: 'Concilio Vaticano II',              cat: 'Documentos Conciliares',  icon: '📜', chapters: ['Lumen Gentium','Gaudium et Spes','Dei Verbum','Sacrosanctum Concilium'],                      hasFootnotes: true,  hasMarginRefs: false },
  { id: 'laudatosi',   name: "Laudato Si' (Francisco)",           cat: 'Encíclicas',              icon: '🌿', chapters: ['Capítulo I','Capítulo II','Capítulo III','Capítulo IV','Capítulo V','Capítulo VI'],            hasFootnotes: true,  hasMarginRefs: false },
  { id: 'teresaavila', name: 'Las Moradas - Teresa de Ávila',     cat: 'Santos y Doctores',       icon: '🕊', chapters: ['Primeras Moradas','Segundas Moradas','Terceras Moradas','Cuartas Moradas','Quintas Moradas'], hasFootnotes: false, hasMarginRefs: false },
  { id: 'agustin',     name: 'Confesiones - San Agustín',         cat: 'Santos y Doctores',       icon: '📖', chapters: ['Libro I','Libro II','Libro III','Libro IV','Libro V'],                                       hasFootnotes: true,  hasMarginRefs: false },
];

const SAMPLE_TEXT = {
  biblia: {
    'Evangelio de Juan': [
      { v:1,  text: 'En el principio era el Verbo*, y el Verbo estaba con Dios, y el Verbo era Dios.',                                                                               footnote: '*Verbo: traducción del griego Logos. Véase también Sabiduría 8,22 y Proverbios 8,30.',                          refs: ['Gn 1,1','1Jn 1,1','Ap 19,13'] },
      { v:2,  text: 'Él estaba en el principio con Dios.',                                                                                                                            refs: ['Col 1,17'] },
      { v:3,  text: 'Todo se hizo por él y sin él no se hizo nada de cuanto existe.',                                                                                                 footnote: '*Todo se hizo: toda la creación tiene su origen en el Logos.',                                               refs: ['Col 1,16','Heb 1,2'] },
      { v:4,  text: 'En él estaba la vida* y la vida era la luz de los hombres.',                                                                                                     footnote: '*La vida: tema central del cuarto evangelio; aparece 36 veces.',                                             refs: ['Jn 5,26','Jn 11,25'] },
      { v:5,  text: 'La luz brilla en las tinieblas y las tinieblas no la vencieron.',                                                                                                refs: ['Jn 3,19','1Jn 2,8'] },
      { v:14, text: 'Y el Verbo se hizo carne* y puso su morada entre nosotros, y hemos visto su gloria, gloria que recibe del Padre como Hijo único, lleno de gracia y de verdad.', footnote: '*Se hizo carne: la Encarnación. El término sarx subraya la plena humanidad asumida por el Verbo eterno.',   refs: ['Flp 2,7','Col 2,9','CIC 461'] },
    ],
  },
  catecismo: {
    'Profesión de Fe': [
      { v:1,  text: 'Dios, infinitamente perfecto y bienaventurado en sí mismo, en un designio de pura bondad ha creado libremente al hombre para hacerle partícipe de su vida bienaventurada.', refs: ['LG 2','GS 19'] },
      { v:2,  text: 'Por ello, en todo tiempo y en todo lugar, Dios está cerca del hombre. Le llama y le ayuda a buscarle, a conocerle y a amarle con todas sus fuerzas.',                        refs: ['Hch 17,26-27'] },
      { v:26, text: 'La fe cristiana no es una «religión del Libro». El cristianismo es la religión de la «Palabra» de Dios, «no de un verbo escrito y mudo, sino del Verbo encarnado y vivo».',  refs: ['Jn 1,14','DV 21'] },
    ],
  },
};

const CROSS_REFS_DB = {
  'Jn 1,1':     { book: 'biblia',    chapter: 'Evangelio de Juan',  verse: 1,  text: 'En el principio era el Verbo...' },
  'Gn 1,1':     { book: 'biblia',    chapter: 'Génesis',            verse: 1,  text: 'En el principio creó Dios los cielos y la tierra.' },
  'Col 1,16':   { book: 'biblia',    chapter: 'Evangelio de Juan',  verse: 3,  text: 'Porque en él fueron creadas todas las cosas...' },
  'LG 2':       { book: 'vaticano2', chapter: 'Lumen Gentium',      verse: 2,  text: 'La naturaleza de la Iglesia se ilumina...' },
  'CIC 461':    { book: 'catecismo', chapter: 'Profesión de Fe',    verse: 1,  text: 'La Iglesia llama "Encarnación" al hecho de que el Hijo de Dios...' },
};

// ─── API HELPER (Claude AI) ───────────────────────────────────────────────────
async function callClaude(messages, system) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: system || 'Eres un experto en teología católica, Sagradas Escrituras y textos de la tradición de la Iglesia Católica. Responde en español, de manera concisa, erudita y pastoral.',
      messages,
    }),
  });
  const d = await r.json();
  return d.content?.map(c => c.text || '').join('') || '';
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', confirm: '', email: '', role: 'lector' });
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  function handle(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }

  async function doLogin() {
    if (!form.username || !form.password) { setMsg({ t: 'error', m: 'Ingrese usuario y contraseña' }); return; }
    setLoading(true); setMsg(null);
    try {
      const { token, user } = await api.login({ username: form.username, password: form.password });
      localStorage.setItem('bc_token', token);
      setMsg({ t: 'success', m: `Bienvenido, ${user.username}` });
      setTimeout(() => onLogin(user), 500);
    } catch (err) { setMsg({ t: 'error', m: err.message }); }
    setLoading(false);
  }

  async function doRegister() {
    if (!form.username || !form.password || !form.email) { setMsg({ t: 'error', m: 'Complete todos los campos' }); return; }
    if (form.password !== form.confirm) { setMsg({ t: 'error', m: 'Las contraseñas no coinciden' }); return; }
    setLoading(true); setMsg(null);
    try {
      const { token, user } = await api.register({ username: form.username, email: form.email, password: form.password, role: form.role });
      localStorage.setItem('bc_token', token);
      setMsg({ t: 'success', m: 'Cuenta creada. Iniciando sesión...' });
      setTimeout(() => onLogin(user), 500);
    } catch (err) { setMsg({ t: 'error', m: err.message }); }
    setLoading(false);
  }

  return (
    <div className="auth-screen">
      <div className="auth-logo">
        <span className="cross">✝</span>
        <h1>BIBLIOTHECA CATHOLICA</h1>
        <p>Biblioteca de Textos Sagrados</p>
      </div>
      <div className="auth-box">
        <div className="auth-tabs">
          <div className={'auth-tab' + (tab === 'login' ? ' active' : '')} onClick={() => { setTab('login'); setMsg(null); }}>Ingresar</div>
          <div className={'auth-tab' + (tab === 'register' ? ' active' : '')} onClick={() => { setTab('register'); setMsg(null); }}>Registrarse</div>
        </div>
        {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
        {tab === 'login' ? (
          <>
            <div className="field"><label>Usuario</label><input name="username" value={form.username} onChange={handle} onKeyDown={e => e.key === 'Enter' && doLogin()} autoComplete="username" /></div>
            <div className="field"><label>Contraseña</label><input name="password" type="password" value={form.password} onChange={handle} onKeyDown={e => e.key === 'Enter' && doLogin()} autoComplete="current-password" /></div>
            <button className="btn" onClick={doLogin} disabled={loading}>{loading ? 'Ingresando...' : 'Entrar'}</button>
          </>
        ) : (
          <>
            <div className="field"><label>Usuario</label><input name="username" value={form.username} onChange={handle} /></div>
            <div className="field"><label>Email</label><input name="email" type="email" value={form.email} onChange={handle} /></div>
            <div className="field"><label>Contraseña</label><input name="password" type="password" value={form.password} onChange={handle} /></div>
            <div className="field"><label>Confirmar contraseña</label><input name="confirm" type="password" value={form.confirm} onChange={handle} /></div>
            <div className="field">
              <label>Perfil de lectura</label>
              <select name="role" value={form.role} onChange={handle}>
                <option value="lector">Lector general</option>
                <option value="estudiante">Estudiante de teología</option>
                <option value="sacerdote">Sacerdote / Diácono</option>
                <option value="religioso">Religioso/a</option>
                <option value="investigador">Investigador</option>
              </select>
            </div>
            <button className="btn" onClick={doRegister} disabled={loading}>{loading ? 'Creando cuenta...' : 'Crear cuenta'}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ADD BOOK MODAL ───────────────────────────────────────────────────────────
function AddBookModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ name: '', cat: 'Sagrada Escritura', text: '' });
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const fileRef = useRef();

  function handle(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }

  async function handleFile(f) {
    setFile(f);
    setForm(prev => ({ ...prev, name: prev.name || f.name.replace(/\.[^.]+$/, '') }));
    setMsg({ t: 'info', m: `📄 ${f.name} (${(f.size/1024).toFixed(0)} KB) — listo para cargar` });
  }

  async function doAdd() {
    if (!form.name) { setMsg({ t: 'error', m: 'Ingrese el nombre del libro' }); return; }
    if (!file && !form.text.trim()) { setMsg({ t: 'error', m: 'Suba un archivo o ingrese texto directamente' }); return; }
    setLoading(true); setMsg(null);
    try {
      let book;
      if (file) {
        setProgress('Enviando archivo al servidor...');
        book = await api.uploadBook(file, form.name, form.cat);
      } else {
        setProgress('Estructurando el texto...');
        book = await api.createBook({ name: form.name, category: form.cat, content: form.text, has_footnotes: form.text.includes('*'), chapters: ['Capítulo 1'] });
      }
      setProgress('');
      onAdd({
        ...book, id: `db_${book.id}`, dbId: book.id,
        cat: book.category, icon: '📄',
        chapters: book.chapters?.length ? book.chapters : ['Capítulo 1'],
        hasFootnotes: book.has_footnotes, hasMarginRefs: false,
      });
    } catch (err) { setMsg({ t: 'error', m: err.message }); setProgress(''); }
    setLoading(false);
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="modal-box">
        <div className="modal-title">Incorporar nuevo texto</div>
        {!loading && <button className="modal-close" onClick={onClose}>✕</button>}
        {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
        <div className="field"><label>Nombre del libro / documento</label>
          <input name="name" value={form.name} onChange={handle} disabled={loading} />
        </div>
        <div className="field">
          <label>Categoría</label>
          <select name="cat" value={form.cat} onChange={handle} disabled={loading}>
            <option>Sagrada Escritura</option><option>Magisterio</option>
            <option>Documentos Conciliares</option><option>Encíclicas</option>
            <option>Santos y Doctores</option><option>Liturgia</option><option>Otro</option>
          </select>
        </div>
        <div
          className={'upload-zone' + (dragging ? ' drag' : '')}
          onClick={() => !loading && fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); if (!loading) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); if (!loading && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        >
          <div className="upload-icon">{file ? '✅' : '⬆'}</div>
          <p>{file ? file.name : 'Arrastre un archivo o haga clic para seleccionar'}</p>
          <div className="format-badges">
            {['TXT', 'CSV', 'DOCX', 'PDF', 'MD'].map(f => <span key={f} className="format-badge">{f}</span>)}
          </div>
          <input ref={fileRef} type="file" style={{ display: 'none' }} accept=".txt,.csv,.pdf,.docx,.md"
            onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
        </div>
        {!file && (
          <div className="field" style={{ marginTop: '1rem' }}>
            <label>O pegue el texto directamente</label>
            <textarea name="text" value={form.text} onChange={handle} disabled={loading}
              style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--parch)', padding: '.6rem', fontFamily: "'EB Garamond',serif", fontSize: '.9rem', minHeight: 120, resize: 'vertical', outline: 'none', marginTop: '.4rem' }}
              placeholder="Pegue aquí el texto. Use * para notas al pie y [Ref] para citas." />
          </div>
        )}
        {loading && (
          <div style={{ textAlign: 'center', padding: '1rem 0', fontFamily: "'Lato',sans-serif", fontSize: '.82rem', color: 'var(--gold-dim)' }}>
            <span className="loading-dots"><span>.</span><span>.</span><span>.</span></span>{' '}{progress}
          </div>
        )}
        <button className="btn" onClick={doAdd} disabled={loading} style={{ marginTop: '.5rem' }}>
          {loading ? 'Procesando...' : 'Incorporar a la biblioteca'}
        </button>
      </div>
    </div>
  );
}

// ─── CITATION TREE ────────────────────────────────────────────────────────────
function CitationTree({ book, chapter, verse, userComments, onComment }) {
  const [expanded, setExpanded] = useState({});
  const [editKey, setEditKey] = useState(null);
  const [commentText, setCommentText] = useState('');

  const verses = SAMPLE_TEXT[book?.id]?.[chapter] || [];
  const v = verses.find(v => v.v === verse);

  if (!v?.refs?.length) return (
    <div className="cite-tree">
      <div className="tree-title">Árbol de Citas</div>
      <p style={{ color: 'var(--parch-dark)', fontSize: '.82rem', fontFamily: "'Lato',sans-serif", padding: '1rem 0' }}>
        Seleccione un versículo para ver sus citas vinculadas.
      </p>
    </div>
  );

  return (
    <div className="cite-tree">
      <div className="tree-title">✝ Árbol de Citas — v.{verse}</div>
      {v.refs.map(ref => {
        const refData = CROSS_REFS_DB[ref];
        const key = `${book?.id}_${verse}_${ref}`;
        const saved = userComments[key];
        return (
          <div key={ref} className="tree-node">
            <div className={'tree-node-header' + (expanded[ref] ? ' expanded' : '')} onClick={() => setExpanded(e => ({ ...e, [ref]: !e[ref] }))}>
              <span className="tree-toggle">{expanded[ref] ? '▾' : '▸'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--gold)', fontFamily: "'Cinzel',serif", fontSize: '.75rem', letterSpacing: '.05em' }}>{ref}</div>
                {refData && <div style={{ fontSize: '.82rem', color: 'var(--parch-dim)', fontStyle: 'italic', lineHeight: 1.5, marginTop: '.2rem' }}>{refData.text}</div>}
              </div>
            </div>
            {expanded[ref] && (
              <div className="tree-children">
                {saved && (
                  <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid var(--border-gold)', padding: '.4rem .6rem', marginBottom: '.4rem', fontSize: '.82rem', color: 'var(--parch-dim)', fontStyle: 'italic' }}>
                    💭 {saved}
                  </div>
                )}
                <div className="comment-box">
                  {editKey === key ? (
                    <>
                      <textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Escriba su comentario personal..." />
                      <div className="comment-actions">
                        <button className="comment-btn" onClick={() => setEditKey(null)}>Cancelar</button>
                        <button className="comment-btn" style={{ borderColor: 'var(--gold-dim)', color: 'var(--gold)' }} onClick={() => { onComment(key, commentText); setEditKey(null); }}>Guardar</button>
                      </div>
                    </>
                  ) : (
                    <button className="comment-btn" style={{ width: '100%' }} onClick={() => { setEditKey(key); setCommentText(saved || ''); }}>
                      {saved ? '✏ Editar comentario' : '+ Agregar comentario personal'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── AI PANEL ─────────────────────────────────────────────────────────────────
function AIPanel({ book, chapter, verse, verseText }) {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!query.trim()) return;
    const ctx = book ? `Contexto: ${book.name}, ${chapter}, versículo ${verse}: "${verseText}".` : '';
    setLoading(true);
    const q = query; setQuery('');
    setHistory(h => [...h, { q, a: '...' }]);
    const a = await callClaude([{ role: 'user', content: `${ctx}\n\nPregunta: ${q}` }]);
    setHistory(h => { const n = [...h]; n[n.length - 1].a = a; return n; });
    setLoading(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '1rem' }}>
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: '.7rem', color: 'var(--gold-dim)', letterSpacing: '.1em', marginBottom: '1rem' }}>✦ CONSULTA TEOLÓGICA</div>
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
        {!history.length && <p style={{ color: 'var(--parch-dark)', fontSize: '.82rem', fontFamily: "'Lato',sans-serif", lineHeight: 1.6 }}>Consulte sobre el texto seleccionado, su contexto histórico, teológico, o pida comparaciones con otros documentos del Magisterio.</p>}
        {history.map((h, i) => (
          <div key={i} style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '.8rem', fontFamily: "'Lato',sans-serif", color: 'var(--parch-dim)', marginBottom: '.3rem' }}>❯ {h.q}</div>
            <div className="ai-response">
              {h.a === '...' ? <span className="loading-dots"><span>.</span><span>.</span><span>.</span></span> : h.a}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && !loading && ask()}
          placeholder="Pregunte sobre el texto..." style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--parch)', padding: '.5rem .7rem', fontFamily: "'EB Garamond',serif", fontSize: '.9rem', outline: 'none' }} />
        <button className="tool-btn" onClick={ask} disabled={loading}>{loading ? '...' : 'Consultar'}</button>
      </div>
    </div>
  );
}

// ─── READER VIEW ──────────────────────────────────────────────────────────────
function ReaderView({ book, chapter, setChapter, currentVerse, setCurrentVerse, userComments, onComment, user }) {
  const [sidePart, setSidePart] = useState('tree');
  const scrollRef = useRef();

  // ── Resolve verses for the current chapter ────────────────────────────────
  // Priority: static sample data → parsed structured JSON content → raw text
  const staticVerses = SAMPLE_TEXT[book?.id]?.[chapter] || [];

  const parsedChapters = useCallback(() => {
    if (!book?.content) return null;
    try {
      const arr = JSON.parse(book.content);
      if (Array.isArray(arr)) return arr;
    } catch {}
    return null;
  }, [book?.content])();

  const userVerses = useCallback(() => {
    if (!parsedChapters) return [];
    const ch = parsedChapters.find(c => c.title === chapter) || parsedChapters[0];
    return ch?.verses || [];
  }, [parsedChapters, chapter])();

  const verses = staticVerses.length > 0 ? staticVerses : userVerses;
  const rawText = (!parsedChapters && book?.content && !staticVerses.length) ? book.content : null;
  const selectedVerse = verses.find(v => v.v === currentVerse);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function clickVerse(v) {
    setCurrentVerse(v.v);
    try { await api.saveProgress({ book_id: book.id, chapter, verse: v.v }); } catch {}
  }

  async function goToLastPosition() {
    try {
      const p = await api.getProgress(book.id);
      if (p?.chapter) { setChapter(p.chapter); setCurrentVerse(p.verse); }
    } catch {}
  }

  function goToVerse() {
    const ref = prompt('Ir a versículo / párrafo número:');
    if (ref) { const n = parseInt(ref); if (!isNaN(n)) { setCurrentVerse(n); scrollToVerse(n); } }
  }

  function scrollToVerse(n) {
    setTimeout(() => {
      const el = document.getElementById(`verse-${n}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  // ── Render verse text with footnote marks and cross-refs ──────────────────
  function renderText(text) {
    if (!text) return null;
    return text.split(/(\*|\[[A-Za-z0-9\s,;:.]+\])/).map((part, i) => {
      if (part === '*') return <sup key={i} className="footnote-mark" title="Ver nota al pie">*</sup>;
      if (/^\[.+\]$/.test(part)) return <sup key={i} className="cross-ref" title={`Cita: ${part}`}>{part}</sup>;
      return part;
    });
  }

  const chapterOptions = book?.chapters?.length > 0 ? book.chapters
    : parsedChapters ? parsedChapters.map(c => c.title) : ['Capítulo 1'];

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* ── Toolbar ── */}
        <div className="reader-toolbar">
          <select className="select-sm" value={chapter}
            onChange={e => { setChapter(e.target.value); setCurrentVerse(null); scrollRef.current?.scrollTo(0,0); }}>
            {chapterOptions.map(ch => <option key={ch}>{ch}</option>)}
          </select>
          <button className="tool-btn" onClick={() => { setCurrentVerse(null); scrollRef.current?.scrollTo(0,0); }}>⬆ Inicio</button>
          <button className="tool-btn" onClick={goToLastPosition}>↩ Última posición</button>
          <button className="tool-btn" onClick={goToVerse}>→ Ir a §</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '.3rem' }}>
            <button className={'tool-btn' + (sidePart === 'tree' ? ' active' : '')} onClick={() => setSidePart('tree')}>Citas</button>
            <button className={'tool-btn' + (sidePart === 'ai'   ? ' active' : '')} onClick={() => setSidePart('ai')}>IA</button>
          </div>
        </div>

        {/* ── Main reading area ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div className="reader-panel" ref={scrollRef}>
            <div className="book-header">
              <div className="book-title">{book?.name}</div>
              <div className="book-subtitle">{chapter}</div>
            </div>

            {/* Case 1: structured verses (static or parsed) */}
            {verses.length > 0 && (
              <>
                {verses.map(v => (
                  <div key={v.v} id={`verse-${v.v}`}
                    className={'verse' + (currentVerse === v.v ? ' highlighted' : '')}
                    onClick={() => clickVerse(v)}>
                    <span className="verse-num">{v.v}</span>
                    {renderText(v.text)}
                    {v.refs?.map(r =>
                      <sup key={r} className="cross-ref"
                        onClick={e => { e.stopPropagation(); setCurrentVerse(v.v); }}> [{r}]</sup>
                    )}
                  </div>
                ))}
                {verses.some(v => v.footnote) && (
                  <div className="footnotes-area">
                    <h4>NOTAS AL PIE</h4>
                    {verses.filter(v => v.footnote).map(v => (
                      <div key={v.v} className="footnote-item">
                        <strong>* §{v.v}:</strong> {v.footnote}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Case 2: raw text fallback */}
            {verses.length === 0 && rawText && (
              <div style={{ lineHeight: 1.9, fontSize: '1.05rem', color: 'var(--parch)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {rawText}
              </div>
            )}

            {/* Case 3: no content yet */}
            {verses.length === 0 && !rawText && (
              <div style={{ textAlign: 'center', color: 'var(--parch-dark)', fontFamily: "'Lato',sans-serif", fontSize: '.85rem', lineHeight: 1.8, padding: '2rem 0' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--border-gold)' }}>📜</div>
                <p>Este capítulo aún no tiene texto.<br />
                Use <strong style={{ color: 'var(--gold-dim)' }}>+ Agregar texto</strong> en la barra lateral para incorporar el contenido del libro.</p>
              </div>
            )}
          </div>

          {/* Margin references (Biblia de Jerusalén) */}
          {book?.hasMarginRefs && currentVerse && selectedVerse?.refs && (
            <div className="margin-refs">
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: '.65rem', color: 'var(--gold-dim)', letterSpacing: '.1em', marginBottom: '.8rem' }}>CITAS AL MARGEN</div>
              {selectedVerse.refs.map(r => (
                <div key={r} className="margin-ref-item">
                  <div className="margin-ref-label">{r}</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--parch-dark)', lineHeight: 1.4 }}>
                    {CROSS_REFS_DB[r]?.text?.slice(0, 60) || 'Ver referencia'}...
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      <div style={{ width: 280, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg2)' }}>
        {sidePart === 'tree'
          ? <CitationTree book={book} chapter={chapter} verse={currentVerse} userComments={userComments} onComment={onComment} />
          : <AIPanel book={book} chapter={chapter} verse={currentVerse} verseText={selectedVerse?.text || ''} />
        }
      </div>
    </div>
  );
}

// ─── EXPORT PANEL ─────────────────────────────────────────────────────────────
function ExportPanel({ book, chapter, userComments, user }) {
  const [opts, setOpts] = useState({ notes: true, refs: true, comments: true, header: true });
  const [format, setFormat] = useState('txt');
  const [savedDocs, setSavedDocs] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getDocuments().then(setSavedDocs).catch(() => {});
  }, []);

  function buildDoc() {
    let doc = '';
    if (opts.header) {
      doc += `BIBLIOTHECA CATHOLICA\n`;
      doc += `Usuario: ${user.username}\n`;
      doc += `Fecha: ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}\n`;
      doc += `Libro: ${book?.name || '—'}\n`;
      doc += `Capítulo: ${chapter}\n`;
      doc += `${'═'.repeat(50)}\n\n`;
    }
    const vv = SAMPLE_TEXT[book?.id]?.[chapter] || [];
    vv.forEach(v => {
      doc += `${v.v}. ${v.text}\n`;
      if (opts.refs && v.refs?.length) doc += `   Citas: ${v.refs.join(', ')}\n`;
      if (opts.notes && v.footnote) doc += `   Nota: ${v.footnote}\n`;
      const ck = Object.keys(userComments).filter(k => k.startsWith(`${book?.id}_${v.v}_`));
      if (opts.comments && ck.length) ck.forEach(k => { if (userComments[k]) doc += `   Comentario: ${userComments[k]}\n`; });
      doc += '\n';
    });
    return doc;
  }

  async function saveToServer() {
    setSaving(true);
    try {
      const doc = await api.saveDocument({ title: `${book?.name} — ${chapter}`, content: buildDoc(), book_name: book?.name, chapter });
      setSavedDocs(d => [doc, ...d]);
    } catch (err) { alert(err.message); }
    setSaving(false);
  }

  function download() {
    const blob = new Blob([buildDoc()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${book?.name || 'documento'}_${chapter}.${format}`;
    a.click();
  }

  function print() {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${book?.name}</title><style>
      body{font-family:Georgia,serif;max-width:700px;margin:2rem auto;color:#1a1a1a;line-height:1.8}
      h1{font-size:1.4rem;text-align:center} h2{font-size:1rem;text-align:center;color:#555;font-weight:normal;font-style:italic;margin-bottom:1.5rem}
      .info{font-size:.8rem;color:#777;text-align:center;border-bottom:1px solid #ccc;padding-bottom:1rem;margin-bottom:2rem}
      @media print{body{margin:1cm}}
    </style></head><body>
    <h1>${book?.name || ''}</h1><h2>${chapter}</h2>
    <div class="info">Bibliotheca Catholica · ${user.username} · ${new Date().toLocaleDateString('es-AR')}</div>
    <pre style="white-space:pre-wrap;font-family:Georgia,serif">${buildDoc()}</pre>
    </body></html>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  }

  return (
    <div className="export-panel">
      <div className="export-section">
        <h4>OPCIONES DE CONTENIDO</h4>
        {[['header', 'Encabezado'], ['notes', 'Notas al pie'], ['refs', 'Referencias cruzadas'], ['comments', 'Comentarios personales']].map(([k, l]) => (
          <div key={k} className={'export-option' + (opts[k] ? ' selected' : '')} onClick={() => setOpts(o => ({ ...o, [k]: !o[k] }))}>
            <input type="checkbox" checked={opts[k]} onChange={() => {}} />
            <label>{l}</label>
          </div>
        ))}
      </div>
      <div className="export-section">
        <h4>FORMATO</h4>
        {[['txt', 'Texto plano (.txt)'], ['md', 'Markdown (.md)'], ['csv', 'CSV (.csv)']].map(([f, l]) => (
          <div key={f} className={'export-option' + (format === f ? ' selected' : '')} onClick={() => setFormat(f)}>
            <input type="radio" checked={format === f} onChange={() => {}} name="fmt" /><label>{l}</label>
          </div>
        ))}
      </div>
      <div className="export-section">
        <h4>VISTA PREVIA</h4>
        <div className="export-preview">{buildDoc().slice(0, 600) || 'Seleccione un libro y capítulo'}</div>
      </div>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <button className="tool-btn" style={{ flex: 1 }} onClick={download}>⬇ Descargar</button>
        <button className="tool-btn" style={{ flex: 1 }} onClick={print}>🖶 Imprimir</button>
        <button className="tool-btn" style={{ flex: 1 }} onClick={saveToServer} disabled={saving}>{saving ? '...' : '☁ Guardar en servidor'}</button>
      </div>
      {savedDocs.length > 0 && (
        <div className="export-section" style={{ marginTop: '1.5rem' }}>
          <h4>DOCUMENTOS GUARDADOS</h4>
          {savedDocs.map(d => (
            <div key={d.id} style={{ padding: '.5rem .8rem', border: '1px solid var(--border)', marginBottom: '.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '.82rem', color: 'var(--parch)', fontFamily: "'Lato',sans-serif" }}>{d.title}</div>
                <div style={{ fontSize: '.7rem', color: 'var(--parch-dark)', fontFamily: "'Lato',sans-serif" }}>{new Date(d.created_at).toLocaleDateString('es-AR')}</div>
              </div>
              <button className="tool-btn" style={{ fontSize: '.7rem' }} onClick={() => {
                const blob = new Blob([d.content], { type: 'text/plain' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${d.title}.txt`; a.click();
              }}>⬇</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [books, setBooks] = useState(BOOKS_CATALOG);
  const [selectedBook, setSelectedBook] = useState(null);
  const [chapter, setChapter] = useState('');
  const [currentVerse, setCurrentVerse] = useState(null);
  const [mainTab, setMainTab] = useState('reader');
  const [showAddBook, setShowAddBook] = useState(false);
  const [userComments, setUserComments] = useState({});
  const [checkingToken, setCheckingToken] = useState(true);

  // Auto-login if token exists
  useEffect(() => {
    const token = localStorage.getItem('bc_token');
    if (token) {
      api.getMe().then(u => { setUser(u); loadUserData(); }).catch(() => localStorage.removeItem('bc_token')).finally(() => setCheckingToken(false));
    } else { setCheckingToken(false); }
  }, []);

  async function loadUserData() {
    try {
      const [comments, userBooks] = await Promise.all([api.getComments(), api.getBooks()]);
      setUserComments(comments || {});
      if (userBooks?.length) {
        const extra = userBooks.map(b => ({ ...b, id: `db_${b.id}`, dbId: b.id, cat: b.category, icon: b.icon || '📄', chapters: b.chapters || ['Capítulo 1'], hasFootnotes: b.has_footnotes, hasMarginRefs: false }));
        setBooks([...BOOKS_CATALOG, ...extra]);
      }
    } catch {}
  }

  function handleLogin(u) { setUser(u); loadUserData(); }

  function selectBook(b) { setSelectedBook(b); setChapter(b.chapters[0]); setCurrentVerse(null); setMainTab('reader'); }

  function addBook(newBook) { setBooks(bk => [...bk, newBook]); setShowAddBook(false); selectBook(newBook); }

  async function saveComment(key, text) {
    const updated = { ...userComments, [key]: text };
    setUserComments(updated);
    try { await api.saveComment({ comment_key: key, text }); } catch {}
  }

  function logout() {
    localStorage.removeItem('bc_token');
    setUser(null); setSelectedBook(null); setChapter(''); setCurrentVerse(null);
    setUserComments({}); setBooks(BOOKS_CATALOG);
  }

  if (checkingToken) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--gold)', fontFamily: "'Cinzel',serif", letterSpacing: '.2em' }}>BIBLIOTHECA CATHOLICA</div>;
  if (!user) return <AuthScreen onLogin={handleLogin} />;

  const cats = [...new Set(books.map(b => b.cat))];

  return (
    <div className="main-layout">
      <div className="top-bar">
        <div className="top-bar-title">✝ BIBLIOTHECA CATHOLICA</div>
        <div className="top-bar-user">
          <span style={{ color: 'var(--gold-dim)' }}>✦ {user.username}</span>
          <span style={{ fontSize: '.7rem', color: 'var(--parch-dark)', fontFamily: "'Lato',sans-serif" }}>{user.role}</span>
          <button onClick={logout}>Salir</button>
        </div>
      </div>
      <div className="content-area">
        <div className="sidebar">
          <div className="sidebar-section"><h3>Biblioteca</h3></div>
          <div className="book-list">
            {cats.map(cat => (
              <div key={cat} style={{ marginBottom: '.5rem' }}>
                <div style={{ fontFamily: "'Lato',sans-serif", fontSize: '.65rem', color: 'var(--parch-dark)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '.3rem .8rem' }}>{cat}</div>
                {books.filter(b => b.cat === cat).map(b => (
                  <div key={b.id} className={'book-item' + (selectedBook?.id === b.id ? ' active' : '')} onClick={() => selectBook(b)}>
                    <span className="book-icon">{b.icon}</span>
                    <div className="book-info">
                      <div className="book-name">{b.name}</div>
                      {b.dbId && <div className="book-cat" style={{ color: 'var(--gold-dim)' }}>Agregado por ti</div>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <button className="add-book-btn" onClick={() => setShowAddBook(true)}>
              <span>+</span> Agregar texto
            </button>
          </div>
        </div>
        <div className="main-panel">
          {!selectedBook ? (
            <div className="welcome-panel">
              <div className="cross-big">✝</div>
              <h2>BIBLIOTHECA CATHOLICA</h2>
              <p>Seleccione un libro de la biblioteca para comenzar su lectura. Puede retomar donde lo dejó, ir a una cita específica, explorar referencias cruzadas y agregar comentarios personales.</p>
              <div style={{ marginTop: '2rem', display: 'flex', flexWrap: 'wrap', gap: '.5rem', justifyContent: 'center' }}>
                {books.slice(0, 4).map(b => <button key={b.id} className="tool-btn" onClick={() => selectBook(b)} style={{ fontSize: '.8rem' }}>{b.icon} {b.name.split(' ').slice(0, 3).join(' ')}</button>)}
              </div>
            </div>
          ) : (
            <>
              <div className="panel-tabs">
                <div className={'panel-tab' + (mainTab === 'reader' ? ' active' : '')} onClick={() => setMainTab('reader')}>📖 Lector</div>
                <div className={'panel-tab' + (mainTab === 'export' ? ' active' : '')} onClick={() => setMainTab('export')}>🖶 Exportar / Imprimir</div>
              </div>
              <div className="panel-body">
                {mainTab === 'reader' && <ReaderView book={selectedBook} chapter={chapter} setChapter={setChapter} currentVerse={currentVerse} setCurrentVerse={setCurrentVerse} userComments={userComments} onComment={saveComment} user={user} />}
                {mainTab === 'export' && <ExportPanel book={selectedBook} chapter={chapter} userComments={userComments} user={user} />}
              </div>
            </>
          )}
        </div>
      </div>
      {showAddBook && <AddBookModal onClose={() => setShowAddBook(false)} onAdd={addBook} />}
    </div>
  );
}
