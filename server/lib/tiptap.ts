/**
 * Helpers for TipTap/ProseMirror JSON documents.
 *
 * The video/filter-list descriptions are authored in TipTap and persisted as JSON.
 * A plaintext mirror (`*_text`) is derived on write to back the student filter
 * (TECHNICAL_SPEC.md §4.2, §6). This module extracts that plaintext.
 */

/** A minimal structural shape of a ProseMirror node; we only read text/children. */
interface ProseMirrorNode {
  type?: string;
  text?: string;
  content?: ProseMirrorNode[];
}

/**
 * Recursively collects the text content of a TipTap JSON document, inserting
 * spaces between block-level nodes so adjacent words don't run together when
 * matched by the filter.
 */
export function extractPlainText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return '';
  const parts: string[] = [];

  const walk = (node: ProseMirrorNode): void => {
    if (typeof node.text === 'string') parts.push(node.text);
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
      // Separate block boundaries with whitespace.
      parts.push(' ');
    }
  };

  walk(doc as ProseMirrorNode);
  return parts.join('').replace(/\s+/g, ' ').trim();
}
