import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { Editor, type JSONContent } from '@tiptap/core';
import { richTextExtensions } from './tiptap-extensions';

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

interface ActiveState {
  bold: boolean;
  italic: boolean;
  h1: boolean;
  h2: boolean;
  h3: boolean;
  paragraph: boolean;
  bulletList: boolean;
  code: boolean;
  codeBlock: boolean;
}

const NO_ACTIVE: ActiveState = {
  bold: false,
  italic: false,
  h1: false,
  h2: false,
  h3: false,
  paragraph: false,
  bulletList: false,
  code: false,
  codeBlock: false,
};

/**
 * TipTap rich-text editor with a restricted toolbar (TECHNICAL_SPEC.md §8.4).
 * Two-way binds a TipTap JSON document via the `value` model. Zoneless-safe:
 * toolbar state is held in a signal updated on every editor transaction.
 */
@Component({
  selector: 'app-rich-text-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overflow-hidden rounded-md border border-gray-300 focus-within:border-indigo-500">
      <div class="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 p-1.5">
        <button type="button" title="Bold" (click)="cmd((c) => c.toggleBold())"
          [class.bg-gray-200]="active().bold" class="tb">B</button>
        <button type="button" title="Italic" (click)="cmd((c) => c.toggleItalic())"
          [class.bg-gray-200]="active().italic" class="tb italic">I</button>
        <span class="mx-1 w-px bg-gray-300"></span>
        <button type="button" title="Heading 1" (click)="cmd((c) => c.toggleHeading({ level: 1 }))"
          [class.bg-gray-200]="active().h1" class="tb">H1</button>
        <button type="button" title="Heading 2" (click)="cmd((c) => c.toggleHeading({ level: 2 }))"
          [class.bg-gray-200]="active().h2" class="tb">H2</button>
        <button type="button" title="Heading 3" (click)="cmd((c) => c.toggleHeading({ level: 3 }))"
          [class.bg-gray-200]="active().h3" class="tb">H3</button>
        <button type="button" title="Normal text" (click)="cmd((c) => c.setParagraph())"
          [class.bg-gray-200]="active().paragraph" class="tb">¶</button>
        <span class="mx-1 w-px bg-gray-300"></span>
        <button type="button" title="Bullet list" (click)="cmd((c) => c.toggleBulletList())"
          [class.bg-gray-200]="active().bulletList" class="tb">• List</button>
        <button type="button" title="Inline code" (click)="cmd((c) => c.toggleCode())"
          [class.bg-gray-200]="active().code" class="tb font-mono">&lt;/&gt;</button>
        <button type="button" title="Code block" (click)="cmd((c) => c.toggleCodeBlock())"
          [class.bg-gray-200]="active().codeBlock" class="tb font-mono">{{ '{ }' }}</button>
        <button type="button" title="Horizontal rule" (click)="cmd((c) => c.setHorizontalRule())"
          class="tb">—</button>
      </div>
      <div #host class="rte-content"></div>
    </div>
  `,
  styles: [
    `
      .tb {
        min-width: 1.9rem;
        padding: 0.15rem 0.4rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        color: #374151;
        cursor: pointer;
      }
      .tb:hover {
        background: #e5e7eb;
      }
    `,
  ],
})
export class RichTextEditorComponent implements OnDestroy {
  /** Two-way bound TipTap document. Null/empty renders an empty paragraph. */
  readonly value = model<JSONContent | null>(null);

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  protected readonly active = signal<ActiveState>(NO_ACTIVE);

  private editor?: Editor;
  private applyingExternal = false;

  constructor() {
    afterNextRender(() => {
      this.editor = new Editor({
        element: this.host().nativeElement,
        extensions: richTextExtensions(),
        content: this.value() ?? EMPTY_DOC,
        editorProps: {
          attributes: { class: 'prose-rte focus:outline-none' },
        },
        onTransaction: () => this.syncActive(),
        onUpdate: () => {
          this.applyingExternal = true;
          this.value.set(this.editor!.getJSON());
          this.applyingExternal = false;
        },
      });
      this.syncActive();
    });

    // Push external value changes (e.g. loading an existing video) into the editor.
    effect(() => {
      const next = this.value();
      if (!this.editor || this.applyingExternal) return;
      const current = JSON.stringify(this.editor.getJSON());
      if (current !== JSON.stringify(next ?? EMPTY_DOC)) {
        this.editor.commands.setContent(next ?? EMPTY_DOC, { emitUpdate: false });
        this.syncActive();
      }
    });
  }

  /** Runs a chained command focused on the editor (used by toolbar buttons). */
  protected cmd(fn: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>): void {
    if (!this.editor) return;
    fn(this.editor.chain().focus()).run();
  }

  private syncActive(): void {
    const e = this.editor;
    if (!e) return;
    this.active.set({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      paragraph: e.isActive('paragraph'),
      bulletList: e.isActive('bulletList'),
      code: e.isActive('code'),
      codeBlock: e.isActive('codeBlock'),
    });
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
  }
}
