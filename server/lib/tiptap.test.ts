import { test, expect, describe } from 'bun:test';
import { extractPlainText, sanitizeTipTap } from './tiptap';

describe('extractPlainText', () => {
  test('collects text across blocks with spacing', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Entry' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Blend then cut.' }] },
      ],
    };
    expect(extractPlainText(doc)).toBe('Entry Blend then cut.');
  });
});

describe('sanitizeTipTap', () => {
  test('keeps allowed nodes and marks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'hi' }] },
      ],
    };
    expect(sanitizeTipTap(doc)).toEqual(doc as never);
  });

  test('drops disallowed marks (e.g. strike, link)', () => {
    const clean = sanitizeTipTap({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', marks: [{ type: 'strike' }, { type: 'bold' }], text: 'x' },
          ],
        },
      ],
    });
    const marks = clean.content?.[0]?.content?.[0]?.marks ?? [];
    expect(marks).toEqual([{ type: 'bold' }]);
  });

  test('drops disallowed nodes (e.g. orderedList, blockquote, image)', () => {
    const clean = sanitizeTipTap({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'keep' }] },
        { type: 'orderedList', content: [{ type: 'listItem' }] },
        { type: 'image', attrs: { src: 'javascript:alert(1)' } },
        { type: 'blockquote', content: [{ type: 'paragraph' }] },
      ],
    });
    expect(clean.content?.map((n) => n.type)).toEqual(['paragraph']);
  });

  test('clamps heading levels to 1–3', () => {
    const clean = sanitizeTipTap({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 6 }, content: [{ type: 'text', text: 'h' }] }],
    });
    expect(clean.content?.[0]?.attrs).toEqual({ level: 1 });
  });

  test('always returns a doc root, even for garbage input', () => {
    expect(sanitizeTipTap(null)).toEqual({ type: 'doc', content: [] });
    expect(sanitizeTipTap({ type: 'paragraph' })).toEqual({ type: 'doc', content: [] });
    expect(sanitizeTipTap('nope' as unknown)).toEqual({ type: 'doc', content: [] });
  });
});
