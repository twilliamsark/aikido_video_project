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
  marks?: { type?: string }[];
  attrs?: Record<string, unknown>;
}

/**
 * The restricted schema (must match the editor's — TECHNICAL_SPEC.md §8.4).
 * Anything outside these sets is dropped during sanitization.
 */
const ALLOWED_NODES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'listItem',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
]);
const ALLOWED_MARKS = new Set(['bold', 'italic', 'code']);

interface CleanNode {
  type: string;
  text?: string;
  attrs?: { level: number };
  marks?: { type: string }[];
  content?: CleanNode[];
}

function sanitizeNode(node: ProseMirrorNode): CleanNode | null {
  if (!node || typeof node !== 'object') return null;
  const type = node.type;
  if (typeof type !== 'string' || !ALLOWED_NODES.has(type)) return null;

  const out: CleanNode = { type };
  if (typeof node.text === 'string') out.text = node.text;

  if (type === 'heading') {
    const level = Number(node.attrs?.['level']);
    out.attrs = { level: level === 2 || level === 3 ? level : 1 };
  }

  if (Array.isArray(node.marks)) {
    const marks = node.marks
      .filter((m) => m && typeof m.type === 'string' && ALLOWED_MARKS.has(m.type))
      .map((m) => ({ type: m.type as string }));
    if (marks.length) out.marks = marks;
  }

  if (Array.isArray(node.content)) {
    const content = node.content.map(sanitizeNode).filter((n): n is CleanNode => n !== null);
    if (content.length) out.content = content;
  }
  return out;
}

/**
 * Sanitizes an arbitrary (possibly hand-crafted) TipTap document down to the
 * allowed schema, dropping any disallowed nodes/marks/attrs. Guarantees a valid
 * `doc` root so the stored JSON can never carry unexpected formatting or fail to
 * render (TECHNICAL_SPEC.md §8.4, §9).
 */
export function sanitizeTipTap(doc: unknown): CleanNode {
  const empty: CleanNode = { type: 'doc', content: [] };
  if (!doc || typeof doc !== 'object') return empty;
  const root = sanitizeNode(doc as ProseMirrorNode);
  return root && root.type === 'doc' ? root : empty;
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
