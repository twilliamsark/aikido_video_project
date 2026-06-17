/**
 * Request validation schemas for video entries (TECHNICAL_SPEC.md §7.4).
 *
 * `descriptionJson` is the TipTap document (validated structurally, not by full
 * schema). The server derives `descriptionText` from it; clients may also send a
 * plaintext description directly (used in milestone 3 before the TipTap editor).
 */
import { z } from 'zod';

const keyword = z
  .string()
  .trim()
  .min(1, 'Keyword cannot be empty')
  .max(64, 'Keyword is too long');

const keywords = z
  .array(keyword)
  .max(50, 'Too many keywords')
  // Case-insensitive de-duplication, preserving first-seen order.
  .transform((list) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const k of list) {
      const key = k.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(k);
      }
    }
    return out;
  });

/** A TipTap document is an object; deeper validation is left to the editor schema. */
const descriptionJson = z.record(z.string(), z.unknown()).nullable();

export const createVideoSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  youtubeUrl: z.string().trim().min(1, 'YouTube URL is required'),
  descriptionJson: descriptionJson.optional(),
  descriptionText: z.string().nullable().optional(),
  keywords: keywords.optional().default([]),
});

/** PATCH semantics: every field optional; only provided fields are updated. */
export const updateVideoSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    youtubeUrl: z.string().trim().min(1),
    descriptionJson: descriptionJson,
    descriptionText: z.string().nullable(),
    keywords: keywords,
  })
  .partial();

export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;
