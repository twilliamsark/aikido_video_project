import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { JSONContent } from '@tiptap/core';
import { VideoService } from '../../core/video.service';
import { VideoInput } from '../../core/models';
import { RichTextEditorComponent } from '../../shared/rich-text-editor.component';
import { RichTextViewerComponent } from '../../shared/rich-text-viewer.component';

/**
 * Create/edit a video entry (TECHNICAL_SPEC.md §8.2, §8.4).
 *
 * The description is authored with the restricted TipTap editor and persisted as
 * JSON; the server derives the plaintext mirror used by the student filter.
 */
@Component({
  selector: 'app-video-form',
  imports: [FormsModule, RouterLink, RichTextEditorComponent, RichTextViewerComponent],
  template: `
    <div class="mx-auto max-w-2xl p-6">
      <a routerLink="/admin/videos" class="text-sm text-gray-500 hover:underline">← Back to videos</a>
      <h1 class="mb-6 mt-2 text-2xl font-semibold text-gray-900">
        {{ isNew() ? 'New video' : 'Edit video' }}
      </h1>

      @if (loading()) {
        <p class="text-gray-500">Loading…</p>
      } @else {
        <form (ngSubmit)="save()" class="space-y-5">
          <label class="block">
            <span class="text-sm font-medium text-gray-700">Title</span>
            <input
              name="title"
              [(ngModel)]="title"
              required
              class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>

          <label class="block">
            <span class="text-sm font-medium text-gray-700">YouTube URL</span>
            <input
              name="youtubeUrl"
              [(ngModel)]="youtubeUrl"
              required
              placeholder="https://youtu.be/…"
              class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>

          <label class="block">
            <span class="text-sm font-medium text-gray-700">Keywords</span>
            <input
              name="keywords"
              [(ngModel)]="keywordsCsv"
              placeholder="ikkyo, omote, suwariwaza"
              class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <span class="mt-1 block text-xs text-gray-400">Comma-separated.</span>
          </label>

          <div class="block">
            <div class="mb-1 flex items-center justify-between">
              <span class="text-sm font-medium text-gray-700">Description</span>
              <button
                type="button"
                (click)="showPreview.set(!showPreview())"
                class="text-xs text-indigo-600 hover:underline"
              >
                {{ showPreview() ? 'Edit' : 'Preview' }}
              </button>
            </div>
            @if (showPreview()) {
              <div class="rounded-md border border-gray-200 bg-gray-50 px-1">
                <app-rich-text-viewer [doc]="descriptionDoc()" />
              </div>
            } @else {
              <app-rich-text-editor [value]="descriptionDoc()" (valueChange)="descriptionDoc.set($event)" />
            }
          </div>

          @if (errorMsg()) {
            <p class="text-sm text-red-600">{{ errorMsg() }}</p>
          }

          <div class="flex items-center gap-3">
            <button
              type="submit"
              [disabled]="busy()"
              class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {{ busy() ? 'Saving…' : 'Save' }}
            </button>
            <a routerLink="/admin/videos" class="text-sm text-gray-500 hover:underline">Cancel</a>
          </div>
        </form>
      }
    </div>
  `,
})
export class VideoFormComponent {
  private readonly videoService = inject(VideoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly isNew = signal(true);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly errorMsg = signal<string | null>(null);

  protected readonly descriptionDoc = signal<JSONContent | null>(null);
  protected readonly showPreview = signal(false);

  protected title = '';
  protected youtubeUrl = '';
  protected keywordsCsv = '';

  private id: string | null = null;

  constructor() {
    const param = this.route.snapshot.paramMap.get('id');
    if (param && param !== 'new') {
      this.id = param;
      this.isNew.set(false);
      this.loadExisting(param);
    }
  }

  private loadExisting(id: string): void {
    this.loading.set(true);
    this.videoService.get(id).subscribe({
      next: (v) => {
        this.title = v.title;
        this.youtubeUrl = v.youtubeUrl;
        this.keywordsCsv = v.keywords.join(', ');
        this.descriptionDoc.set((v.descriptionJson as JSONContent | null) ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.errorMsg.set('Failed to load video.');
        this.loading.set(false);
      },
    });
  }

  private parseKeywords(): string[] {
    return this.keywordsCsv
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }

  /** True if the TipTap doc has any text or a horizontal rule (i.e. not blank). */
  private docHasContent(node: JSONContent | null): boolean {
    if (!node) return false;
    if (typeof node.text === 'string' && node.text.trim().length > 0) return true;
    if (node.type === 'horizontalRule') return true;
    return Array.isArray(node.content) && node.content.some((c) => this.docHasContent(c));
  }

  save(): void {
    this.busy.set(true);
    this.errorMsg.set(null);

    const doc = this.descriptionDoc();
    const input: VideoInput = {
      title: this.title.trim(),
      youtubeUrl: this.youtubeUrl.trim(),
      descriptionJson: this.docHasContent(doc) ? doc : null,
      keywords: this.parseKeywords(),
    };

    const request$ = this.isNew()
      ? this.videoService.create(input)
      : this.videoService.update(this.id!, input);

    request$.subscribe({
      next: () => this.router.navigate(['/admin/videos']),
      error: (err) => {
        this.errorMsg.set(err?.error?.error?.message ?? 'Failed to save video.');
        this.busy.set(false);
      },
    });
  }
}
