import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PublicVideoService } from '../../core/public-video.service';
import { PublicVideo } from '../../core/models';
import { RichTextViewerComponent } from '../../shared/rich-text-viewer.component';
import type { JSONContent } from '@tiptap/core';

const EMBED_PREFIX = 'https://www.youtube-nocookie.com/embed/';

/**
 * Public single-video page (TECHNICAL_SPEC.md §5.2, §8.3): embedded YouTube
 * player (privacy-enhanced domain) plus the rendered rich-text description.
 * Resolved by share token; unknown/inactive tokens render a not-found message.
 */
@Component({
  selector: 'app-public-video',
  imports: [RouterLink, RichTextViewerComponent],
  template: `
    <div class="mx-auto max-w-3xl p-6">
      <a routerLink="/videos" class="text-sm text-gray-500 hover:underline">← All videos</a>

      @if (loading()) {
        <p class="mt-4 text-gray-500">Loading…</p>
      } @else if (!video()) {
        <div class="mt-8 rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
          This video isn’t available. The share link may have been turned off.
        </div>
      } @else {
        <h1 class="mb-4 mt-2 text-2xl font-semibold text-gray-900">{{ video()!.title }}</h1>

        <div class="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe
            [src]="safeEmbedUrl()"
            class="h-full w-full"
            title="YouTube video player"
            frameborder="0"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>
        </div>

        @if (video()!.keywords.length) {
          <div class="mt-4 flex flex-wrap gap-1">
            @for (kw of video()!.keywords; track kw) {
              <span class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{{ kw }}</span>
            }
          </div>
        }

        @if (video()!.descriptionJson) {
          <div class="mt-6 border-t border-gray-100 pt-4">
            <app-rich-text-viewer [doc]="descriptionDoc()" />
          </div>
        }
      }
    </div>
  `,
})
export class PublicVideoComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(PublicVideoService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly video = signal<PublicVideo | null>(null);
  protected readonly loading = signal(true);

  protected readonly descriptionDoc = computed(
    () => (this.video()?.descriptionJson as JSONContent | null) ?? null,
  );

  /** Only trust embed URLs on the expected privacy-enhanced YouTube domain. */
  protected readonly safeEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.video()?.embedUrl ?? '';
    if (!url.startsWith(EMBED_PREFIX)) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  constructor() {
    const token = this.route.snapshot.paramMap.get('token')!;
    this.service.getByToken(token).subscribe({
      next: (v) => {
        this.video.set(v);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
