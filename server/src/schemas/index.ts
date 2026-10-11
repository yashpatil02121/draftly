import { z } from 'zod';

/** Tiptap/ProseMirror JSON document. Node internals are validated by the editor, not here. */
export const docContentSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const idParams = z.object({ id: z.string().uuid() });

export const createDocumentBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: docContentSchema.optional(),
});

export const updateDocumentBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    content: docContentSchema.optional(),
  })
  .refine((b) => b.title !== undefined || b.content !== undefined, {
    message: 'Provide at least one of: title, content',
  });
