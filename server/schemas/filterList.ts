/**
 * Request validation for filter lists (TECHNICAL_SPEC.md §6.3, §7.3).
 * Mirrors the video description handling: TipTap JSON + optional plaintext.
 */
import { z } from 'zod';

const criteria = z.object({
  query: z.string().trim().nullable().default(null),
  keywords: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
  sort: z
    .object({
      field: z.enum(['title', 'createdAt']).default('createdAt'),
      dir: z.enum(['asc', 'desc']).default('desc'),
    })
    .default({ field: 'createdAt', dir: 'desc' }),
});

const descriptionJson = z.record(z.string(), z.unknown()).nullable();

export const createFilterListSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  descriptionJson: descriptionJson.optional(),
  descriptionText: z.string().nullable().optional(),
  criteria: criteria,
});

export const updateFilterListSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    descriptionJson: descriptionJson,
    descriptionText: z.string().nullable(),
    criteria: criteria,
  })
  .partial();

export type CreateFilterListInput = z.infer<typeof createFilterListSchema>;
export type UpdateFilterListInput = z.infer<typeof updateFilterListSchema>;
