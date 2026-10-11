import { generateJSON } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import mammoth from 'mammoth';
import { marked } from 'marked';
import path from 'node:path';
import { HttpError } from '../errors.js';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'] as const;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export interface ImportedDocument {
  title: string;
  content: { type: 'doc'; content?: Record<string, unknown>[] };
}

const bad = (message: string, status = 400) => new HttpError(status, 'IMPORT_FAILED', message);

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Plain text: blank-line separated blocks become paragraphs, single newlines become line breaks. */
function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function decodeUtf8(buffer: Buffer): string {
  if (buffer.includes(0)) throw bad('This file looks binary, not text. Upload a plain-text or Markdown file.');
  return new TextDecoder('utf-8').decode(buffer).replace(/^﻿/, '');
}

async function toHtml(ext: string, buffer: Buffer): Promise<string> {
  if (ext === '.txt') return textToHtml(decodeUtf8(buffer));
  if (ext === '.md' || ext === '.markdown') {
    // Raw HTML in Markdown is passed to the Tiptap schema, which drops anything it doesn't support (e.g. scripts).
    return await marked.parse(decodeUtf8(buffer), { gfm: true, async: true });
  }
  // .docx files are zip archives, which always start with "PK".
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw bad('This file is not a valid .docx document.');
  }
  try {
    const result = await mammoth.convertToHtml({ buffer }, { styleMap: ['u => u'] });
    return result.value;
  } catch {
    throw bad('Could not read this .docx file. It may be corrupted or password-protected.');
  }
}

/** True if any text node (or hard break between text) carries non-whitespace characters. */
function hasText(node: { text?: unknown; content?: unknown }): boolean {
  if (typeof node.text === 'string' && node.text.trim()) return true;
  return Array.isArray(node.content) && node.content.some((c) => hasText(c as { text?: unknown; content?: unknown }));
}

export async function importFile(filename: string, buffer: Buffer): Promise<ImportedDocument> {
  const ext = path.extname(filename).toLowerCase();
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw bad(`Unsupported file type "${ext || 'none'}". Supported types: .txt, .md, .docx.`, 415);
  }
  if (buffer.length === 0) throw bad('The uploaded file is empty.');

  const html = await toHtml(ext, buffer);
  // Parsing with the same schema as the editor guarantees the result is valid, editable content.
  const content = generateJSON(html, [StarterKit]) as ImportedDocument['content'];
  if (!hasText(content)) throw bad('No readable content was found in this file.');

  const title = path.basename(filename, path.extname(filename)).trim().slice(0, 200) || 'Imported document';
  return { title, content };
}
