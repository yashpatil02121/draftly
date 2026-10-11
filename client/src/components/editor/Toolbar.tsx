import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import type { ReactNode } from 'react';

function Btn({ active, disabled, onClick, label, children }: {
  active?: boolean; disabled?: boolean; onClick: () => void; label: string; children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // mousedown keeps the editor selection from being lost when clicking toolbar buttons
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`h-8 min-w-8 rounded-md px-2 text-sm transition-colors disabled:opacity-40 ${
        active ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />;

export function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const run = () => editor.chain().focus();

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-3 py-1.5">
      <Btn label="Undo" disabled={!s.canUndo} onClick={() => run().undo().run()}>↶</Btn>
      <Btn label="Redo" disabled={!s.canRedo} onClick={() => run().redo().run()}>↷</Btn>
      <Divider />
      <Btn label="Heading 1" active={s.h1} onClick={() => run().toggleHeading({ level: 1 }).run()}><b>H1</b></Btn>
      <Btn label="Heading 2" active={s.h2} onClick={() => run().toggleHeading({ level: 2 }).run()}><b>H2</b></Btn>
      <Btn label="Heading 3" active={s.h3} onClick={() => run().toggleHeading({ level: 3 }).run()}><b>H3</b></Btn>
      <Divider />
      <Btn label="Bold (Ctrl+B)" active={s.bold} onClick={() => run().toggleBold().run()}><b>B</b></Btn>
      <Btn label="Italic (Ctrl+I)" active={s.italic} onClick={() => run().toggleItalic().run()}><i>I</i></Btn>
      <Btn label="Underline (Ctrl+U)" active={s.underline} onClick={() => run().toggleUnderline().run()}><u>U</u></Btn>
      <Divider />
      <Btn label="Bulleted list" active={s.bullet} onClick={() => run().toggleBulletList().run()}>• List</Btn>
      <Btn label="Numbered list" active={s.ordered} onClick={() => run().toggleOrderedList().run()}>1. List</Btn>
    </div>
  );
}
