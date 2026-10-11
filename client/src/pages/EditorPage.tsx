import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Toolbar } from '../components/editor/Toolbar';
import { ShareDialog } from '../components/sharing/ShareDialog';
import { useAutosave, type SaveStatus } from '../hooks/useAutosave';
import { api } from '../lib/api';
import type { DocContent, DocumentDetail } from '../types';

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Save failed',
};

export function EditorPage() {
  const { id = '' } = useParams();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setDoc(null);
    setLoadError(null);
    api.getDocument(id).then(setDoc).catch((e: Error) => setLoadError(e.message));
  }, [id]);

  if (loadError) {
    return (
      <Shell>
        <div className="mx-auto mt-24 max-w-md text-center">
          <p className="text-lg font-semibold">Couldn’t open this document</p>
          <p className="mt-1 text-sm text-slate-500">{loadError}</p>
          <Link to="/" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline">Back to documents</Link>
        </div>
      </Shell>
    );
  }
  if (!doc) return <Shell><p className="mt-24 text-center text-sm text-slate-500">Loading…</p></Shell>;
  return <EditorView key={doc.id} doc={doc} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}

function EditorView({ doc }: { doc: DocumentDetail }) {
  const readOnly = doc.role !== 'owner';
  const [title, setTitle] = useState(doc.title);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const closeSharing = useCallback(() => setSharing(false), []);

  const { status, queue, flush } = useAutosave<{ title: string; content: DocContent }>({
    save: async (patch) => {
      try {
        await api.updateDocument(doc.id, patch);
        setSaveError(null);
      } catch (e) {
        setSaveError((e as Error).message);
        throw e;
      }
    },
  });

  const editor = useEditor({
    extensions: [StarterKit], // includes underline, lists, headings, history
    content: doc.content,
    editable: !readOnly,
    editorProps: { attributes: { class: 'doc-editor', 'aria-label': 'Document body' } },
    onUpdate: ({ editor }) => queue({ content: editor.getJSON() as DocContent }),
  });

  const lastTitle = useRef(doc.title); // last title sent for saving (doc.title is only the initial value)
  const commitTitle = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return setTitle(lastTitle.current); // empty titles are rejected by the API
    setTitle(trimmed);
    if (trimmed !== lastTitle.current) {
      lastTitle.current = trimmed;
      queue({ title: trimmed });
    }
  }, [title, queue]);

  return (
    <Shell>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-900" aria-label="Back to documents" onClick={() => void flush()}>
            ← Documents
          </Link>
          <input
            value={title}
            readOnly={readOnly}
            maxLength={200}
            aria-label="Document title"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !readOnly && commitTitle()}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-lg font-semibold hover:border-slate-200 focus:border-indigo-400 focus:outline-none read-only:hover:border-transparent"
          />
          {readOnly ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              View only · shared by {doc.owner_name}
            </span>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-2" aria-live="polite">
                <span className={status === 'error' ? 'text-red-600' : 'text-slate-500'}>{STATUS_LABEL[status]}</span>
                {status === 'error' && (
                  <button onClick={() => void flush()} className="rounded-md border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50">
                    Retry
                  </button>
                )}
              </div>
              <button onClick={() => setSharing(true)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
                Share
              </button>
            </div>
          )}
        </div>
        {saveError && status === 'error' && (
          <p role="alert" className="bg-red-50 px-4 py-1.5 text-center text-xs text-red-700">
            {saveError} — your edits are still here and will be retried.
          </p>
        )}
        {!readOnly && editor && <Toolbar editor={editor} />}
      </header>

      <main className="mx-auto my-6 max-w-4xl rounded-lg bg-white px-6 py-8 shadow-sm ring-1 ring-slate-200 sm:px-12">
        <EditorContent editor={editor} />
      </main>
      {sharing && <ShareDialog documentId={doc.id} onClose={closeSharing} />}
    </Shell>
  );
}
