import type { DocContent, DocumentDetail, DocumentSummary, Share, User } from '../types';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'draftly.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', message);
  }
  return body as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<{ user: User }>('/api/auth/me'),
  listDocuments: () => request<{ documents: DocumentSummary[] }>('/api/documents').then((r) => r.documents),
  createDocument: (input: { title?: string; content?: DocContent } = {}) =>
    request<{ document: DocumentDetail }>('/api/documents', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.document),
  getDocument: (id: string) => request<{ document: DocumentDetail }>(`/api/documents/${id}`).then((r) => r.document),
  updateDocument: (id: string, patch: { title?: string; content?: DocContent }) =>
    request<{ document: DocumentDetail }>(`/api/documents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }).then((r) => r.document),
  deleteDocument: (id: string) => request<void>(`/api/documents/${id}`, { method: 'DELETE' }),
  listUsers: () => request<{ users: User[] }>('/api/users').then((r) => r.users),
  listShares: (id: string) => request<{ shares: Share[] }>(`/api/documents/${id}/shares`).then((r) => r.shares),
  addShare: (id: string, userId: string) =>
    request<{ shares: Share[] }>(`/api/documents/${id}/shares`, { method: 'POST', body: JSON.stringify({ userId }) }).then((r) => r.shares),
  removeShare: (id: string, userId: string) => request<void>(`/api/documents/${id}/shares/${userId}`, { method: 'DELETE' }),
  importDocument: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ document: DocumentDetail }>('/api/documents/import', { method: 'POST', body: form }).then((r) => r.document);
  },
};
