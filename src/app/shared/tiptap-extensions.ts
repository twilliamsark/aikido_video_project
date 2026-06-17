import StarterKit from '@tiptap/starter-kit';
import type { Extensions } from '@tiptap/core';

/**
 * The restricted rich-text schema for video/filter-list descriptions
 * (TECHNICAL_SPEC.md §8.4). Single source of truth shared by the editor and the
 * read-only renderer so authored content and rendered output always agree.
 *
 * Allowed: bold, italic, headings (1–3) + paragraph, bullet lists, inline code,
 * code blocks, horizontal rule. Everything else StarterKit bundles
 * (strike, ordered lists, blockquote, link, underline) is disabled so pasted or
 * imported content can't introduce formatting outside the allowed set.
 */
export function richTextExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      strike: false,
      orderedList: false,
      blockquote: false,
      link: false,
      underline: false,
    }),
  ];
}
