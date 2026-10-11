import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { Share, User } from '../../types';

export function ShareDialog({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    Promise.all([api.listUsers(), api.listShares(documentId)])
      .then(([u, s]) => {
        setUsers(u);
        setShares(s);
      })
      .catch((e: Error) => setError(e.message));
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [documentId, onClose]);

  const sharedIds = new Set(shares.map((s) => s.user_id));
  const candidates = users?.filter((u) => !sharedIds.has(u.id)) ?? [];

  async function add() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      setShares(await api.addShare(documentId, selected));
      setSelected('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(userId: string) {
    setError(null);
    try {
      await api.removeShare(documentId, userId);
      setShares((s) => s.filter((x) => x.user_id !== userId));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="share-title" className="w-full min-w-0 max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="share-title" className="text-lg font-semibold">Share document</h2>
            <p className="text-xs text-slate-500">Recipients get view-only access. Only you can edit.</p>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="rounded-md px-2 text-xl leading-none text-slate-400 hover:text-slate-700">×</button>
        </div>

        <div className="mt-4 flex gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={!users || candidates.length === 0}
            aria-label="Select a user to share with"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
          >
            <option value="">{!users ? 'Loading users…' : candidates.length ? 'Choose a user…' : 'Everyone already has access'}</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
          <button
            onClick={() => void add()}
            disabled={!selected || busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Share
          </button>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-400">People with access</h3>
        <ul className="mt-2 divide-y divide-slate-100">
          {shares.length === 0 && <li className="py-3 text-sm text-slate-500">Not shared with anyone yet.</li>}
          {shares.map((s) => (
            <li key={s.user_id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="truncate text-xs text-slate-500">{s.email} · Viewer</p>
              </div>
              <button onClick={() => void revoke(s.user_id)} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
