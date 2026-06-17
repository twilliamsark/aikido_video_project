import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { generateHTML } from '@tiptap/html';
import type { JSONContent } from '@tiptap/core';
import { richTextExtensions } from './tiptap-extensions';

/**
 * Read-only renderer for a TipTap document (TECHNICAL_SPEC.md §8.4). Generates
 * HTML from the same restricted schema as the editor, then binds it via
 * `[innerHTML]`, which Angular sanitizes (no script/style passthrough).
 */
@Component({
  selector: 'app-rich-text-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="prose-rte" [innerHTML]="html()"></div>`,
})
export class RichTextViewerComponent {
  readonly doc = input<JSONContent | null>(null);

  protected readonly html = computed(() => {
    const d = this.doc();
    if (!d) return '';
    try {
      return generateHTML(d, richTextExtensions());
    } catch {
      return '';
    }
  });
}
