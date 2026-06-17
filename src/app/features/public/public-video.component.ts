import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PublicVideoService } from '../../core/public-video.service';
import { RichTextViewerComponent } from '../../shared/rich-text-viewer.component';
import { PublicHeaderComponent } from '../../shared/public-header.component';
import type { JSONContent } from '@tiptap/core';

const EMBED_PREFIX = 'https://www.youtube-nocookie.com/embed/';

/** Just enough of a video to render the player + description. */
interface PlayableVideo {
  title: string;
  embedUrl: string;
  descriptionJson: unknown | null;
  keywords: string[];
}

/**
 * Public single-video page (TECHNICAL_SPEC.md §5.2, §8.3): embedded YouTube
 * player (privacy-enhanced domain) plus the rendered rich-text description.
 *
 * Two routes resolve here: /v/:token (an individually-shared video) and
 * /list/:token/v/:videoId (a video reachable through a shared filter list).
 * Unknown/inactive links render a not-found message.
 */
@Component({
  selector: 'app-public-video',
  imports: [RouterLink, RichTextViewerComponent, PublicHeaderComponent],
  template: `
    <app-public-header />
    <div class="mx-auto max-w-3xl p-6">
      <a [routerLink]="backLink()" class="text-sm text-gray-500 hover:underline">← Back</a>

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

  protected readonly video = signal<PlayableVideo | null>(null);
  protected readonly loading = signal(true);

  private readonly listToken = this.route.snapshot.paramMap.get('listToken');

  protected readonly descriptionDoc = computed(
    () => (this.video()?.descriptionJson as JSONContent | null) ?? null,
  );

  /** Only trust embed URLs on the expected privacy-enhanced YouTube domain. */
  protected readonly safeEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.video()?.embedUrl ?? '';
    if (!url.startsWith(EMBED_PREFIX)) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected backLink(): unknown[] {
    return this.listToken ? ['/list', this.listToken] : ['/videos'];
  }

  constructor() {
    const params = this.route.snapshot.paramMap;
    const videoId = params.get('videoId');
    const token = params.get('token');
    // Three entry points:
    //   /list/:listToken/v/:videoId -> list-scoped playback
    //   /watch/:videoId             -> any video (library is public)
    //   /v/:token                   -> individual vanity share link
    const request$ = this.listToken
      ? this.service.getListVideo(this.listToken, videoId!)
      : videoId
        ? this.service.getById(videoId)
        : this.service.getByToken(token!);

    request$.subscribe({
      next: (v) => {
        this.video.set(v);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
