import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DocumentSummary } from '../types';

type Tab = 'mine' | 'shared';
const ACCEPT = '.txt,.md,.markdown,.docx';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>('mine');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setError(null);
    api.listDocuments().then(setDocs).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const mine = docs?.filter((d) => d.role === 'owner') ?? [];
  const shared = docs?.filter((d) => d.role !== 'owner') ?? [];
  const visible = tab === 'mine' ? mine : shared;

  async function createDoc() {
    setBusy(true);
    try {
      const doc = await api.createDocument();
      navigate(`/docs/${doc.id}`);
    } catch (e) {
      setNotice({ kind: 'error', text: (e as Error).message });
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const doc = await api.importDocument(file);
      navigate(`/docs/${doc.id}`);
    } catch (e) {
      setNotice({ kind: 'error', text: (e as Error).message });
      setBusy(false);
    }
  }

  async function commitRename() {
    if (!renaming) return;
    const title = renaming.title.trim();
    const current = docs?.find((d) => d.id === renaming.id);
    setRenaming(null);
    if (!title || !current || title === current.title) return;
    try {
      await api.updateDocument(renaming.id, { title });
      setDocs((ds) => ds?.map((d) => (d.id === renaming.id ? { ...d, title } : d)) ?? null);
    } catch (e) {
      setNotice({ kind: 'error', text: `Rename failed: ${(e as Error).message}` });
    }
  }

  async function remove(d: DocumentSummary) {
    if (!window.confirm(`Delete “${d.title}”? This can’t be undone.`)) return;
    try {
      await api.deleteDocument(d.id);
      setDocs((ds) => ds?.filter((x) => x.id !== d.id) ?? null);
    } catch (e) {
      setNotice({ kind: 'error', text: `Delete failed: ${(e as Error).message}` });
    }
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-b border-slate-200 bg-white p-4 md:border-b-0 md:border-r">
        <h1 className="text-xl font-bold tracking-tight">Draftly</h1>
        <nav className="mt-4 flex gap-1 md:flex-col" aria-label="Document filters">
          {([['mine', 'My documents', mine.length], ['shared', 'Shared with me', shared.length]] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                tab === key ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
              {docs && <span className="ml-2 rounded-full bg-slate-100 px-2 text-xs text-slate-500">{count}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-sm md:mt-6 md:block md:pt-4">
          <div className="min-w-0">
            <p className="truncate font-medium">{user?.name}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <button onClick={logout} className="shrink-0 text-xs md:mt-2 font-medium text-slate-500 hover:text-slate-900">Sign out</button>
        </div>
      </aside>

      <main className="p-4 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{tab === 'mine' ? 'My documents' : 'Shared with me'}</h2>
          <div className="flex gap-2">
            <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={(e) => void onFile(e.target.files?.[0])} />
            <button
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              title="Supported: .txt, .md, .docx (max 5 MB)"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              Import file
            </button>
            <button
              disabled={busy}
              onClick={() => void createDoc()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              + New document
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-400">Import supports .txt, .md and .docx files up to 5 MB.</p>

        {notice && (
          <p role="alert" className={`mt-4 rounded-lg px-3 py-2 text-sm ${notice.kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {notice.text}
          </p>
        )}

        <div className="mt-6">
          {error ? (
            <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {error} <button onClick={load} className="ml-2 font-semibold underline">Retry</button>
            </div>
          ) : !docs ? (
            <ul className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => <li key={i} className="h-16 animate-pulse rounded-xl bg-slate-200/60" />)}
            </ul>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
              {tab === 'mine' ? 'No documents yet. Create one or import a file to get started.' : 'Nothing has been shared with you yet.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              {visible.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    {renaming?.id === d.id ? (
                      <input
                        autoFocus
                        value={renaming.title}
                        maxLength={200}
                        aria-label="Document name"
                        onChange={(e) => setRenaming({ id: d.id, title: e.target.value })}
                        onBlur={() => void commitRename()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitRename();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        className="w-full rounded-md border border-indigo-400 px-2 py-1 text-sm font-medium focus:outline-none"
                      />
                    ) : (
                      <button onClick={() => navigate(`/docs/${d.id}`)} className="block w-full truncate text-left text-sm font-medium hover:text-indigo-600">
                        {d.title}
                      </button>
                    )}
                    <p className="mt-0.5 text-xs text-slate-500">
                      Updated {fmt(d.updated_at)}
                      {d.role !== 'owner' && ` · Owner: ${d.owner_name}`}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${d.role === 'owner' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-800'}`}>
                    {d.role === 'owner' ? 'Owned' : 'Shared · view only'}
                  </span>
                  {d.role === 'owner' && (
                    <div className="flex gap-1 text-xs">
                      <button onClick={() => setRenaming({ id: d.id, title: d.title })} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">Rename</button>
                      <button onClick={() => void remove(d)} className="rounded-md px-2 py-1 text-red-600 hover:bg-red-50">Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
