// Dirección del backend. En producción se lee de la variable de entorno.
const API_BASE = process.env.REACT_APP_API_URL || '';

async function request(path, options = {}) {
  const token = localStorage.getItem('bc_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

// Auth
export const register = (body) => request('/api/register', { method: 'POST', body: JSON.stringify(body) });
export const login    = (body) => request('/api/login',    { method: 'POST', body: JSON.stringify(body) });
export const getMe    = ()     => request('/api/me');

// Books
export const getBooks    = ()     => request('/api/books');
export const createBook  = (body) => request('/api/books', { method: 'POST', body: JSON.stringify(body) });
export const deleteBook  = (id)   => request(`/api/books/${id}`, { method: 'DELETE' });

export async function uploadBook(file, name, category) {
  const token = localStorage.getItem('bc_token');
  const form = new FormData();
  form.append('file', file);
  form.append('name', name);
  form.append('category', category);
  const res = await fetch(`${API_BASE}/api/books/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error subiendo archivo');
  return data;
}

// Progress
export const getProgress  = (bookId) => request(`/api/progress/${bookId}`);
export const saveProgress = (body)   => request('/api/progress', { method: 'POST', body: JSON.stringify(body) });

// Comments
export const getComments  = ()           => request('/api/comments');
export const saveComment  = (body)       => request('/api/comments', { method: 'POST', body: JSON.stringify(body) });
export const deleteComment = (key)       => request(`/api/comments/${encodeURIComponent(key)}`, { method: 'DELETE' });

// Documents
export const getDocuments   = ()     => request('/api/documents');
export const saveDocument   = (body) => request('/api/documents', { method: 'POST', body: JSON.stringify(body) });
export const deleteDocument = (id)   => request(`/api/documents/${id}`, { method: 'DELETE' });
